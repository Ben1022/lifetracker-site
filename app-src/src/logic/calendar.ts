// Calendar helpers: ports of CalendarLayout.swift, EventMuting.swift and the duplicate merge in
// GoogleCalendarConnector.swift, plus hand-added event changes.
import { iso, tombstoneKey, type MuteKind, type SyncDocument, type SyncEvent, type SyncMuteRule } from '../sync/document'
import { addDays, startOfDay } from './dates'

/** An event on screen: from Google Calendar or hand-added (the sync file). */
export interface CalendarEvent {
  id: string
  source: 'google' | 'manual'
  title: string
  start: Date
  end: Date
  isAllDay: boolean
  location?: string
  calendarName?: string
  notes: string
  seriesID?: string
  colorHex?: string
}

export const isEditable = (event: CalendarEvent) => event.source === 'manual'

export function fromSync(event: SyncEvent): CalendarEvent {
  return {
    id: event.id, source: 'manual', title: event.title, start: new Date(event.start), end: new Date(event.end),
    isAllDay: event.isAllDay, location: event.location, notes: event.notes,
  }
}

/** The same meeting often sits on two calendars. Keeps the first copy of each title + start + end. */
export function mergeDuplicates<E extends { title: string; start: Date; end: Date }>(entries: E[]): E[] {
  const seen = new Set<string>()
  return entries.filter(entry => {
    const key = `${entry.title.trim().toLowerCase()}|${entry.start.getTime()}|${entry.end.getTime()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// MARK: Muting

export function ruleMatches(rule: SyncMuteRule, title: string, seriesID?: string): boolean {
  const value = rule.value.trim()
  if (!value) return false
  switch (rule.kind) {
    case 'series': return seriesID === value
    case 'title': return title.trim().toLowerCase() === value.toLowerCase()
    default: return title.toLowerCase().includes(value.toLowerCase())
  }
}

export const isMuted = (event: CalendarEvent, rules: SyncMuteRule[]) => rules.some(r => ruleMatches(r, event.title, event.seriesID))

export function makeRule(kind: MuteKind, value: string, label: string, now: Date): SyncMuteRule {
  const stamp = iso(now)
  return { id: `${kind}:${value.toLowerCase()}`, kind, value, label, createdAt: stamp, updatedAt: stamp }
}

/** "Don't mention in briefing": the whole series for a repeating event, else the same title. */
export function mute(doc: SyncDocument, event: CalendarEvent, now: Date = new Date()): SyncDocument {
  const rule = event.seriesID ? makeRule('series', event.seriesID, event.title, now) : makeRule('title', event.title, event.title, now)
  return { ...doc, muteRules: { ...doc.muteRules, [rule.id]: rule } }
}

export function addMuteKeyword(doc: SyncDocument, keyword: string, now: Date = new Date()): SyncDocument {
  const value = keyword.trim()
  if (!value) return doc
  const rule = makeRule('keyword', value, value, now)
  return { ...doc, muteRules: { ...doc.muteRules, [rule.id]: rule } }
}

export function deleteRules(doc: SyncDocument, ids: string[], now: Date = new Date()): SyncDocument {
  const next = { ...doc, muteRules: { ...doc.muteRules }, deleted: { ...doc.deleted } }
  for (const id of ids) {
    if (!next.muteRules[id]) continue
    delete next.muteRules[id]
    next.deleted[tombstoneKey('muteRule', id)] = iso(now)
  }
  return next
}

export function unmute(doc: SyncDocument, event: CalendarEvent, now: Date = new Date()): SyncDocument {
  const ids = Object.values(doc.muteRules).filter(r => ruleMatches(r, event.title, event.seriesID)).map(r => r.id)
  return deleteRules(doc, ids, now)
}

// MARK: Hand-added events

export interface EventInput {
  title: string
  start: Date
  end: Date
  isAllDay: boolean
  location?: string
  notes: string
}

export function saveEvent(doc: SyncDocument, input: EventInput, id: string | undefined, now: Date = new Date()): SyncDocument {
  const title = input.title.trim()
  if (!title) return doc
  const eventID = id ?? `manual:${crypto.randomUUID().toUpperCase()}`
  const event: SyncEvent = {
    id: eventID, title, start: iso(input.start), end: iso(input.end < input.start ? input.start : input.end),
    isAllDay: input.isAllDay, notes: input.notes, updatedAt: iso(now),
    ...(input.location?.trim() ? { location: input.location.trim() } : {}),
  }
  return { ...doc, events: { ...doc.events, [eventID]: event } }
}

export function deleteEvent(doc: SyncDocument, id: string, now: Date = new Date()): SyncDocument {
  if (!doc.events[id]) return doc
  const events = { ...doc.events }
  delete events[id]
  return { ...doc, events, deleted: { ...doc.deleted, [tombstoneKey('event', id)]: iso(now) } }
}

// MARK: Layout

export interface Slot { column: number; columns: number }

/** Side-by-side columns for overlapping events, like Apple Calendar. */
export function slots(items: { id: string; start: Date; end: Date }[]): Record<string, Slot> {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime())
  const result: Record<string, Slot> = {}
  let group: { id: string; column: number }[] = []
  let columnEnds: number[] = []
  let groupEnd = -Infinity
  const closeGroup = () => {
    for (const member of group) result[member.id] = { column: member.column, columns: columnEnds.length }
    group = []
    columnEnds = []
  }
  for (const item of sorted) {
    const start = item.start.getTime()
    if (group.length && start >= groupEnd) closeGroup()
    const end = Math.max(item.end.getTime(), start + 15 * 60_000)
    const free = columnEnds.findIndex(e => e <= start)
    if (free >= 0) {
      columnEnds[free] = end
      group.push({ id: item.id, column: free })
    } else {
      columnEnds.push(end)
      group.push({ id: item.id, column: columnEnds.length - 1 })
    }
    groupEnd = group.length === 1 ? end : Math.max(groupEnd, end)
  }
  if (group.length) closeGroup()
  return result
}

/** The seven days (Sunday first) of the week containing `date`. */
export function weekDays(date: Date): Date[] {
  const start = addDays(startOfDay(date), -startOfDay(date).getDay())
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Minutes from the start of `day`, clamped to that day. */
export function minutesInto(date: Date, day: Date): number {
  return Math.min(Math.max((date.getTime() - startOfDay(day).getTime()) / 60_000, 0), 24 * 60)
}

/** The 42 days (6 weeks) shown in a month grid. */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = addDays(first, -first.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function eventsOn(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const start = startOfDay(day), end = addDays(start, 1)
  return events.filter(e => e.start < end && e.end > start)
}
