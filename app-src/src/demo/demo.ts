// Dev-only demo (`npm run dev`, then open /lifetracker-site/app/?demo): sample data behind a
// pretend Google Calendar, Gmail and Drive, so every page and the whole sync engine run without
// signing in. Never part of the built site. `window.demo` lets you play the Mac: read the Drive
// copy, or edit it as if the Mac had synced (`demo.macEdit(doc => …)`).
// ?demo&claude=off shows the app with Claude off on the Mac; ?demo&empty shows an empty Drive.
import { setTestToken } from '../auth'
import { setFetcher } from '../google/api'
import { startGoogle } from '../google/loader'
import { addDays, atTime, startOfDay } from '../logic/dates'
import { dayString, iso, parseDocument, serialize, type SyncDocument, type SyncTask } from '../sync/document'
import { startSync } from '../sync/engine'

const params = new URLSearchParams(location.search)

export function startDemo() {
  const drive = { file: params.has('empty') ? undefined as string | undefined : serialize(macDocument()), version: 1 }
  setTestToken('demo-token', 'you@example.com')
  setFetcher(async (url, init) => {
    await new Promise(r => setTimeout(r, 120))
    const u = new URL(url)
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (u.host === 'www.googleapis.com' && u.pathname.startsWith('/calendar/v3/users/me/calendarList')) {
      return json({ items: [
        { id: 'primary@example.com', primary: true, selected: true, summary: 'you@example.com', backgroundColor: '#4285F4' },
        { id: 'classes', selected: true, summary: 'Classes', backgroundColor: '#0F9D9A' },
      ] })
    }
    if (u.pathname.startsWith('/calendar/v3/calendars/')) {
      const calendar = decodeURIComponent(u.pathname.split('/')[4])
      return json({ items: googleEvents(calendar, new Date(u.searchParams.get('timeMin')!), new Date(u.searchParams.get('timeMax')!)) })
    }
    if (u.host === 'gmail.googleapis.com') {
      const id = u.pathname.split('/messages/')[1]
      if (!id) return json({ messages: MAIL.map(m => ({ id: m.id })), resultSizeEstimate: MAIL.length + 3 })
      return json(gmailMessage(MAIL.find(m => m.id === id)!))
    }
    if (u.pathname === '/drive/v3/files') return json({ files: drive.file ? [{ id: 'sync-file', version: String(drive.version) }] : [] })
    if (u.pathname === '/drive/v3/files/sync-file') {
      if (u.searchParams.get('alt') === 'media') return json(JSON.parse(drive.file!))
      return json({ id: 'sync-file', version: String(drive.version) })
    }
    if (u.pathname.startsWith('/upload/drive/v3/files')) {
      const body = String(init?.body ?? '')
      drive.file = u.searchParams.get('uploadType') === 'multipart' ? body.split('\r\n\r\n')[2].split('\r\n--')[0] : body
      drive.version++
      return json({ id: 'sync-file', version: String(drive.version) })
    }
    return new Response('Not in the demo', { status: 404 })
  })
  ;(window as any).demo = {
    drive: () => drive.file && parseDocument(JSON.parse(drive.file)),
    /** Pretend the Mac changed the sync file. */
    macEdit(edit: (doc: SyncDocument) => void) {
      const doc = parseDocument(JSON.parse(drive.file!))
      edit(doc)
      doc.writtenBy = 'mac-demo'
      doc.writtenAt = iso(new Date())
      drive.file = serialize(doc)
      drive.version++
    },
  }
  startSync()
  startGoogle()
}

// MARK: Sample data (like the Mac's PreviewData)

function macDocument(): SyncDocument {
  const now = new Date()
  const today = startOfDay(now)
  const stamp = iso(addDays(now, -1))
  const lists = [
    { id: 'L-SCHOOL', name: 'School', colorHex: '#2F6BFF', sortIndex: 0 },
    { id: 'L-ERRANDS', name: 'Errands', colorHex: '#2E9E5B', sortIndex: 1 },
    { id: 'L-OTHER', name: 'Other', colorHex: '#5E6370', sortIndex: 2 },
  ]
  let index = 0
  const task = (id: string, title: string, listID: string, due?: Date, extra: Partial<SyncTask> = {}): SyncTask => ({
    id, title, notes: '', dueHasTime: false, isDone: false, sortIndex: index++, createdAt: stamp, listID, priority: 4, updatedAt: stamp,
    ...(due ? { due: iso(due) } : {}), ...extra,
  })
  const tasks = [
    task('T1', 'Problem set 5', 'L-SCHOOL', atTime(addDays(today, -1), 23, 59), { dueHasTime: true, priority: 1 }),
    task('T2', 'Read chapter 4', 'L-SCHOOL', today, { priority: 2 }),
    task('T3', 'Quiz review', 'L-SCHOOL', atTime(today, 17, 0), { dueHasTime: true, priority: 1, notes: 'Chapters 1–3' }),
    task('T4', 'Pick up dry cleaning', 'L-ERRANDS', addDays(today, 1)),
    task('T5', 'Gym', 'L-OTHER', atTime(today, 7, 30), { dueHasTime: true, repeatRule: 'daily', priority: 3 }),
    task('T6', 'Essay draft', 'L-SCHOOL', addDays(today, 3), { priority: 2 }),
    task('T7', 'Call the bank', 'L-OTHER', addDays(today, 5)),
    task('T8', 'Groceries', 'L-ERRANDS'),
    task('T9', 'Gym', 'L-OTHER', atTime(addDays(today, -1), 7, 30), { dueHasTime: true, isDone: true, completedAt: stamp, seriesTaskID: 'T5', priority: 3 }),
    task('T10', 'Submit lab report', 'L-SCHOOL', addDays(today, -2), { isDone: true, completedAt: iso(addDays(now, -2)) }),
  ]
  const day = dayString(today)
  return {
    schemaVersion: 1, writtenAt: stamp, writtenBy: 'mac-demo',
    tasks: Object.fromEntries(tasks.map(t => [t.id, t])),
    lists: Object.fromEntries(lists.map(l => [l.id, { ...l, createdAt: stamp, updatedAt: stamp }])),
    notes: {
      N1: { id: 'N1', body: 'Trip ideas\nLake Tahoe in December, or Big Sur.', createdAt: stamp, updatedAt: stamp, isPinned: true },
      N2: { id: 'N2', body: 'Gift list\nMom: scarf. Sam: book.', createdAt: stamp, updatedAt: iso(addDays(now, -3)), isPinned: false },
      [`daily-${dayString(addDays(today, -1))}`]: { id: `daily-${dayString(addDays(today, -1))}`, body: 'Good study day.\nFinished most of the problem set.', createdAt: stamp, updatedAt: stamp, isPinned: false, day: dayString(addDays(today, -1)) },
    },
    events: {
      'manual:E1': { id: 'manual:E1', title: 'Dinner with Sam', start: iso(atTime(today, 19, 0)), end: iso(atTime(today, 20, 30)), isAllDay: false, location: 'Nopa', notes: '', updatedAt: stamp },
    },
    muteRules: {
      'series:lecture-series': { id: 'series:lecture-series', kind: 'series', value: 'lecture-series', label: 'UGBA 102A Lecture', createdAt: stamp, updatedAt: stamp },
    },
    emailSorting: {
      m1: { category: 'needsReply', summary: 'Sarah asks whether you can meet Thursday to go over the project.', manual: false, updatedAt: stamp },
      m2: { category: 'needsReply', manual: false, updatedAt: stamp },
      m3: { category: 'fyi', summary: 'Your package arrives tomorrow.', manual: false, updatedAt: stamp },
      m4: { category: 'newsletter', manual: false, updatedAt: stamp },
    },
    briefings: {
      [day]: {
        day, generatedAt: iso(atTime(today, 7, 0)), source: 'claude', warnings: [],
        bullets: [
          'Busy morning: Team standup at 9 and your 11 AM lecture back to back.',
          'Problem set 5 was due last night. Finish it first.',
          'Sarah is waiting on a reply about meeting Thursday.',
        ],
        suggestedTasks: ['Finish problem set 5', 'Reply to Sarah', 'Review for the 5 PM quiz'],
      },
    },
    settings: {
      userName: 'Jordan', accentColor: '#5B3FD9', sidebarStyle: 'neutral', hideMuted: false,
      defaultListID: 'L-OTHER', claudeEnabled: params.get('claude') !== 'off', updatedAt: stamp,
    },
    deleted: {},
  }
}

function googleEvents(calendar: string, start: Date, end: Date): any[] {
  const items: any[] = []
  for (let d = startOfDay(start); d < end; d = addDays(d, 1)) {
    const key = dayString(d)
    const timed = (id: string, summary: string, h: number, m: number, minutes: number, extra: object = {}) => {
      const s = atTime(d, h, m)
      items.push({ id: `${id}-${key}`, summary, start: { dateTime: s.toISOString() }, end: { dateTime: new Date(s.getTime() + minutes * 60_000).toISOString() }, ...extra })
    }
    const weekday = d.getDay()
    if (calendar === 'classes' && weekday >= 1 && weekday <= 5 && weekday % 2 === 1) {
      timed('lecture', 'UGBA 102A Lecture', 11, 0, 80, { recurringEventId: 'lecture-series', location: 'Haas F295' })
    }
    if (calendar === 'primary@example.com') {
      if (weekday >= 1 && weekday <= 5) timed('standup', 'Team Standup', 9, 0, 30, { recurringEventId: 'standup-series' })
      if (weekday === 2 || weekday === 4) timed('office', 'Office Hours', 14, 0, 60, { location: 'Room 210' })
      if (weekday === 3) timed('lunch', 'Lunch with Alex', 12, 30, 60)
      if (weekday === 3) timed('review', 'Design Review', 12, 45, 45)
      if (d.getDate() === 1) items.push({ id: `rent-${key}`, summary: 'Rent due', start: { date: key }, end: { date: dayString(addDays(d, 1)) } })
    }
  }
  return items
}

const MAIL = [
  { id: 'm1', thread: 't1', from: 'Sarah Lee <sarah@example.com>', subject: 'Project meeting?', snippet: 'Hi! Could we meet Thursday afternoon to go over the slides?', minutes: 25 },
  { id: 'm1b', thread: 't1', from: 'Alex Kim <alex@example.com>', subject: 'Re: Project meeting?', snippet: 'Thursday works for me too.', minutes: 12 },
  { id: 'm2', thread: 't2', from: 'Prof. Chen <chen@example.edu>', subject: 'Office hours moved', snippet: 'This week office hours move to Wednesday at 3 PM.', minutes: 90 },
  { id: 'm3', thread: 't3', from: 'Shop <orders@example.com>', subject: 'Your order has shipped', snippet: 'Arriving tomorrow by 8 PM.', minutes: 200 },
  { id: 'm4', thread: 't4', from: 'The Weekly <news@example.com>', subject: 'This week in tech', snippet: 'Five stories you missed &amp; more.', minutes: 600 },
  { id: 'm5', thread: 't5', from: 'Ed Discussion <noreply@edstem.org>', subject: 'New post in UGBA 102A', snippet: 'Someone asked about the midterm format.', minutes: 1500 },
]

function gmailMessage(m: (typeof MAIL)[number]) {
  return {
    id: m.id, threadId: m.thread, snippet: m.snippet, internalDate: String(Date.now() - m.minutes * 60_000),
    payload: { headers: [{ name: 'From', value: m.from }, { name: 'Subject', value: m.subject }] },
  }
}
