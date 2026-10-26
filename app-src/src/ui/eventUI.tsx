// Event pieces shared by the Overview and the Calendar: the editor for hand-added events (Google
// events are read-only), the right-click menu, colors and time text (EventEditor.swift, EventStyle.swift).
import { useState } from 'preact/hooks'
import { addDays, startOfDay, timeText } from '../logic/dates'
import { deleteEvent, isEditable, isMuted, mute, saveEvent, unmute, type CalendarEvent } from '../logic/calendar'
import { change, muteRules } from '../state'
import { confirm, Sheet, showMenu, type MenuItem } from './components'

/** The calendar's color (Google), or the accent for hand-added events. */
export const eventColor = (event: CalendarEvent) => event.colorHex ?? 'var(--accent)'

export const timeRangeText = (event: CalendarEvent) => (event.isAllDay ? 'All day' : `${timeText(event.start)} – ${timeText(event.end)}`)

/** The next whole hour today, else 9:00 on `day`. */
export function defaultEventStart(day: Date): Date {
  const now = new Date()
  if (startOfDay(day).getTime() === startOfDay(now).getTime()) {
    const next = new Date(now)
    next.setHours(now.getHours() + 1, 0, 0, 0)
    return next
  }
  const start = startOfDay(day)
  start.setHours(9)
  return start
}

export function eventMenu(e: MouseEvent, event: CalendarEvent, onEdit?: () => void) {
  const muted = isMuted(event, muteRules.value)
  const items: MenuItem[] = [
    muted
      ? { label: 'Mention in Briefing Again', icon: 'bell', action: () => change(d => unmute(d, event)) }
      : { label: event.seriesID ? "Don't Mention This Repeating Event" : "Don't Mention in Briefing", icon: 'bellSlash', action: () => change(d => mute(d, event)) },
  ]
  if (isEditable(event)) {
    items.push('divider')
    if (onEdit) items.push({ label: 'Edit Event…', icon: 'pencil', action: onEdit })
    items.push({ label: 'Delete Event', icon: 'trash', destructive: true, action: () => askDeleteEvent(event) })
  }
  showMenu(e, items)
}

export function askDeleteEvent(event: CalendarEvent, after?: () => void) {
  confirm({
    title: `Delete “${event.title}”?`, message: 'This removes it from LifeTracker on your Mac too.', action: 'Delete', destructive: true,
    onConfirm: () => { change(d => deleteEvent(d, event.id)); after?.() },
  })
}

const pad = (n: number) => String(n).padStart(2, '0')
const localValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const dateValue = (d: Date) => localValue(d).slice(0, 10)
const parseLocal = (value: string) => {
  const [date, time = '00:00'] = value.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h, min)
}

/** New event (starting at `start`), or edit a hand-added one. */
export function EventEditor({ event, start, onClose }: { event?: CalendarEvent; start?: Date; onClose: () => void }) {
  const initialStart = event?.start ?? start ?? defaultEventStart(new Date())
  const [title, setTitle] = useState(event?.title ?? '')
  const [isAllDay, setAllDay] = useState(event?.isAllDay ?? false)
  const [from, setFrom] = useState(localValue(initialStart))
  const [to, setTo] = useState(localValue(event?.end ?? new Date(initialStart.getTime() + 3600_000)))
  const [location, setLocation] = useState(event?.location ?? '')
  const [notes, setNotes] = useState(event?.notes ?? '')

  // Keep the event's length when the start moves.
  const moveStart = (value: string) => {
    if (!value) return
    const length = parseLocal(to).getTime() - parseLocal(from).getTime()
    setFrom(value)
    setTo(localValue(new Date(parseLocal(value).getTime() + Math.max(length, 0))))
  }
  const save = () => {
    if (!title.trim()) return
    const s = isAllDay ? startOfDay(parseLocal(from)) : parseLocal(from)
    const e = isAllDay ? addDays(s, 1) : parseLocal(to)
    change(d => saveEvent(d, { title, start: s, end: e < s ? s : e, isAllDay, location, notes }, event?.id))
    onClose()
  }

  return (
    <Sheet title={event ? 'Edit Event' : 'New Event'} onClose={onClose} width={420} actions={<>
      {event && <button class="plain-button destructive" onClick={() => askDeleteEvent(event, onClose)}>Delete…</button>}
      <span class="spacer" />
      <button class="plain-button" onClick={onClose}>Cancel</button>
      <button class="accent-button" onClick={save} disabled={!title.trim()}>{event ? 'Save' : 'Add'}</button>
    </>}>
      <form class="col" style={{ gap: 10 }} onSubmit={e => { e.preventDefault(); save() }}>
        <input class="text-input" aria-label="Title" placeholder="Title" value={title} data-autofocus onInput={e => setTitle(e.currentTarget.value)} />
        <label class="form-row"><input type="checkbox" checked={isAllDay} onChange={e => setAllDay(e.currentTarget.checked)} />All day</label>
        {isAllDay ? (
          <div class="form-row">
            <label for="event-date">Date</label>
            <input id="event-date" type="date" class="text-input" value={dateValue(parseLocal(from))}
              onInput={e => e.currentTarget.value && moveStart(`${e.currentTarget.value}T${from.slice(11) || '09:00'}`)} />
          </div>
        ) : <>
          <div class="form-row">
            <label for="event-start">Starts</label>
            <input id="event-start" type="datetime-local" class="text-input" value={from} onInput={e => moveStart(e.currentTarget.value)} />
          </div>
          <div class="form-row">
            <label for="event-end">Ends</label>
            <input id="event-end" type="datetime-local" class="text-input" min={from} value={to} onInput={e => e.currentTarget.value && setTo(e.currentTarget.value)} />
          </div>
        </>}
        <input class="text-input" aria-label="Location" placeholder="Location" value={location} onInput={e => setLocation(e.currentTarget.value)} />
        <textarea class="text-input" aria-label="Notes" placeholder="Notes" rows={3} value={notes} onInput={e => setNotes(e.currentTarget.value)} />
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}
