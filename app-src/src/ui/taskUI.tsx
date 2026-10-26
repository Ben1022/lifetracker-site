// Task pieces shared by the Overview's Tasks card and the Tasks page: the undoable actions (same
// toast messages as AppModel), the priority check circle, the right-click menu and the editor sheet.
import { useState } from 'preact/hooks'
import { iso, type RepeatRule, type SyncTask } from '../sync/document'
import { addDays, startOfDay } from '../logic/dates'
import { REPEAT_RULES, repeatTitle } from '../logic/repeat'
import { deleteTask, moveTask, setPriority, toggleDone, updateTask, movingTo, setDue } from '../logic/tasks'
import { change, changeTasks, doc, lists } from '../state'
import { confirm, Sheet, showMenu, type MenuItem } from './components'
import { Icon } from './icons'

/** Todoist-style: p1 red, p2 orange, p3 blue, p4 none (TaskStyle.swift). */
export function priorityColor(priority: number): string {
  return priority === 1 ? '#E5484D' : priority === 2 ? '#F07A1A' : priority === 3 ? '#2F6BFF' : 'var(--text-2)'
}

export const priorityTitle = (priority: number) => (priority >= 4 ? 'No priority' : `Priority ${priority}`)

// MARK: Actions

export function completeTask(task: SyncTask) {
  const series = task.seriesTaskID ? [task.seriesTaskID] : []
  changeTasks(task.isDone ? `Marked “${task.title}” not done` : `Completed “${task.title}”`, [task.id, ...series], d => toggleDone(d, task.id))
}

export function deleteTaskWithUndo(task: SyncTask) {
  changeTasks(`Deleted “${task.title}”`, [task.id], d => deleteTask(d, task.id))
}

export function setTaskPriority(task: SyncTask, priority: number) {
  changeTasks(`Changed priority of “${task.title}”`, [task.id], d => setPriority(d, task.id, priority))
}

/** The menu's Today / Tomorrow / Next Week / No Date (no time, like the Mac). */
export function setTaskDay(task: SyncTask, day: Date | undefined) {
  changeTasks(day ? `Moved “${task.title}”` : `Removed the date from “${task.title}”`, [task.id],
    d => updateTask(d, task.id, { due: day ? iso(day) : undefined, dueHasTime: false }))
}

export function moveAllToToday(tasks: SyncTask[]) {
  const now = new Date()
  changeTasks(`Moved ${tasks.length} overdue task${tasks.length === 1 ? '' : 's'} to today`, tasks.map(t => t.id),
    d => setDue(d, tasks.map(t => t.id), t => movingTo(t, now)))
}

export function moveTaskToList(task: SyncTask, listID: string) {
  const name = doc.value.lists[listID]?.name ?? 'list'
  changeTasks(`Moved “${task.title}” to ${name}`, [task.id], d => moveTask(d, task.id, listID))
}

// MARK: Check circle

/** The round check, filled with the priority color when done. `completing` shows the check for a
 *  moment before the task leaves the list. */
export function TaskCheck({ task, completing, onToggle }: { task: SyncTask; completing?: boolean; onToggle: () => void }) {
  const color = priorityColor(task.priority)
  const checked = task.isDone || completing
  const label = task.isDone ? `Mark ${task.title} not done` : `Complete ${task.title}`
  const hint = task.repeatRule ? `Complete (comes back ${repeatTitle[task.repeatRule].toLowerCase()})` : 'Complete'
  return (
    <button class="task-check" aria-label={label} title={hint} onClick={e => { e.stopPropagation(); onToggle() }}>
      <span style={{
        borderColor: color, borderWidth: task.priority < 4 ? 1.8 : 1.2,
        background: checked ? color : task.priority < 4 ? `color-mix(in srgb, ${color} 12%, transparent)` : 'transparent',
      }}>
        {checked && <Icon name="check" size={11} style={{ color: '#fff', strokeWidth: 3 }} />}
      </span>
    </button>
  )
}

/** Runs `toggle` after the check has shown for a moment (450 ms, like the Mac). */
export function useCompleting(): [Set<string>, (task: SyncTask) => void] {
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const complete = (task: SyncTask) => {
    if (task.isDone) return completeTask(task)
    if (completing.has(task.id)) return
    setCompleting(s => new Set(s).add(task.id))
    setTimeout(() => {
      completeTask(doc.value.tasks[task.id] ?? task)
      setCompleting(s => { const n = new Set(s); n.delete(task.id); return n })
    }, 450)
  }
  return [completing, complete]
}

// MARK: Menu

export function taskMenu(event: MouseEvent, task: SyncTask, onEdit: () => void) {
  const today = startOfDay(new Date())
  const items: MenuItem[] = [
    { label: 'Edit…', action: onEdit },
    'divider',
    { section: 'Priority' },
    ...[1, 2, 3, 4].map(p => ({ label: priorityTitle(p), action: () => setTaskPriority(task, p), disabled: task.priority === p })),
    { section: 'Due' },
    { label: 'Today', action: () => setTaskDay(task, today) },
    { label: 'Tomorrow', action: () => setTaskDay(task, addDays(today, 1)) },
    { label: 'Next Week', action: () => setTaskDay(task, addDays(today, 7)) },
    { label: 'No Date', action: () => setTaskDay(task, undefined), disabled: !task.due },
    { section: 'Move To' },
    ...lists.value.map(l => ({ label: l.name, action: () => moveTaskToList(task, l.id), disabled: task.listID === l.id })),
    'divider',
    { label: 'Delete', action: () => deleteTaskWithUndo(task), destructive: true },
  ]
  showMenu(event, items)
}

// MARK: Editor

const pad = (n: number) => String(n).padStart(2, '0')
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const parseDate = (value: string) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d) }

export function TaskEditor({ task, onClose }: { task: SyncTask; onClose: () => void }) {
  const due = task.due ? new Date(task.due) : startOfDay(new Date())
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [listID, setListID] = useState(task.listID)
  const [priority, setPriorityValue] = useState(task.priority)
  const [hasDue, setHasDue] = useState(!!task.due)
  const [day, setDay] = useState(dateValue(due))
  const [hasTime, setHasTime] = useState(task.dueHasTime)
  const [time, setTime] = useState(task.dueHasTime ? timeValue(due) : '09:00')
  const [repeat, setRepeat] = useState<RepeatRule | ''>(task.repeatRule ?? '')
  const [hasEnd, setHasEnd] = useState(!!task.repeatUntil)
  const [until, setUntil] = useState(dateValue(task.repeatUntil ? new Date(task.repeatUntil) : addDays(new Date(), 30)))

  const done = () => {
    let dueDate: Date | undefined
    if (hasDue && day) {
      dueDate = parseDate(day)
      if (hasTime && time) {
        const [h, m] = time.split(':').map(Number)
        dueDate.setHours(h, m)
      }
    }
    const rule = hasDue && repeat ? repeat : undefined
    change(d => updateTask(d, task.id, {
      title: title.trim() || task.title, notes, listID, priority,
      due: dueDate ? iso(dueDate) : undefined, dueHasTime: !!dueDate && hasTime,
      repeatRule: rule, repeatUntil: rule && hasEnd && until ? iso(parseDate(until)) : undefined,
    }))
    onClose()
  }
  const askDelete = () => confirm({
    title: `Delete “${task.title}”?`,
    message: task.repeatRule
      ? 'This deletes the repeating task; days already checked off stay in Completed. You can undo this with ⌘Z.'
      : 'You can undo this with ⌘Z.',
    action: 'Delete', destructive: true,
    onConfirm: () => { onClose(); deleteTaskWithUndo(task) },
  })

  return (
    <Sheet title="Edit Task" onClose={onClose} actions={<>
      <button class="plain-button destructive" onClick={askDelete}>Delete…</button>
      <span class="spacer" />
      <button class="plain-button" onClick={onClose}>Cancel</button>
      <button class="accent-button" onClick={done}>Done</button>
    </>}>
      <form class="col" style={{ gap: 10 }} onSubmit={e => { e.preventDefault(); done() }}>
        <input class="text-input" aria-label="Title" placeholder="Title" value={title} data-autofocus
          onInput={e => setTitle(e.currentTarget.value)} />
        <textarea class="text-input" aria-label="Notes" placeholder="Notes" rows={3} value={notes}
          onInput={e => setNotes(e.currentTarget.value)} />
        <div class="form-row">
          <label for="task-list">List</label>
          <select id="task-list" class="text-input" value={listID} onChange={e => setListID(e.currentTarget.value)}>
            {lists.value.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div class="form-row">
          <label>Priority</label>
          <div class="segmented" role="group" aria-label="Priority">
            {[1, 2, 3, 4].map(p => (
              <button type="button" key={p} aria-pressed={priority === p} onClick={() => setPriorityValue(p)}>{p === 4 ? 'None' : `P${p}`}</button>
            ))}
          </div>
        </div>
        <label class="form-row"><input type="checkbox" checked={hasDue} onChange={e => setHasDue(e.currentTarget.checked)} />Due date</label>
        {hasDue && <>
          <div class="form-row">
            <label for="task-date">Date</label>
            <input id="task-date" type="date" class="text-input" value={day} onInput={e => setDay(e.currentTarget.value)} />
          </div>
          <div class="form-row">
            <label><input type="checkbox" checked={hasTime} onChange={e => setHasTime(e.currentTarget.checked)} /> Time</label>
            {hasTime && <input type="time" class="text-input" aria-label="Time" value={time} onInput={e => setTime(e.currentTarget.value)} />}
          </div>
          <div class="form-row">
            <label for="task-repeat">Repeat</label>
            <select id="task-repeat" class="text-input" value={repeat} onChange={e => setRepeat(e.currentTarget.value as RepeatRule | '')}>
              <option value="">Never</option>
              {REPEAT_RULES.map(r => <option key={r} value={r}>{repeatTitle[r]}</option>)}
            </select>
          </div>
          {repeat && <div class="form-row">
            <label><input type="checkbox" checked={hasEnd} onChange={e => setHasEnd(e.currentTarget.checked)} /> Ends</label>
            {hasEnd && <input type="date" class="text-input" aria-label="Last day" min={day} value={until} onInput={e => setUntil(e.currentTarget.value)} />}
          </div>}
        </>}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}
