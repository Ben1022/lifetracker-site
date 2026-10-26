// Google Calendar, read-only, with the same queries as the Mac's GoogleCalendarConnector.
import { mergeDuplicates, type CalendarEvent } from '../logic/calendar'
import { getJSON } from './api'

interface CalendarInfo { id: string; name: string; colorHex?: string }

/** Selected, visible calendars, primary first (its copy wins when an event is on several). */
async function calendars(): Promise<CalendarInfo[]> {
  const data = await getJSON<{ items?: any[] }>('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader')
  const visible = (data.items ?? []).filter(c => c.selected && !c.hidden)
  return [...visible.filter(c => c.primary), ...visible.filter(c => !c.primary)]
    .map(c => ({ id: c.id, name: c.summaryOverride ?? c.summary ?? c.id, colorHex: c.backgroundColor }))
}

export async function fetchEvents(start: Date, end: Date): Promise<CalendarEvent[]> {
  const entries: CalendarEvent[] = []
  for (const calendar of await calendars()) {
    const params = new URLSearchParams({
      timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '2500',
    })
    const data = await getJSON<{ items?: any[] }>(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${params}`)
    entries.push(...parseEvents(data.items ?? [], calendar))
  }
  return mergeDuplicates(entries).sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** Skips cancelled events and ones you declined. */
export function parseEvents(items: any[], calendar: CalendarInfo): CalendarEvent[] {
  const result: CalendarEvent[] = []
  for (const item of items) {
    if (item.status === 'cancelled') continue
    if (item.attendees?.some((a: any) => a.self && a.responseStatus === 'declined')) continue
    const start = when(item.start), end = when(item.end)
    if (!start || !end) continue
    result.push({
      id: `google:${calendar.id}:${item.id}`, source: 'google', title: item.summary ?? '(No title)', start, end,
      isAllDay: !!item.start?.date, location: item.location, calendarName: calendar.name, notes: '',
      seriesID: item.recurringEventId, colorHex: calendar.colorHex,
    })
  }
  return result
}

function when(value: any): Date | undefined {
  if (value?.dateTime) return new Date(value.dateTime)
  if (value?.date) {
    // All-day dates are local calendar days ("2026-10-23").
    const [y, m, d] = String(value.date).split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return undefined
}
