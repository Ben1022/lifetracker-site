// Ports of NoteText.swift / NoteGroups, plus note changes.
import { dayString, iso, tombstoneKey, type SyncDocument, type SyncNote } from '../sync/document'
import { longDayText, shortDayText } from './dates'

const lines = (body: string) => body.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

/** The first non-empty line, without Markdown heading marks; undefined for an empty note. */
export function noteTitle(body: string): string | undefined {
  const first = lines(body)[0]
  return first === undefined ? undefined : first.replace(/^[# ]+/, '').slice(0, 120)
}

export const notePreview = (body: string): string | undefined => lines(body)[1]?.slice(0, 160)
export const isEmptyNote = (body: string) => body.trim() === ''

export function matchesSearch(note: SyncNote, search: string): boolean {
  const query = search.trim().toLowerCase()
  if (!query) return true
  if (note.body.toLowerCase().includes(query)) return true
  return !!note.day && longDayText(dayDate(note.day)).toLowerCase().includes(query)
}

export const dayDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function displayTitle(note: SyncNote): string {
  if (note.day) return `Daily Note · ${shortDayText(dayDate(note.day))}`
  return noteTitle(note.body) ?? 'New Note'
}

/** Pinned and other notes, newest edit first. Today's daily note is left out (it's always the top
 *  row), and so are past daily notes nobody wrote in. */
export function noteGroups(notes: SyncNote[], today: Date, search = ''): { pinned: SyncNote[]; others: SyncNote[] } {
  const todayKey = dayString(today)
  const visible = notes
    .filter(n => n.day !== todayKey)
    .filter(n => !n.day || !isEmptyNote(n.body))
    .filter(n => matchesSearch(n, search))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  return { pinned: visible.filter(n => n.isPinned), others: visible.filter(n => !n.isPinned) }
}

export const dailyNote = (doc: SyncDocument, day: Date) => Object.values(doc.notes).find(n => n.day === dayString(day))

/** The daily note for `day`, created if missing. New ones get the id "daily-YYYY-MM-DD", so a
 *  browser and the Mac creating the same day's note at once usually end up with one. */
export function ensureDailyNote(doc: SyncDocument, day: Date, now: Date = new Date()): { doc: SyncDocument; id: string } {
  const existing = dailyNote(doc, day)
  if (existing) return { doc, id: existing.id }
  const key = dayString(day)
  const id = doc.notes[`daily-${key}`] ? crypto.randomUUID().toUpperCase() : `daily-${key}`
  const stamp = iso(now)
  return { doc: { ...doc, notes: { ...doc.notes, [id]: { id, body: '', createdAt: stamp, updatedAt: stamp, isPinned: false, day: key } } }, id }
}

export function addNote(doc: SyncDocument, now: Date = new Date()): { doc: SyncDocument; id: string } {
  const id = crypto.randomUUID().toUpperCase()
  const stamp = iso(now)
  return { doc: { ...doc, notes: { ...doc.notes, [id]: { id, body: '', createdAt: stamp, updatedAt: stamp, isPinned: false } } }, id }
}

export function updateNote(doc: SyncDocument, id: string, change: Partial<Pick<SyncNote, 'body' | 'isPinned'>>, now: Date = new Date()): SyncDocument {
  const note = doc.notes[id]
  if (!note || (change.body === undefined || change.body === note.body) && (change.isPinned === undefined || change.isPinned === note.isPinned)) return doc
  return { ...doc, notes: { ...doc.notes, [id]: { ...note, ...change, updatedAt: iso(now) } } }
}

export function deleteNote(doc: SyncDocument, id: string, now: Date = new Date()): SyncDocument {
  if (!doc.notes[id]) return doc
  const notes = { ...doc.notes }
  delete notes[id]
  return { ...doc, notes, deleted: { ...doc.deleted, [tombstoneKey('note', id)]: iso(now) } }
}
