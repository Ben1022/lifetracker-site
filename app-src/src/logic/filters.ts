// Port of TaskFilters.swift: which tasks each view shows, in what order, and their date labels.
import type { SyncList, SyncTask } from '../sync/document'
import { addDays, isSameDay, shortDayText, startOfDay, timeText, weekdayText } from './dates'

export const dueOf = (task: SyncTask) => (task.due ? new Date(task.due) : undefined)

/** Overdue: past its day, or past its time if it has one. */
export function isOverdue(task: SyncTask, now: Date = new Date()): boolean {
  const due = dueOf(task)
  if (!due || task.isDone) return false
  return task.dueHasTime ? due < now : due < startOfDay(now)
}

/** "Today", "Tomorrow 5:30 PM", "Friday", "Fri, Oct 30"…, with the time when it has one. */
export function dueText(due: Date | undefined, hasTime: boolean, now: Date = new Date()): string {
  if (!due) return ''
  let day: string
  const week = addDays(startOfDay(now), 6)
  if (isSameDay(due, now)) day = 'Today'
  else if (isSameDay(due, addDays(now, 1))) day = 'Tomorrow'
  else if (isSameDay(due, addDays(now, -1))) day = 'Yesterday'
  else if (due > now && due < week) day = weekdayText(due)
  else day = shortDayText(due)
  return hasTime ? `${day} ${timeText(due)}` : day
}

export const taskDueText = (task: SyncTask, now: Date = new Date()) => dueText(dueOf(task), task.dueHasTime, now)

/** Open tasks in a list, in your own order. */
export function inList(tasks: SyncTask[], listID: string): SyncTask[] {
  return tasks.filter(t => !t.isDone && t.listID === listID).sort((a, b) => a.sortIndex - b.sortIndex)
}

/** Open tasks due today or earlier: overdue first, then by time, then priority. */
export function today(tasks: SyncTask[], now: Date = new Date()): { overdue: SyncTask[]; today: SyncTask[] } {
  const start = startOfDay(now), end = addDays(start, 1)
  const due = tasks.filter(t => !t.isDone && t.due && new Date(t.due) < end)
  return {
    overdue: due.filter(t => new Date(t.due!) < start).sort(byDueThenPriority),
    today: due.filter(t => new Date(t.due!) >= start).sort(byDueThenPriority),
  }
}

/** Open tasks due after today, grouped by day, soonest first. */
export function upcoming(tasks: SyncTask[], now: Date = new Date()): { day: Date; tasks: SyncTask[] }[] {
  const end = addDays(startOfDay(now), 1)
  const groups = new Map<number, SyncTask[]>()
  for (const task of tasks) {
    if (task.isDone || !task.due || new Date(task.due) < end) continue
    const key = startOfDay(new Date(task.due)).getTime()
    groups.set(key, [...(groups.get(key) ?? []), task])
  }
  return [...groups.keys()].sort((a, b) => a - b).map(key => ({ day: new Date(key), tasks: groups.get(key)!.sort(byDueThenPriority) }))
}

/** The Overview's Tasks card: overdue, today, tomorrow, then the rest of the week. Empty groups are left out. */
export function overview(tasks: SyncTask[], now: Date = new Date()): { title: string; tasks: SyncTask[] }[] {
  const start = startOfDay(now)
  const tomorrow = addDays(start, 1), dayAfter = addDays(start, 2), weekEnd = addDays(start, 7)
  const open = tasks.filter(t => !t.isDone && t.due)
  const group = (title: string, from: Date | undefined, to: Date) => ({
    title,
    tasks: open.filter(t => { const d = new Date(t.due!); return (!from || d >= from) && d < to }).sort(byDayThenTime),
  })
  return [group('Overdue', undefined, start), group('Today', start, tomorrow), group('Tomorrow', tomorrow, dayAfter), group('This Week', dayAfter, weekEnd)]
    .filter(g => g.tasks.length > 0)
}

/** Finished tasks, most recent first. */
export function completed(tasks: SyncTask[]): SyncTask[] {
  return tasks.filter(t => t.isDone).sort((a, b) => time(b.completedAt) - time(a.completedAt))
}

/** The default list among `lists`: the chosen one, else "Other", else the first by sortIndex. */
export function defaultList(lists: SyncList[], preferredID?: string): SyncList | undefined {
  const ordered = [...lists].sort((a, b) => a.sortIndex - b.sortIndex || (a.id < b.id ? -1 : 1))
  return ordered.find(l => l.id === preferredID) ?? ordered.find(l => l.name.toLowerCase() === 'other') ?? ordered[0]
}

const time = (value?: string) => (value ? Date.parse(value) : -Infinity)

/** Earlier days first; within a day, timed tasks by time, then priority. */
function byDayThenTime(a: SyncTask, b: SyncTask): number {
  const ad = startOfDay(new Date(a.due!)).getTime(), bd = startOfDay(new Date(b.due!)).getTime()
  return ad !== bd ? ad - bd : byDueThenPriority(a, b)
}

/** Timed tasks by time first; untimed ones after, by priority. */
export function byDueThenPriority(a: SyncTask, b: SyncTask): number {
  const key = (t: SyncTask): [number, number, number, number] =>
    [t.dueHasTime ? 0 : 1, t.dueHasTime ? time(t.due) : -Infinity, t.priority, t.sortIndex]
  const ka = key(a), kb = key(b)
  for (let i = 0; i < 4; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1
  return 0
}
