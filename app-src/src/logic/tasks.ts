// Task changes, as pure functions from one sync document to the next. Ports AppModel's addTask,
// toggleDone/restoreDay (the recurring log), setPriority, setDue, move and delete. Every changed
// record gets updatedAt = now and every delete leaves a tombstone, exactly as the Mac's
// ChangeTracker does, so the merge treats web edits the same way.
import { iso, tombstoneKey, type RepeatRule, type SyncDocument, type SyncList, type SyncTask } from '../sync/document'
import { defaultListID } from '../sync/merge'
import { addDays, startOfDay } from './dates'
import { parseQuickAdd } from './quickAdd'
import { nextUpcoming } from './repeat'

export const LIST_COLORS = ['#5B3FD9', '#2F6BFF', '#0F9D9A', '#2E9E5B', '#F07A1A', '#E5484D', '#E54C9A', '#5E6370']

export const newID = () => crypto.randomUUID().toUpperCase()

const clone = (doc: SyncDocument): SyncDocument => ({
  ...doc, tasks: { ...doc.tasks }, lists: { ...doc.lists }, notes: { ...doc.notes }, events: { ...doc.events },
  muteRules: { ...doc.muteRules }, emailSorting: { ...doc.emailSorting }, deleted: { ...doc.deleted },
})

export { clone as cloneDocument }

function nextSortIndex(doc: SyncDocument): number {
  return Math.max(-1, ...Object.values(doc.tasks).map(t => t.sortIndex)) + 1
}

/** Where tasks go when no list is picked. Creates "Tasks" if there are no lists at all. */
export function ensureDefaultList(doc: SyncDocument, now: Date): { doc: SyncDocument; listID: string } {
  const existing = defaultListID(doc.lists, doc.settings?.defaultListID)
  if (existing) return { doc, listID: existing }
  const { doc: next, list } = addList(doc, 'Tasks', now)
  return { doc: next, listID: list.id }
}

export interface NewTask {
  title: string
  due?: Date
  dueHasTime?: boolean
  notes?: string
  priority?: number
  listID?: string
  repeatRule?: RepeatRule
  repeatUntil?: Date
}

export function addTask(doc: SyncDocument, input: NewTask, now: Date = new Date()): { doc: SyncDocument; id?: string } {
  const title = input.title.trim()
  if (!title) return { doc }
  let next = clone(doc)
  let listID = input.listID
  if (!listID) ({ doc: next, listID } = ensureDefaultList(next, now))
  const id = newID()
  const stamp = iso(now)
  next.tasks[id] = clean({
    id, title, notes: input.notes ?? '', due: input.due ? iso(input.due) : undefined,
    dueHasTime: !!input.due && !!input.dueHasTime, isDone: false, sortIndex: nextSortIndex(next), createdAt: stamp,
    listID, priority: Math.min(Math.max(input.priority ?? 4, 1), 4), repeatRule: input.repeatRule,
    repeatUntil: input.repeatRule && input.repeatUntil ? iso(input.repeatUntil) : undefined, updatedAt: stamp,
  })
  return { doc: next, id }
}

/** A line typed into quick add. `#List` picks a list (case-insensitive) or creates it; without one
 *  the task goes to `defaultListID`, else the default list. */
export function addQuickTask(
  doc: SyncDocument, input: string, options: { defaultListID?: string; defaultDue?: Date } = {}, now: Date = new Date(),
): { doc: SyncDocument; id?: string } {
  const parsed = parseQuickAdd(input, now)
  let next = doc
  let listID = options.defaultListID
  if (parsed.listName) {
    const found = listNamed(doc, parsed.listName)
    if (found) listID = found.id
    else ({ doc: next, list: { id: listID } } = addList(doc, parsed.listName, now))
  }
  return addTask(next, {
    title: parsed.title, due: parsed.due ?? options.defaultDue, dueHasTime: parsed.dueHasTime, priority: parsed.priority,
    listID, repeatRule: parsed.repeatRule, repeatUntil: parsed.repeatUntil,
  }, now)
}

export function listNamed(doc: SyncDocument, name: string): SyncList | undefined {
  return Object.values(doc.lists).find(l => l.name.toLowerCase() === name.toLowerCase())
}

export function addList(doc: SyncDocument, name: string, now: Date = new Date(), colorHex?: string): { doc: SyncDocument; list: SyncList } {
  const next = clone(doc)
  const lists = Object.values(doc.lists)
  const stamp = iso(now)
  const list: SyncList = {
    id: newID(), name: name.trim() || 'New List', colorHex: colorHex ?? LIST_COLORS[lists.length % LIST_COLORS.length],
    sortIndex: Math.max(-1, ...lists.map(l => l.sortIndex)) + 1, createdAt: stamp, updatedAt: stamp,
  }
  next.lists[list.id] = list
  return { doc: next, list }
}

export function updateList(doc: SyncDocument, id: string, change: Partial<Pick<SyncList, 'name' | 'colorHex'>>, now: Date = new Date()): SyncDocument {
  const list = doc.lists[id]
  if (!list) return doc
  const next = clone(doc)
  next.lists[id] = { ...list, ...change, updatedAt: iso(now) }
  return next
}

/** Deleting a list keeps its tasks: they move to the default list, which itself can't be deleted. */
export function deleteList(doc: SyncDocument, id: string, now: Date = new Date()): SyncDocument {
  const fallback = defaultListID(doc.lists, doc.settings?.defaultListID)
  if (!fallback || fallback === id || !doc.lists[id]) return doc
  const next = clone(doc)
  for (const task of Object.values(doc.tasks)) {
    if (task.listID === id) next.tasks[task.id] = { ...task, listID: fallback, updatedAt: iso(now) }
  }
  delete next.lists[id]
  next.deleted[tombstoneKey('list', id)] = iso(now)
  return next
}

/** Checking off a repeating task logs that day as its own completed task (it shows in Completed)
 *  and moves the repeating task to its next date, until its end date passes; then the repeating
 *  task itself is completed for good. Unchecking a logged day puts it back (see restoreDay). */
export function toggleDone(doc: SyncDocument, id: string, now: Date = new Date()): SyncDocument {
  const task = doc.tasks[id]
  if (!task) return doc
  const next = clone(doc)
  const stamp = iso(now)
  if (!task.isDone && task.repeatRule) {
    const due = task.due ? new Date(task.due) : now
    const nextDue = nextUpcoming(task.repeatRule, due, now)
    const lastDay = task.repeatUntil ? addDays(startOfDay(new Date(task.repeatUntil)), 1) : undefined
    if (!lastDay || nextDue < lastDay) {
      const logID = newID()
      next.tasks[logID] = clean({
        id: logID, title: task.title, notes: task.notes, due: iso(due), dueHasTime: task.dueHasTime, isDone: true,
        completedAt: stamp, sortIndex: nextSortIndex(next), createdAt: stamp, listID: task.listID,
        priority: task.priority, seriesTaskID: task.id, updatedAt: stamp,
      })
      next.tasks[id] = { ...task, due: iso(nextDue), updatedAt: stamp }
      return next
    }
  }
  if (task.isDone && task.seriesTaskID) return restoreDay(next, task, stamp)
  next.tasks[id] = clean({ ...task, isDone: !task.isDone, completedAt: task.isDone ? undefined : stamp, updatedAt: stamp })
  return next
}

/** Unchecking a logged day: the entry goes away and the repeating task returns to that date. If a
 *  later day was checked off since (or the repeating task is gone or finished), the entry just
 *  becomes an open one-off task instead. */
function restoreDay(next: SyncDocument, entry: SyncTask, stamp: string): SyncDocument {
  const all = Object.values(next.tasks)
  const series = all.find(t => t.id === entry.seriesTaskID && !t.isDone && t.repeatRule)
  const entryDue = entry.due ? Date.parse(entry.due) : -Infinity
  const laterDayDone = all.some(t => t.seriesTaskID === entry.seriesTaskID && t.id !== entry.id && (t.due ? Date.parse(t.due) : -Infinity) > entryDue)
  if (series && !laterDayDone) {
    next.tasks[series.id] = clean({ ...series, due: entry.due, dueHasTime: entry.dueHasTime, updatedAt: stamp })
    delete next.tasks[entry.id]
    next.deleted[tombstoneKey('task', entry.id)] = stamp
  } else {
    next.tasks[entry.id] = clean({ ...entry, isDone: false, completedAt: undefined, seriesTaskID: undefined, updatedAt: stamp })
  }
  return next
}

export function updateTask(doc: SyncDocument, id: string, change: Partial<SyncTask>, now: Date = new Date()): SyncDocument {
  const task = doc.tasks[id]
  if (!task) return doc
  const next = clone(doc)
  next.tasks[id] = clean({ ...task, ...change, id, updatedAt: iso(now) })
  return next
}

export function setPriority(doc: SyncDocument, id: string, priority: number, now: Date = new Date()): SyncDocument {
  return updateTask(doc, id, { priority: Math.min(Math.max(priority, 1), 4) }, now)
}

export function setDue(doc: SyncDocument, ids: string[], due: (task: SyncTask) => Date | undefined, now: Date = new Date()): SyncDocument {
  let next = doc
  for (const id of ids) {
    const task = doc.tasks[id]
    if (!task) continue
    const date = due(task)
    next = updateTask(next, id, { due: date ? iso(date) : undefined, dueHasTime: !!date && task.dueHasTime }, now)
  }
  return next
}

export function moveTask(doc: SyncDocument, id: string, listID: string, now: Date = new Date()): SyncDocument {
  return updateTask(doc, id, { listID }, now)
}

export function deleteTask(doc: SyncDocument, id: string, now: Date = new Date()): SyncDocument {
  if (!doc.tasks[id]) return doc
  const next = clone(doc)
  delete next.tasks[id]
  next.deleted[tombstoneKey('task', id)] = iso(now)
  return next
}

/** Same time of day on a new date (Move All to Today). */
export function movingTo(task: SyncTask, day: Date): Date {
  if (!task.dueHasTime || !task.due) return startOfDay(day)
  const due = new Date(task.due)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), due.getHours(), due.getMinutes())
}

// MARK: Undo

export interface TaskSnapshot {
  before: Record<string, SyncTask | undefined>
  created: string[]
}

/** Runs a task change and returns how to undo it: the touched tasks as they were, plus any it created. */
export function undoable(doc: SyncDocument, ids: string[], change: (doc: SyncDocument) => SyncDocument): { doc: SyncDocument; undo: TaskSnapshot } {
  const before: Record<string, SyncTask | undefined> = {}
  for (const id of ids) before[id] = doc.tasks[id]
  const next = change(doc)
  const created = Object.keys(next.tasks).filter(id => !doc.tasks[id])
  return { doc: next, undo: { before, created } }
}

/** Puts the tasks back as they were. The restored copies are stamped now, so they win over the change everywhere. */
export function restore(doc: SyncDocument, snapshot: TaskSnapshot, now: Date = new Date()): SyncDocument {
  const next = clone(doc)
  const stamp = iso(now)
  for (const id of snapshot.created) {
    delete next.tasks[id]
    next.deleted[tombstoneKey('task', id)] = stamp
  }
  for (const [id, task] of Object.entries(snapshot.before)) {
    if (!task) continue
    next.tasks[id] = { ...task, updatedAt: stamp }
    delete next.deleted[tombstoneKey('task', id)]
  }
  return next
}

/** Drops undefined fields, so records compare and serialize like the Mac's (absent, not null). */
export function clean<T extends object>(record: T): T {
  const out = { ...record }
  for (const key of Object.keys(out) as (keyof T)[]) if (out[key] === undefined) delete out[key]
  return out
}

/** Drag to reorder within a list: the tasks keep the same set of sortIndex values, in the new order
 *  (AppModel.move(_:fromOffsets:toOffset:)). Only tasks whose index changed are stamped. */
export function reorder(doc: SyncDocument, orderedIDs: string[], now: Date = new Date()): SyncDocument {
  const tasks = orderedIDs.map(id => doc.tasks[id]).filter(Boolean)
  const indices = tasks.map(t => t.sortIndex).sort((a, b) => a - b)
  let next = doc
  tasks.forEach((task, i) => {
    if (task.sortIndex !== indices[i]) next = updateTask(next, task.id, { sortIndex: indices[i] }, now)
  })
  return next
}
