// Keeps Google Calendar and Gmail current while the tab is open: at sign-in, every 5 minutes and
// when you come back to the tab. The Calendar page asks for other weeks as you browse.
import { AuthError } from '../auth'
import { addDays, startOfDay } from '../logic/dates'
import { google } from '../state'
import { fetchEvents } from './calendar'
import { fetchUnread } from './gmail'

let started = false

export function startGoogle() {
  if (started) return
  started = true
  void refreshGoogle()
  setInterval(() => void refreshGoogle(), 5 * 60_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refreshGoogle() })
}

export async function refreshGoogle() {
  const today = startOfDay(new Date())
  // Last week through the next month, like the Mac.
  await Promise.all([loadEvents(addDays(today, -7), addDays(today, 31), true), loadEmail()])
}

/** Makes sure the events between `start` and `end` are loaded. */
export function ensureEvents(start: Date, end: Date) {
  const covered = google.value.ranges.some(([s, e]) => s <= start.getTime() && e >= end.getTime())
  if (!covered) void loadEvents(start, end, false)
}

async function loadEvents(start: Date, end: Date, replaceRanges: boolean) {
  try {
    const fetched = await fetchEvents(start, end)
    const [s, e] = [start.getTime(), end.getTime()]
    const kept = google.value.events.filter(ev => ev.end.getTime() <= s || ev.start.getTime() >= e)
    const ranges: [number, number][] = replaceRanges ? [[s, e]] : [...google.value.ranges, [s, e]]
    const ids = new Set(fetched.map(f => f.id))
    google.value = {
      ...google.value, events: [...kept.filter(k => !ids.has(k.id)), ...fetched], ranges,
      calendarError: undefined, calendarSyncedAt: new Date(),
    }
  } catch (error) {
    if (!(error instanceof AuthError)) google.value = { ...google.value, calendarError: (error as Error).message }
  }
}

async function loadEmail() {
  try {
    const { emails, unreadCount } = await fetchUnread()
    google.value = { ...google.value, emails, unreadCount, gmailError: undefined, gmailSyncedAt: new Date(), gmailLoaded: true }
  } catch (error) {
    // Keep showing the last mail; the page shows a Reconnect banner.
    if (!(error instanceof AuthError)) google.value = { ...google.value, gmailError: (error as Error).message }
  }
}
