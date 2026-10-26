// Port of CalendarView / TimeGridView / CalendarSidePanel: Day and Week time grids of Google and
// hand-added events, with a mini month and the day's agenda (or the selected event) on the right.
// The panel hides below 1000 px of page width behind a button, like the Mac.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { addDays, addMonths, hourText, isSameDay, startOfDay, timeText } from '../../logic/dates'
import { eventsOn, isEditable, minutesInto, monthGrid, slots, weekDays, type CalendarEvent } from '../../logic/calendar'
import { ensureEvents } from '../../google/loader'
import { allEvents, google, mutedIDs } from '../../state'
import { IconButton, PageTitle, Segmented, isTyping, useNarrow } from '../components'
import { EventEditor, askDeleteEvent, defaultEventStart, eventColor, eventMenu, timeRangeText } from '../eventUI'
import { Icon } from '../icons'
import { useNow } from './Overview'

type Mode = 'day' | 'week'
const HOUR = 52
const GUTTER = 58
const MAX_ALL_DAY = 3

export function CalendarPage() {
  const phone = useNarrow(760)
  const narrow = useNarrow(1210) // 1000 pt of page plus the 210 px sidebar
  const [mode, setMode] = useState<Mode>(phone ? 'day' : 'week')
  const [day, setDay] = useState(startOfDay(new Date()))
  const [selectedID, setSelectedID] = useState<string | undefined>()
  const [showPanel, setShowPanel] = useState(false)
  const [editor, setEditor] = useState<{ event?: CalendarEvent; start?: Date } | undefined>()
  const days = mode === 'day' ? [day] : weekDays(day)
  const panel = !narrow || showPanel

  useEffect(() => { ensureEvents(days[0], addDays(days[days.length - 1], 1)) }, [days[0].getTime(), mode])

  const shift = (direction: number) => setDay(d => addDays(d, mode === 'day' ? direction : 7 * direction))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || document.querySelector('.scrim')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'ArrowLeft') { e.preventDefault(); shift(-1) }
      else if (mod && e.key === 'ArrowRight') { e.preventDefault(); shift(1) }
      else if (!mod && !e.altKey && e.key.toLowerCase() === 't') setDay(startOfDay(new Date()))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  const month = narrow ? 'short' : 'long'
  const title = mode === 'day'
    ? day.toLocaleDateString(undefined, { month, day: 'numeric', year: 'numeric' })
    : day.toLocaleDateString(undefined, { month, year: 'numeric' })
  const selected = selectedID ? allEvents.value.find(e => e.id === selectedID) : undefined

  return (
    <div class="pane">
      <div class="pane-header wrap">
        <PageTitle title={title} subtitle={mode === 'day' ? day.toLocaleDateString(undefined, { weekday: 'long' }) : undefined} />
        <span class="spacer" />
        <Segmented label="View" value={mode} onChange={setMode} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} />
        <div class="segmented" role="group" aria-label="Move">
          <button aria-label={mode === 'day' ? 'Previous day' : 'Previous week'} title={mode === 'day' ? 'Previous day (⌘←)' : 'Previous week (⌘←)'} onClick={() => shift(-1)}><Icon name="chevronLeft" size={12} /></button>
          <button title="Go to today (T)" onClick={() => setDay(startOfDay(new Date()))}>Today</button>
          <button aria-label={mode === 'day' ? 'Next day' : 'Next week'} title={mode === 'day' ? 'Next day (⌘→)' : 'Next week (⌘→)'} onClick={() => shift(1)}><Icon name="chevronRight" size={12} /></button>
        </div>
        {narrow && <IconButton icon="sidebarRight" label={showPanel ? 'Hide side panel' : 'Show side panel'} onClick={() => setShowPanel(!showPanel)} />}
        <IconButton icon="plus" label="New event" onClick={() => setEditor({ start: defaultEventStart(day) })} />
      </div>
      <div class="pane-divider" />
      {google.value.calendarError && <div class="banner"><Icon name="warning" />Couldn't load Google Calendar: {google.value.calendarError}</div>}
      <div class="row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch', gap: 0 }}>
        {!(phone && showPanel) && <TimeGrid days={days} selectedID={selectedID} onSelect={setSelectedID}
          onSelectDay={d => { setDay(d); setMode('day') }} onCreate={start => setEditor({ start })}
          onEdit={event => setEditor({ event })} />}
        {panel && <>
          <div class="vdivider" />
          <aside class="calendar-panel" aria-label="Month and day">
            <MiniMonth selected={day} onSelect={d => { setDay(d); setSelectedID(undefined) }} />
            <div class="pane-divider" />
            {selected ? <EventDetail event={selected} onClose={() => setSelectedID(undefined)} onEdit={() => setEditor({ event: selected })} />
              : <DayAgenda day={day} onSelect={setSelectedID} />}
          </aside>
        </>}
      </div>
      {editor && <EventEditor event={editor.event} start={editor.start} onClose={() => setEditor(undefined)} />}
    </div>
  )
}

// MARK: Time grid

function TimeGrid({ days, selectedID, onSelect, onSelectDay, onCreate, onEdit }: {
  days: Date[]; selectedID?: string; onSelect: (id?: string) => void; onSelectDay: (d: Date) => void
  onCreate: (start: Date) => void; onEdit: (e: CalendarEvent) => void
}) {
  const now = useNow()
  const scroller = useRef<HTMLDivElement>(null)
  const start = days[0], end = addDays(days[days.length - 1], 1)
  const events = allEvents.value.filter(e => e.start < end && e.end > start)
  const allDay = events.filter(e => e.isAllDay)
  const muted = mutedIDs.value

  // Open scrolled to an hour before now (or 8 AM).
  useLayoutEffect(() => {
    const showsToday = days.some(d => isSameDay(d, now))
    const hour = showsToday ? Math.max(now.getHours() - 1, 0) : 8
    if (scroller.current) scroller.current.scrollTop = hour * HOUR
  }, [days.length])

  const showsToday = days.some(d => isSameDay(d, now))
  const nowMinutes = minutesInto(now, now)
  const columns = `${GUTTER}px repeat(${days.length}, minmax(0, 1fr))`

  return (
    <div class="time-grid">
      <div class="grid-head" style={{ gridTemplateColumns: columns }}>
        <span />
        {days.map(d => {
          const today = isSameDay(d, now)
          return (
            <button key={d.getTime()} class="day-head" onClick={() => onSelectDay(d)} title={`Show ${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}>
              <span class="t-caption medium" style={{ color: today ? 'var(--today)' : 'var(--text-2)' }}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span class={`t-reading day-number ${today ? 'today' : ''}`}>{d.getDate()}</span>
            </button>
          )
        })}
      </div>
      {allDay.length > 0 && (
        <div class="all-day" style={{ gridTemplateColumns: columns }}>
          <span class="t-tiny secondary" style={{ textAlign: 'right', paddingRight: 8, paddingTop: 5 }}>all-day</span>
          {days.map(d => {
            const items = eventsOn(allDay, d)
            return (
              <div key={d.getTime()} class="col" style={{ gap: 2, padding: 3 }}>
                {items.slice(0, MAX_ALL_DAY).map(e => (
                  <EventBlock key={e.id} event={e} muted={muted.has(e.id)} selected={selectedID === e.id} style="allDay"
                    onClick={() => onSelect(e.id)} onEdit={() => onEdit(e)} />
                ))}
                {items.length > MAX_ALL_DAY && <button class="t-tiny medium secondary" style={{ textAlign: 'left', paddingLeft: 4 }} onClick={() => onSelectDay(d)}>+{items.length - MAX_ALL_DAY} more</button>}
              </div>
            )
          })}
        </div>
      )}
      <div class="grid-scroll" ref={scroller}>
        <div class="grid-body" style={{ gridTemplateColumns: columns, height: HOUR * 24 }}>
          <div class="hours">
            {Array.from({ length: 24 }, (_, h) => {
              // Hidden within 15 minutes of the current-time label, like Apple Calendar.
              const hidden = h === 0 || (showsToday && Math.abs(h * 60 - nowMinutes) < 15)
              return <span key={h} class="t-tiny medium secondary hour-label" style={{ top: h * HOUR - 6, visibility: hidden ? 'hidden' : undefined }}>
                {hourText(new Date(2000, 0, 1, h))}
              </span>
            })}
            {showsToday && <span class="t-tiny now-label" style={{ top: nowMinutes / 60 * HOUR - 6 }}>{timeText(now)}</span>}
          </div>
          {days.map(d => (
            <DayColumn key={d.getTime()} day={d} now={now} events={eventsOn(events.filter(e => !e.isAllDay), d)} muted={muted}
              selectedID={selectedID} onSelect={onSelect} onCreate={onCreate} onEdit={onEdit} />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayColumn({ day, now, events, muted, selectedID, onSelect, onCreate, onEdit }: {
  day: Date; now: Date; events: CalendarEvent[]; muted: Set<string>; selectedID?: string; onSelect: (id?: string) => void
  onCreate: (start: Date) => void; onEdit: (e: CalendarEvent) => void
}) {
  const layout = slots(events.map(e => ({ id: e.id, start: e.start, end: e.end })))
  const ref = useRef<HTMLDivElement>(null)
  /** The half hour nearest to a double-click. */
  const startAt = (y: number) => new Date(day.getTime() + Math.floor((y / HOUR * 60) / 30) * 30 * 60_000)
  const today = isSameDay(day, now)
  return (
    <div class="day-column" ref={ref} onClick={e => { if (e.target === e.currentTarget) onSelect(undefined) }}
      onDblClick={e => { if (e.target === e.currentTarget) onCreate(startAt(e.offsetY)) }}>
      {events.map(e => {
        const slot = layout[e.id] ?? { column: 0, columns: 1 }
        const top = minutesInto(e.start, day) / 60 * HOUR
        const height = Math.max(minutesInto(e.end, day) / 60 * HOUR - top - 2, 20)
        return (
          <EventBlock key={e.id} event={e} muted={muted.has(e.id)} selected={selectedID === e.id} style={height < 38 ? 'compact' : 'regular'}
            position={{ top: top + 1, height, left: `calc(2px + (100% - 6px) * ${slot.column / slot.columns})`, width: `calc((100% - 6px) / ${slot.columns} - 2px)` }}
            onClick={() => onSelect(e.id)} onEdit={() => onEdit(e)} />
        )
      })}
      {today && <div class="now-line" style={{ top: minutesInto(now, now) / 60 * HOUR }} />}
    </div>
  )
}

function EventBlock({ event, muted, selected, style, position, onClick, onEdit }: {
  event: CalendarEvent; muted: boolean; selected: boolean; style: 'regular' | 'compact' | 'allDay'
  position?: { top: number; height: number; left: string; width: string }; onClick: () => void; onEdit: () => void
}) {
  const color = eventColor(event)
  return (
    <button class={`event-block ${style}`} title={`${event.title}\n${timeRangeText(event)}`}
      style={{
        ...(position ?? {}), position: position ? 'absolute' : undefined, opacity: muted ? 0.55 : 1,
        background: `color-mix(in srgb, ${color} ${selected ? 55 : 34}%, var(--card))`, borderColor: selected ? color : 'transparent',
      }}
      onClick={e => { e.stopPropagation(); onClick() }} onDblClick={e => { e.stopPropagation(); if (isEditable(event)) onEdit() }}
      onContextMenu={e => eventMenu(e, event, isEditable(event) ? onEdit : undefined)}>
      <span class="event-bar" style={{ background: color }} />
      <span class="col" style={{ gap: 1, padding: style === 'regular' ? '4px 5px' : '2px 5px', minWidth: 0, flex: 1 }}>
        <span class="row" style={{ gap: 3 }}>
          {muted && <Icon name="bellSlash" size={9} class="secondary" />}
          <span class={`t-meta semibold ${style === 'regular' ? 'clamp-2' : 'ellipsis'}`}>{event.title}</span>
          {style === 'compact' && <span class="t-tiny secondary ellipsis" style={{ flex: 'none' }}>{timeText(event.start)}</span>}
        </span>
        {style === 'regular' && <>
          <span class="t-tiny secondary">{timeText(event.start)}</span>
          {event.location && <span class="t-tiny secondary ellipsis">{event.location}</span>}
        </>}
      </span>
    </button>
  )
}

// MARK: Side panel

function MiniMonth({ selected, onSelect }: { selected: Date; onSelect: (d: Date) => void }) {
  const [month, setMonth] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1))
  useEffect(() => {
    if (selected.getMonth() !== month.getMonth() || selected.getFullYear() !== month.getFullYear()) setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1))
  }, [selected.getTime()])
  const grid = monthGrid(month)
  useEffect(() => { ensureEvents(grid[0], addDays(grid[41], 1)) }, [month.getTime()])
  const busy = new Set(allEvents.value.map(e => startOfDay(e.start).getTime()))
  const today = new Date()
  return (
    <div class="col" style={{ gap: 8 }}>
      <div class="row">
        <span class="t-body semibold">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <span class="spacer" />
        <IconButton icon="chevronLeft" label="Previous month" onClick={() => setMonth(addMonths(month, -1))} />
        <IconButton icon="chevronRight" label="Next month" onClick={() => setMonth(addMonths(month, 1))} />
      </div>
      <div class="mini-month">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((s, i) => <span key={i} class="t-tiny semibold secondary">{s}</span>)}
        {grid.map(d => {
          const inMonth = d.getMonth() === month.getMonth()
          const isToday = isSameDay(d, today), isSelected = isSameDay(d, selected)
          return (
            <button key={d.getTime()} class="mini-day" onClick={() => onSelect(startOfDay(d))} aria-label={d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              aria-pressed={isSelected}>
              <span class="t-meta" style={{
                fontWeight: isToday || isSelected ? 700 : 400,
                color: isSelected ? '#fff' : isToday ? 'var(--today)' : inMonth ? 'var(--text)' : 'color-mix(in srgb, var(--text-2) 50%, transparent)',
                background: isSelected ? (isToday ? 'var(--today)' : 'var(--accent)') : undefined,
              }}>{d.getDate()}</span>
              <i style={{ background: inMonth && busy.has(startOfDay(d).getTime()) ? 'var(--text-2)' : 'transparent' }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DayAgenda({ day, onSelect }: { day: Date; onSelect: (id: string) => void }) {
  const events = eventsOn(allEvents.value, day).sort((a, b) => (a.isAllDay === b.isAllDay ? a.start.getTime() - b.start.getTime() : a.isAllDay ? -1 : 1))
  const muted = mutedIDs.value
  return (
    <div class="col" style={{ gap: 10 }}>
      <h3 class="t-section secondary" style={{ margin: 0 }}>{day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
      {events.length === 0 && <span class="t-body secondary">No events</span>}
      {events.map(e => (
        <button key={e.id} class="agenda-row" onClick={() => onSelect(e.id)} onContextMenu={ev => eventMenu(ev, e)} style={{ opacity: muted.has(e.id) ? 0.6 : 1 }}>
          <span class="event-bar" style={{ background: eventColor(e) }} />
          <span class="col" style={{ gap: 2, minWidth: 0 }}>
            <span class="row" style={{ gap: 4 }}>
              {muted.has(e.id) && <Icon name="bellSlash" size={9} class="secondary" />}
              <span class="t-body medium ellipsis">{e.title}</span>
            </span>
            <span class="t-caption secondary">{timeRangeText(e)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function EventDetail({ event, onClose, onEdit }: { event: CalendarEvent; onClose: () => void; onEdit: () => void }) {
  const muted = mutedIDs.value.has(event.id)
  return (
    <div class="col" style={{ gap: 12 }}>
      <div class="row" style={{ alignItems: 'flex-start' }}>
        <span class="event-bar" style={{ background: eventColor(event), height: 22 }} />
        <h3 class="t-headline" style={{ margin: 0, flex: 1 }}>{event.title}</h3>
        <IconButton icon="xmark" label="Close" onClick={onClose} />
      </div>
      <div class="col" style={{ gap: 4 }}>
        <span class="t-body">{event.start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        <span class="t-body secondary">{timeRangeText(event)}</span>
      </div>
      {event.location && <div class="row t-body"><Icon name="pin" size={14} class="secondary" />{event.location}</div>}
      <div class="row t-caption secondary"><Icon name="calendar" size={14} />{event.source === 'manual' ? 'Added in LifeTracker' : event.calendarName ?? 'Google Calendar'}</div>
      {muted && <div class="row t-caption secondary"><Icon name="bellSlash" size={12} />Muted: not mentioned in your briefing</div>}
      {event.notes && <div class="t-body" style={{ whiteSpace: 'pre-wrap' }}>{event.notes}</div>}
      <div class="row" style={{ flexWrap: 'wrap' }}>
        {isEditable(event) && <>
          <button class="plain-button" onClick={onEdit}><Icon name="pencil" size={13} />Edit</button>
          <button class="plain-button destructive" onClick={() => askDeleteEvent(event, onClose)}><Icon name="trash" size={13} />Delete</button>
        </>}
        <button class="plain-button" onClick={e => eventMenu(e, event)}><Icon name="ellipsis" size={13} />More</button>
      </div>
    </div>
  )
}
