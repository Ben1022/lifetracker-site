// Port of TasksView: Today / Upcoming / Completed and your lists on the left, the tasks on the
// right with quick add. Arrow keys move, Return edits, Space checks off, Delete deletes (all undoable).
import { useState } from 'preact/hooks'
import type { SyncList, SyncTask } from '../../sync/document'
import { addDays, isSameDay, longDayText, startOfDay } from '../../logic/dates'
import { completed, defaultList, dueText, inList, isOverdue, taskDueText, today as todayGroups, upcoming } from '../../logic/filters'
import { PRESETS } from '../../logic/appearance'
import { parseQuickAdd } from '../../logic/quickAdd'
import { repeatTitle } from '../../logic/repeat'
import { addList, addQuickTask, deleteList, reorder, updateList } from '../../logic/tasks'
import { change, defaultListID, doc, lists, sync, updateSettings } from '../../state'
import { Dot, Empty, PageTitle, Sheet, isTyping, showMenu, stepSelection } from '../components'
import { Icon, type IconName } from '../icons'
import { useNow } from './Overview'
import { TaskCheck, TaskEditor, completeTask, deleteTaskWithUndo, moveAllToToday, priorityColor, taskMenu, useCompleting } from '../taskUI'

type Scope = { kind: 'today' } | { kind: 'upcoming' } | { kind: 'completed' } | { kind: 'list'; id: string }

export function TasksPage() {
  const [scope, setScope] = useState<Scope>({ kind: 'today' })
  // A deleted list (here or on the Mac) falls back to Today.
  const current: Scope = scope.kind === 'list' && !doc.value.lists[scope.id] ? { kind: 'today' } : scope
  return (
    <div class="split">
      <TaskNavigator scope={current} setScope={setScope} />
      <TaskListPane scope={current} key={current.kind === 'list' ? current.id : current.kind} />
    </div>
  )
}

// MARK: Navigator

function TaskNavigator({ scope, setScope }: { scope: Scope; setScope: (s: Scope) => void }) {
  const tasks = Object.values(doc.value.tasks)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<SyncList | undefined>()
  const defaultID = defaultListID.value
  const t = todayGroups(tasks)

  const add = (e: Event) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) {
      const { doc: next, list } = addList(doc.value, trimmed)
      change(() => next)
      setScope({ kind: 'list', id: list.id })
    }
    setName('')
    setAdding(false)
  }

  const listMenu = (e: MouseEvent, list: SyncList) => {
    const isDefault = list.id === defaultID
    showMenu(e, [
      { label: 'Rename…', action: () => setRenaming(list) },
      { section: 'Color' },
      ...PRESETS.map(p => ({ label: p.name, action: () => change(d => updateList(d, list.id, { colorHex: p.hex })), disabled: p.hex === list.colorHex })),
      'divider',
      { label: 'Use as Default List', action: () => updateSettings({ defaultListID: list.id }), disabled: isDefault },
      { label: isDefault ? "Delete List (the default list can't be deleted)" : 'Delete List', destructive: true, disabled: isDefault,
        action: () => { if (scope.kind === 'list' && scope.id === list.id) setScope({ kind: 'today' }); change(d => deleteList(d, list.id)) } },
    ])
  }

  return (
    <nav class="navigator" aria-label="Task lists">
      <NavRow selected={scope.kind === 'today'} onClick={() => setScope({ kind: 'today' })} icon="star" title="Today" count={t.overdue.length + t.today.length} />
      <NavRow selected={scope.kind === 'upcoming'} onClick={() => setScope({ kind: 'upcoming' })} icon="calendar" title="Upcoming" />
      <NavRow selected={scope.kind === 'completed'} onClick={() => setScope({ kind: 'completed' })} icon="checkCircle" title="Completed" />
      <div class="navigator-section">
        <span class="t-section secondary">My Lists</span>
        <span class="spacer" />
        <button class="icon-button" aria-label="New list" title="New list" onClick={() => setAdding(true)}><Icon name="plus" /></button>
      </div>
      {lists.value.map(list => {
        const isDefault = list.id === defaultID
        return (
          <NavRow key={list.id} selected={scope.kind === 'list' && scope.id === list.id} onClick={() => setScope({ kind: 'list', id: list.id })}
            dot={list.colorHex} title={list.name} count={inList(tasks, list.id).length} note={isDefault ? 'default' : undefined}
            hint={isDefault ? "Default list: tasks go here when you don't pick a list" : undefined}
            onMenu={e => listMenu(e, list)} />
        )
      })}
      {adding ? (
        <form onSubmit={add} style={{ padding: '2px 6px' }}>
          <input class="text-input" aria-label="List name" placeholder="List name" value={name} autoFocus
            onInput={e => setName(e.currentTarget.value)} onBlur={add}
            onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setName('') } }} />
        </form>
      ) : lists.value.length === 0 && sync.value.loaded ? (
        <div class="t-caption secondary" style={{ padding: '0 10px' }}>Group tasks into lists like School or Errands. Tip: type #School in quick add.</div>
      ) : null}
      {renaming && <RenameList list={renaming} onClose={() => setRenaming(undefined)} />}
    </nav>
  )
}

function NavRow({ selected, onClick, icon, dot, title, count, note, hint, onMenu }: {
  selected: boolean; onClick: () => void; icon?: IconName; dot?: string; title: string; count?: number; note?: string; hint?: string
  onMenu?: (e: MouseEvent) => void
}) {
  return (
    <div class="nav-row-wrap">
      <button class="nav-row" aria-current={selected ? 'true' : undefined} onClick={onClick} title={hint} onContextMenu={onMenu}>
        {icon ? <Icon name={icon} size={16} class="nav-icon" /> : <span class="nav-icon"><Dot color={dot!} size={9} /></span>}
        <span class="ellipsis">{title}</span>
        {note && <span class="t-tiny nav-note">{note}</span>}
        <span class="spacer" />
        {!!count && <span class="t-caption nav-count">{count}</span>}
      </button>
      {onMenu && <button class="icon-button nav-more" aria-label={`${title} options`} title="Options" onClick={onMenu}><Icon name="ellipsis" /></button>}
    </div>
  )
}

function RenameList({ list, onClose }: { list: SyncList; onClose: () => void }) {
  const [name, setName] = useState(list.name)
  const save = () => {
    if (name.trim()) change(d => updateList(d, list.id, { name: name.trim() }))
    onClose()
  }
  return (
    <Sheet title="Rename List" onClose={onClose} width={340} actions={<>
      <span class="spacer" />
      <button class="plain-button" onClick={onClose}>Cancel</button>
      <button class="accent-button" onClick={save}>Rename</button>
    </>}>
      <form onSubmit={e => { e.preventDefault(); save() }}>
        <input class="text-input" aria-label="Name" value={name} data-autofocus onInput={e => setName(e.currentTarget.value)} />
      </form>
    </Sheet>
  )
}

// MARK: List pane

function TaskListPane({ scope }: { scope: Scope }) {
  const now = useNow()
  const tasks = Object.values(doc.value.tasks)
  const list = scope.kind === 'list' ? doc.value.lists[scope.id] : undefined
  const [showCompleted, setShowCompleted] = useState(false)
  const [selected, setSelected] = useState<string | undefined>()
  const [editing, setEditing] = useState<string | undefined>()
  const [completing, complete] = useCompleting()

  // What's on screen, in order, for the keyboard.
  let sections: { title?: string; action?: { label: string; run: () => void }; tasks: SyncTask[]; showList: boolean }[] = []
  let empty: { icon: IconName; title: string; description?: string } | undefined
  if (scope.kind === 'list') {
    const open = inList(tasks, scope.id)
    const done = showCompleted ? completed(tasks.filter(t => t.listID === scope.id)).slice(0, 50) : []
    sections = [{ tasks: open, showList: false }, ...(done.length ? [{ title: 'Completed', tasks: done, showList: false }] : [])]
    if (!open.length && !done.length) empty = { icon: 'checkCircle', title: 'No Tasks Yet', description: 'Add one above. Try “Read chapter 4 tomorrow 5pm p2”.' }
  } else if (scope.kind === 'today') {
    const g = todayGroups(tasks, now)
    sections = g.overdue.length
      ? [{ title: 'Overdue', action: { label: 'Move All to Today', run: () => moveAllToToday(g.overdue) }, tasks: g.overdue, showList: true },
        { title: 'Today', tasks: g.today, showList: true }]
      : [{ tasks: g.today, showList: true }]
    if (!g.overdue.length && !g.today.length) empty = { icon: 'sun', title: 'All Clear', description: "Nothing due today. Add something above. It'll be due today." }
  } else if (scope.kind === 'upcoming') {
    sections = upcoming(tasks, now).map(g => ({ title: dayHeader(g.day, now), tasks: g.tasks, showList: true }))
    if (!sections.length) empty = { icon: 'calendar', title: 'Nothing Scheduled', description: 'Tasks with a future date show up here.' }
  } else {
    sections = [{ tasks: completed(tasks).slice(0, 200), showList: true }]
    if (!sections[0].tasks.length) empty = { icon: 'checkCircle', title: 'No Completed Tasks' }
  }
  const visible = sections.flatMap(s => s.tasks)
  const ids = visible.map(t => t.id)
  if (!sync.value.loaded && !visible.length) empty = { icon: 'refresh', title: sync.value.noFile ? 'Sync Is Off' : 'Loading Tasks…',
    description: sync.value.noFile ? 'Turn on Sync with Google Drive in the Mac app (Settings → Accounts).' : undefined }

  const onKey = (e: KeyboardEvent) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
    if (stepSelection(e, ids, selected, setSelected)) return
    const task = visible.find(t => t.id === selected)
    if (!task) return
    if (e.key === 'Enter') { e.preventDefault(); setEditing(task.id) }
    else if (e.key === ' ') { e.preventDefault(); completeTask(task) }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      const index = ids.indexOf(task.id)
      const remaining = ids.filter(id => id !== task.id)
      deleteTaskWithUndo(task)
      setSelected(remaining.length ? remaining[Math.min(index, remaining.length - 1)] : undefined)
    }
  }

  // Drag to reorder (lists only, open tasks only).
  const [dragging, setDragging] = useState<string | undefined>()
  const drop = (targetID: string) => {
    if (!dragging || dragging === targetID || scope.kind !== 'list') return
    const order = inList(tasks, scope.id).map(t => t.id).filter(id => id !== dragging)
    order.splice(order.indexOf(targetID) + (ids.indexOf(dragging) < ids.indexOf(targetID) ? 1 : 0), 0, dragging)
    change(d => reorder(d, order))
    setDragging(undefined)
  }

  const title = scope.kind === 'today' ? 'Today' : scope.kind === 'upcoming' ? 'Upcoming' : scope.kind === 'completed' ? 'Completed' : list?.name ?? 'List'
  const subtitle = scope.kind === 'today' ? longDayText(now) : scope.kind === 'upcoming' ? 'Everything with a date after today' : undefined
  const editingTask = editing ? doc.value.tasks[editing] : undefined

  return (
    <div class="pane">
      <div class="pane-header">
        <PageTitle title={title} subtitle={subtitle} dot={list?.colorHex} />
        <span class="spacer" />
        {scope.kind === 'list' && (
          <label class="row t-caption"><input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.currentTarget.checked)} />Show completed</label>
        )}
      </div>
      {/* Adding a task from Completed makes no sense. */}
      {scope.kind !== 'completed' && <QuickAddBar scope={scope} />}
      <div class="pane-divider" />
      <div class="list task-list" tabIndex={0} onKeyDown={onKey} role="listbox" aria-label={`${title} tasks`}>
        {empty ? <Empty {...empty} /> : sections.map((section, i) => (
          <div key={section.title ?? i} role="group" aria-label={section.title}>
            {section.title && (
              <div class="list-section">
                <span>{section.title}</span>
                <span class="spacer" />
                {section.action && <button class="link-button t-caption" onClick={section.action.run}>{section.action.label}</button>}
              </div>
            )}
            {section.tasks.map(task => (
              <TaskRow key={task.id} task={task} now={now} showList={section.showList} selected={selected === task.id}
                completing={completing.has(task.id)} onToggle={() => complete(task)}
                onSelect={() => setSelected(task.id)} onEdit={() => setEditing(task.id)}
                draggable={scope.kind === 'list' && !task.isDone}
                onDragStart={() => setDragging(task.id)} onDrop={() => drop(task.id)} dropTarget={!!dragging && dragging !== task.id} />
            ))}
          </div>
        ))}
      </div>
      {editingTask && <TaskEditor task={editingTask} onClose={() => setEditing(undefined)} />}
    </div>
  )
}

function dayHeader(day: Date, now: Date): string {
  const text = day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  return isSameDay(day, addDays(now, 1)) ? `${text} · Tomorrow` : text
}

// MARK: Quick add

function QuickAddBar({ scope }: { scope: Scope }) {
  const [text, setText] = useState('')
  const parsed = parseQuickAdd(text)
  const listID = scope.kind === 'list' ? scope.id : undefined
  const due = parsed.due ?? (scope.kind === 'today' ? startOfDay(new Date()) : undefined)
  const add = (e: Event) => {
    e.preventDefault()
    if (!text.trim()) return
    change(d => addQuickTask(d, text, { defaultListID: listID, defaultDue: scope.kind === 'today' ? startOfDay(new Date()) : undefined }).doc)
    setText('')
  }
  const fallback = !parsed.listName && !listID ? defaultList(lists.value, doc.value.settings?.defaultListID) : undefined
  const exists = parsed.listName && lists.value.some(l => l.name.toLowerCase() === parsed.listName!.toLowerCase())
  return (
    <div class="quick-add">
      <form class="quick-add-field" onSubmit={add}>
        <Icon name="plusCircle" size={18} class="accent" />
        <input aria-label="Add a task" placeholder="Add a task. Try “Essay draft fri 5pm p1 #School”" value={text}
          onInput={e => setText(e.currentTarget.value)} />
        {text && <button class="accent-button compact" type="submit">Add</button>}
      </form>
      {text.trim() && (
        <div class="row" style={{ paddingLeft: 4, flexWrap: 'wrap' }}>
          {due && <Chip icon={parsed.repeatRule ? 'repeat' : 'calendar'} color="var(--positive)" text={dueText(due, parsed.dueHasTime)} />}
          {parsed.repeatRule && <Chip icon="repeat" color="var(--accent)" text={repeatTitle[parsed.repeatRule]} />}
          {parsed.priority < 4 && <Chip icon="flag" color={priorityColor(parsed.priority)} text={`P${parsed.priority}`} />}
          {parsed.listName && <Chip icon="hash" color="var(--accent)" text={exists ? parsed.listName : `${parsed.listName} (new list)`} />}
          {fallback && <Chip icon="hash" color="var(--text-2)" text={fallback.name} />}
        </div>
      )}
    </div>
  )
}

function Chip({ icon, color, text }: { icon: IconName; color: string; text: string }) {
  return <span class="chip" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}><Icon name={icon} />{text}</span>
}

// MARK: Row

function TaskRow({ task, now, showList, selected, completing, onToggle, onSelect, onEdit, draggable, onDragStart, onDrop, dropTarget }: {
  task: SyncTask; now: Date; showList: boolean; selected: boolean; completing: boolean; onToggle: () => void; onSelect: () => void
  onEdit: () => void; draggable: boolean; onDragStart: () => void; onDrop: () => void; dropTarget: boolean
}) {
  const list = showList ? doc.value.lists[task.listID ?? ''] : undefined
  const due = task.due ? new Date(task.due) : undefined
  // Overdue red, today green, tomorrow orange, later in the accent color.
  const dueColor = !due || task.isDone ? 'var(--text-2)' : isOverdue(task, now) ? 'var(--danger)' : isSameDay(due, now) ? 'var(--positive)'
    : isSameDay(due, addDays(now, 1)) ? 'var(--warning)' : 'var(--accent)'
  const [over, setOver] = useState(false)
  return (
    <div id={`row-${task.id}`} class={`list-row task-row ${over ? 'drop-over' : ''}`} role="option" aria-selected={selected}
      onClick={onSelect} onDblClick={onEdit} onContextMenu={e => { onSelect(); taskMenu(e, task, onEdit) }}
      draggable={draggable} onDragStart={e => { e.dataTransfer?.setData('text/plain', task.title); onDragStart() }}
      onDragOver={e => { if (dropTarget) { e.preventDefault(); setOver(true) } }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop() }}>
      <TaskCheck task={task} completing={completing} onToggle={onToggle} />
      <div class="col" style={{ gap: 3, flex: 1 }}>
        <span class="t-body" style={{ color: task.isDone ? 'var(--text-2)' : undefined, textDecoration: task.isDone ? 'line-through' : undefined }}>{task.title}</span>
        {task.notes && <span class="t-caption secondary ellipsis">{task.notes}</span>}
        {(due || list) && (
          <span class="row t-meta" style={{ gap: 12 }}>
            {due && <span class="row" style={{ gap: 4, color: dueColor }}>
              <Icon name={task.repeatRule || task.seriesTaskID ? 'repeat' : 'calendar'} size={11} />{taskDueText(task, now)}
            </span>}
            {list && <span class="row" style={{ gap: 4, color: list.colorHex }}><Icon name="hash" size={11} />{list.name}</span>}
          </span>
        )}
      </div>
      <button class="icon-button row-edit" aria-label={`Edit ${task.title}`} title="Edit (Return)" onClick={e => { e.stopPropagation(); onEdit() }}>
        <Icon name="pencil" />
      </button>
    </div>
  )
}

