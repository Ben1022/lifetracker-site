// Port of NotesView: today's daily note on top, then pinned and other notes; the first line is the
// title. A daily note shows that morning's briefing above it when Claude is on.
import { useState } from 'preact/hooks'
import { dayString, type SyncNote } from '../../sync/document'
import { isSameDay, longDayText, timeText } from '../../logic/dates'
import { addNote, dailyNote, dayDate, deleteNote, displayTitle, ensureDailyNote, noteGroups, notePreview, noteTitle, updateNote } from '../../logic/notes'
import { change, claudeEnabled, doc } from '../../state'
import { Empty, PageTitle, confirm, isTyping, showMenu, stepSelection, useNarrow } from '../components'
import { Icon } from '../icons'
import { useNow } from './Overview'

/** The Today row before today's daily note exists; typing in it creates the note. */
const TODAY = 'today'

export function NotesPage() {
  const now = useNow()
  const [selected, setSelected] = useState<string>(TODAY)
  const [search, setSearch] = useState('')
  const [showList, setShowList] = useState(true)
  const narrow = useNarrow(900)
  const notes = Object.values(doc.value.notes)
  const todayNote = dailyNote(doc.value, now)
  const groups = noteGroups(notes, now, search)
  // A selected note that was deleted (here or on the Mac) goes back to today's.
  const current = selected === TODAY ? todayNote : doc.value.notes[selected]
  const currentID = current?.id ?? TODAY
  const ordered = [...(search ? [] : [todayNote?.id ?? TODAY]), ...groups.pinned.map(n => n.id), ...groups.others.map(n => n.id)]

  const select = (id: string) => {
    setSelected(id)
    setShowList(false)
  }
  const newNote = () => {
    const { doc: next, id } = addNote(doc.value)
    change(() => next)
    setSearch('')
    select(id)
  }
  const askDelete = (note: SyncNote) => confirm({
    title: 'Delete this note?', message: "This can't be undone.", action: 'Delete', destructive: true,
    onConfirm: () => { change(d => deleteNote(d, note.id)); setSelected(TODAY) },
  })
  const noteMenu = (e: MouseEvent, note: SyncNote) => showMenu(e, [
    { label: note.isPinned ? 'Unpin' : 'Pin', icon: 'pin', action: () => change(d => updateNote(d, note.id, { isPinned: !note.isPinned })) },
    'divider',
    { label: 'Delete…', destructive: true, action: () => askDelete(note) },
  ])

  const list = (
    <div class="note-list">
      <div class="col" style={{ gap: 10, padding: '14px 16px 8px' }}>
        <div class="row">
          <PageTitle title="Notes" />
          <span class="spacer" />
          <button class="icon-button" aria-label="New note" title="New note" onClick={newNote}><Icon name="compose" size={18} /></button>
        </div>
        <div class="field" style={{ background: 'var(--card)' }}>
          <Icon name="search" size={14} class="secondary" />
          <input aria-label="Search notes" placeholder="Search" value={search} onInput={e => setSearch(e.currentTarget.value)} />
          {search && <button class="icon-button" aria-label="Clear search" onClick={() => setSearch('')} style={{ padding: 0 }}><Icon name="xmark" size={12} /></button>}
        </div>
      </div>
      <div class="list" tabIndex={0} role="listbox" aria-label="Notes"
        onKeyDown={e => { if (!isTyping(e)) stepSelection(e, ordered, currentID, id => setSelected(id)) }}>
        {!search && <>
          <div class="list-section">Today</div>
          <NoteRow id={todayNote?.id ?? TODAY} title={longDayText(now)} preview={todayNote ? noteTitle(todayNote.body) ?? 'Write about your day' : 'Write about your day'}
            sun selected={currentID === (todayNote?.id ?? TODAY)} onSelect={() => select(todayNote?.id ?? TODAY)} />
        </>}
        {groups.pinned.length > 0 && <div class="list-section">Pinned</div>}
        {groups.pinned.map(n => <NoteItem key={n.id} note={n} now={now} selected={currentID === n.id} onSelect={() => select(n.id)} onMenu={e => noteMenu(e, n)} />)}
        {groups.others.length > 0 && <div class="list-section">Notes</div>}
        {groups.others.map(n => <NoteItem key={n.id} note={n} now={now} selected={currentID === n.id} onSelect={() => select(n.id)} onMenu={e => noteMenu(e, n)} />)}
        {search && !groups.pinned.length && !groups.others.length && <Empty icon="search" title={`No Results for “${search}”`} description="Check the spelling or try a new search." />}
      </div>
    </div>
  )

  const editor = (
    <div class="col" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
      {narrow && <button class="link-button row t-body" style={{ padding: '12px 20px 0', gap: 4 }} onClick={() => setShowList(true)}>
        <Icon name="chevronLeft" size={14} />Notes
      </button>}
      <NoteEditor key={current && current.day !== dayString(now) ? current.id : TODAY} note={current} day={now} onPin={() => current && change(d => updateNote(d, current.id, { isPinned: !current.isPinned }))}
        onDelete={current && !current.day ? () => askDelete(current) : undefined}
        onCreated={id => setSelected(id)} />
    </div>
  )

  if (narrow) return <div class="split">{showList ? list : editor}</div>
  return <div class="split">{list}<div class="vdivider" />{editor}</div>
}

function NoteItem({ note, now, selected, onSelect, onMenu }: { note: SyncNote; now: Date; selected: boolean; onSelect: () => void; onMenu: (e: MouseEvent) => void }) {
  return (
    <NoteRow id={note.id} title={displayTitle(note)} preview={note.day ? noteTitle(note.body) : notePreview(note.body)}
      date={dateText(new Date(note.updatedAt), now)} sun={!!note.day} selected={selected} onSelect={onSelect} onMenu={onMenu} />
  )
}

function NoteRow({ id, title, preview, date, sun, selected, onSelect, onMenu }: {
  id: string; title: string; preview?: string; date?: string; sun?: boolean; selected: boolean; onSelect: () => void; onMenu?: (e: MouseEvent) => void
}) {
  return (
    <div id={`row-${id}`} class="list-row note-row" role="option" aria-selected={selected} onClick={onSelect}
      onContextMenu={onMenu && (e => { onSelect(); onMenu(e) })}>
      {sun && <Icon name="sun" size={12} class="accent" style={{ marginTop: 3, flex: 'none' }} />}
      <div class="col" style={{ gap: 2, flex: 1 }}>
        <span class="t-body semibold ellipsis">{title}</span>
        <span class="row t-caption" style={{ gap: 6 }}>
          {date && <span style={{ opacity: 0.8, flex: 'none' }}>{date}</span>}
          <span class="secondary ellipsis">{preview ?? 'No additional text'}</span>
        </span>
      </div>
    </div>
  )
}

/** "9:41 AM" today, "Yesterday", the weekday this week, else "10/12/26". */
function dateText(date: Date, now: Date): string {
  if (isSameDay(date, now)) return timeText(date)
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86_400_000)
  if (days === 1) return 'Yesterday'
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' })
  return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' })
}

function NoteEditor({ note, day, onPin, onDelete, onCreated }: {
  note?: SyncNote; day: Date; onPin: () => void; onDelete?: () => void; onCreated: (id: string) => void
}) {
  const [showBriefing, setShowBriefing] = useState(true)
  const noteDay = note?.day ? dayDate(note.day) : note ? undefined : day
  const briefing = noteDay ? doc.value.briefings[dayString(noteDay)] : undefined

  const onInput = (body: string) => {
    if (note) return change(d => updateNote(d, note.id, { body }))
    // Today's daily note is created on the first keystroke.
    const { doc: next, id } = ensureDailyNote(doc.value, day)
    change(() => updateNote(next, id, { body }))
    onCreated(id)
  }

  return (
    <div class="note-editor">
      <div class="row" style={{ alignItems: 'baseline', padding: '20px 28px 14px' }}>
        <div class="col" style={{ gap: 2 }}>
          {noteDay ? <>
            <h2 class="t-headline" style={{ margin: 0 }}>{noteDay.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h2>
            <span class="t-body secondary">Daily Note</span>
          </> : note && (
            <span class="t-caption secondary">Edited {new Date(note.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          )}
        </div>
        <span class="spacer" />
        {onDelete && <button class="icon-button" aria-label="Delete note" title="Delete" onClick={onDelete}><Icon name="trash" /></button>}
        {note && (
          <button class="icon-button" aria-label={note.isPinned ? 'Unpin note' : 'Pin note'} onClick={onPin}
            title={note.isPinned ? 'Unpin' : 'Pin to the top. Pinned notes are shared with Claude for the briefing and chat.'}>
            <Icon name={note.isPinned ? 'pinFill' : 'pin'} style={{ color: note.isPinned ? 'var(--accent)' : undefined }} />
          </button>
        )}
      </div>
      {claudeEnabled.value && briefing && briefing.bullets.length > 0 && (
        <div class="note-briefing">
          <button class="row t-section accent" onClick={() => setShowBriefing(!showBriefing)} aria-expanded={showBriefing} style={{ gap: 6 }}>
            <Icon name="sparkle" size={12} />Morning Briefing
            <Icon name="chevronRight" size={10} style={{ transform: showBriefing ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }} />
          </button>
          {showBriefing && <ul class="briefing-list">{briefing.bullets.map((b, i) => <li key={i} class="t-body">{b}</li>)}</ul>}
        </div>
      )}
      <textarea class="note-text t-reading" aria-label="Note" value={note?.body ?? ''} onInput={e => onInput(e.currentTarget.value)}
        placeholder={noteDay ? "How's the day going? Plans, thoughts, things to remember…" : 'Start typing. The first line becomes the title.'} />
    </div>
  )
}
