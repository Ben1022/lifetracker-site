// Port of OverviewView: greeting and connection dots, Today's Schedule over Unread Emails on the
// left, the tall Tasks card on the right (equal heights), and the briefing below when Claude is on.
import { useEffect, useState } from 'preact/hooks'
import { auth } from '../../auth'
import { dayString, type SyncTask } from '../../sync/document'
import { addDays, longDayText, startOfDay, timeText } from '../../logic/dates'
import { eventsOn, type CalendarEvent } from '../../logic/calendar'
import { groupThreads, latest, overviewRank, threadCategory, threadSubject, threadSummary } from '../../logic/email'
import { overview, taskDueText } from '../../logic/filters'
import { greetingIcon, greetingText } from '../../logic/greeting'
import { addQuickTask } from '../../logic/tasks'
import { allEvents, change, claudeEnabled, doc, emails, google, lists, mutedIDs, sync } from '../../state'
import { go } from '../App'
import { Card, Dot, Sheet } from '../components'
import { EventEditor, eventMenu } from '../eventUI'
import { Icon } from '../icons'
import { TaskCheck, TaskEditor, taskMenu, useCompleting } from '../taskUI'

/** Re-renders every minute (the Mac's TimelineView(.everyMinute)). */
export function useNow(): Date {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

export function OverviewPage() {
  const now = useNow()
  const claude = claudeEnabled.value
  const briefing = doc.value.briefings[dayString(now)]
  const [showingBriefing, setShowingBriefing] = useState(false)
  return (
    <div class={`overview ${claude ? '' : 'fill'}`}>
      <OverviewHeader now={now} onBriefing={claude ? () => setShowingBriefing(true) : undefined}
        lastUpdated={claude && briefing ? new Date(briefing.generatedAt) : lastSynced()} />
      <div class="overview-grid">
        <div class="overview-left">
          <ScheduleCard now={now} />
          <UnreadEmailsCard />
        </div>
        <TasksCard now={now} />
      </div>
      {claude && <BriefingCard />}
      {showingBriefing && (
        <Sheet title={`Daily Briefing · ${longDayText(now)}`} onClose={() => setShowingBriefing(false)} width={560}
          actions={<><span class="spacer" /><button class="accent-button" onClick={() => setShowingBriefing(false)}>Done</button></>}>
          <BriefingBody full />
        </Sheet>
      )}
    </div>
  )
}

function lastSynced(): Date | undefined {
  const times = [google.value.calendarSyncedAt, google.value.gmailSyncedAt, sync.value.lastSyncedAt].filter(Boolean) as Date[]
  return times.length ? new Date(Math.max(...times.map(t => t.getTime()))) : undefined
}

type Status = 'connected' | 'needsAuth' | 'error' | 'notConnected'
const statusColor: Record<Status, string> = {
  connected: 'var(--positive)', needsAuth: 'var(--warning)', error: 'var(--danger)', notConnected: 'color-mix(in srgb, var(--text-2) 50%, transparent)',
}
const statusLabel: Record<Status, string> = { connected: 'Connected', needsAuth: 'Needs sign-in', error: 'Error', notConnected: 'Loading' }

export function connectionStatus(kind: 'calendar' | 'gmail'): Status {
  if (auth.value.status === 'expired' || auth.value.missingScopes) return 'needsAuth'
  const g = google.value
  if (kind === 'calendar') return g.calendarError ? 'error' : g.calendarSyncedAt ? 'connected' : 'notConnected'
  return g.gmailError ? 'error' : g.gmailLoaded ? 'connected' : 'notConnected'
}

function OverviewHeader({ now, lastUpdated, onBriefing }: { now: Date; lastUpdated?: Date; onBriefing?: () => void }) {
  const name = doc.value.settings?.userName?.trim()
  const icon = greetingIcon(now)
  const connections = [
    { name: 'Google Calendar', status: connectionStatus('calendar') },
    { name: 'Gmail', status: connectionStatus('gmail') },
  ]
  return (
    <header class="overview-header">
      <div class="col" style={{ gap: 6 }}>
        <div class="row" style={{ gap: 10 }}>
          <h1 class="t-greeting" style={{ margin: 0 }}>{greetingText(now)}{name ? `, ${name}` : ''}</h1>
          <Icon name={icon} size={24} style={{ color: icon === 'moon' ? '#F5C542' : '#F5B400' }} />
        </div>
        <div class="t-reading secondary">{longDayText(now)}</div>
      </div>
      <span class="spacer" />
      <div class="col overview-header-side">
        {onBriefing && <button class="accent-button" onClick={onBriefing}>Daily Briefing</button>}
        {lastUpdated && <div class="t-caption secondary">Last updated: {timeText(lastUpdated)}</div>}
        <button class="row t-caption secondary" style={{ gap: 10 }} onClick={() => go('settings')}
          aria-label={connections.map(c => `${c.name}: ${statusLabel[c.status]}`).join(', ')}>
          {connections.map(c => (
            <span key={c.name} class="row" style={{ gap: 4 }} title={`${c.name}: ${statusLabel[c.status]}`}>
              <Dot color={statusColor[c.status]} />{c.name}
            </span>
          ))}
        </button>
      </div>
    </header>
  )
}

// MARK: Schedule

function ScheduleCard({ now }: { now: Date }) {
  const [adding, setAdding] = useState(false)
  const hideMuted = doc.value.settings?.hideMuted ?? false
  const muted = mutedIDs.value
  const events = eventsOn(allEvents.value, now)
    .filter(e => !(hideMuted && muted.has(e.id)))
    .sort((a, b) => (a.isAllDay === b.isAllDay ? a.start.getTime() - b.start.getTime() : a.isAllDay ? -1 : 1))
  const highlight = events.filter(e => !e.isAllDay && e.end > now).sort((a, b) => a.start.getTime() - b.start.getTime())[0]?.id
  return (
    <Card title="Today's Schedule" footer="View calendar →" onFooter={() => go('calendar')}>
      <div class="col" style={{ gap: 4 }}>
        {events.length === 0 && <div class="t-body secondary" style={{ paddingBottom: 6 }}>
          {google.value.calendarSyncedAt ? 'Nothing on your calendar today.' : 'Loading your calendar…'}
        </div>}
        {events.map(e => <ScheduleRow key={e.id} event={e} now={now} highlighted={e.id === highlight} muted={muted.has(e.id)} />)}
        <button class="link-button row t-body" style={{ paddingTop: 6, gap: 6 }} onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} />Add event
        </button>
      </div>
      {adding && <EventEditor onClose={() => setAdding(false)} />}
    </Card>
  )
}

function ScheduleRow({ event, now, highlighted, muted }: { event: CalendarEvent; now: Date; highlighted: boolean; muted: boolean }) {
  return (
    <div class={`schedule-row ${highlighted ? 'highlighted' : ''}`} onContextMenu={e => eventMenu(e, event)}
      title={event.calendarName ? `${event.title} · ${event.calendarName}` : event.title}>
      <span class="t-body mono" style={{ width: 72, flex: 'none', color: highlighted ? 'var(--accent)' : 'var(--text-2)' }}>
        {event.isAllDay ? 'All day' : timeText(event.start)}
      </span>
      <span class="t-body ellipsis" style={{ fontWeight: highlighted ? 600 : 400, color: muted ? 'var(--text-2)' : undefined }}>
        {event.title}
      </span>
      {muted && <span title="Muted: not mentioned in your briefing" class="secondary"><Icon name="bellSlash" size={10} /></span>}
      <span class="spacer" />
      {highlighted && <span class="badge">{event.start <= now ? 'Now' : 'Next'}</span>}
    </div>
  )
}

// MARK: Emails

function UnreadEmailsCard() {
  const g = google.value
  const threads = groupThreads(emails.value).sort((a, b) => overviewRank(a) - overviewRank(b)).slice(0, 4)
  const signedOut = auth.value.status === 'expired' || !!g.gmailError
  return (
    <Card title="Unread Emails" footer={emails.value.length ? `View all (${g.unreadCount}) →` : undefined} onFooter={() => go('emails')}>
      {signedOut && (
        <div class="row t-caption secondary"><Icon name="warning" size={14} style={{ color: 'var(--warning)' }} />
          {emails.value.length ? "Gmail isn't reachable right now; showing the mail loaded earlier." : "Couldn't load Gmail."}
        </div>
      )}
      {!emails.value.length && !signedOut && <div class="t-body secondary">{g.gmailLoaded ? 'No unread email. Nice.' : 'Loading your email…'}</div>}
      {threads.length > 0 && <div class="col" style={{ gap: 12 }}>
        {threads.map(thread => {
          const email = latest(thread)
          return (
            <a key={thread.id} class="email-row" href={email.webURL} target="_blank" rel="noopener noreferrer" title={threadSummary(thread) ?? email.snippet}>
              <Icon name="envelope" size={16} class="secondary" />
              <span class="t-body ellipsis">{email.sender} – {threadSubject(thread)}</span>
              {thread.messages.length > 1 && <span class="t-tiny bold secondary">{thread.messages.length}</span>}
              {threadCategory(thread) === 'needsReply' && <span class="badge">Reply</span>}
              <span class="spacer" />
              <span class="t-caption secondary mono">{timeText(email.receivedAt)}</span>
            </a>
          )
        })}
      </div>}
    </Card>
  )
}

// MARK: Tasks

const MAX_ROWS = 14

function TasksCard({ now }: { now: Date }) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<SyncTask | undefined>()
  const [completing, complete] = useCompleting()
  const groups = overview(Object.values(doc.value.tasks), now)
  const total = groups.reduce((n, g) => n + g.tasks.length, 0)
  let remaining = MAX_ROWS
  const visible = groups.flatMap(g => {
    if (remaining <= 0) return []
    const shown = g.tasks.slice(0, remaining)
    remaining -= shown.length
    return [{ title: g.title, tasks: shown }]
  })
  const add = (e: Event) => {
    e.preventDefault()
    if (!text.trim()) return
    change(d => addQuickTask(d, text, { defaultDue: startOfDay(new Date()) }).doc)
    setText('')
  }
  return (
    <Card title="Tasks" footer="View all tasks →" onFooter={() => go('tasks')} class="tasks-card">
      <form class="field" onSubmit={add}>
        <Icon name="plusCircle" size={16} class="accent" />
        <input aria-label="Add a task" placeholder="Add a task. Try “Quiz fri 5pm p1 #UGBA 102A”" value={text}
          onInput={e => setText(e.currentTarget.value)} />
      </form>
      {!sync.value.loaded && total === 0 ? (
        <div class="t-body secondary">{sync.value.noFile ? 'Turn on sync on your Mac to see your tasks.' : 'Loading tasks…'}</div>
      ) : total === 0 ? (
        <div class="t-body secondary">Nothing due this week.</div>
      ) : <>
        {visible.map(group => (
          <div key={group.title} class="col" style={{ gap: 8 }}>
            <div class="t-meta semibold" style={{ color: group.title === 'Overdue' ? 'var(--danger)' : 'var(--text-2)' }}>{group.title}</div>
            {group.tasks.map(task => {
              const list = lists.value.find(l => l.id === task.listID)
              const when = group.title === 'Today' || group.title === 'Tomorrow'
                ? (task.dueHasTime && task.due ? timeText(new Date(task.due)) : '')
                : taskDueText(task, now)
              return (
                <div key={task.id} class="overview-task" onDblClick={() => setEditing(task)} onContextMenu={e => taskMenu(e, task, () => setEditing(task))}>
                  <TaskCheck task={task} completing={completing.has(task.id)} onToggle={() => complete(task)} />
                  <div class="col" style={{ gap: 2, flex: 1 }}>
                    <span class="t-body medium ellipsis">{task.title}</span>
                    {list && <span class="row t-meta secondary" style={{ gap: 4 }}><Dot color={list.colorHex} />{list.name}</span>}
                  </div>
                  <span class="row t-caption" style={{ gap: 4, color: group.title === 'Overdue' ? 'var(--danger)' : 'var(--text-2)', flex: 'none' }}>
                    {task.repeatRule && <Icon name="repeat" size={12} />}{when}
                  </span>
                  <button class="icon-button row-edit" aria-label={`Edit ${task.title}`} title="Edit" onClick={() => setEditing(task)}>
                    <Icon name="pencil" />
                  </button>
                </div>
              )
            })}
          </div>
        ))}
        {total > MAX_ROWS && <div class="t-caption secondary">and {total - MAX_ROWS} more…</div>}
      </>}
      {editing && <TaskEditor task={doc.value.tasks[editing.id] ?? editing} onClose={() => setEditing(undefined)} />}
    </Card>
  )
}

// MARK: Briefing

function BriefingCard() {
  return (
    <section class="briefing-card" aria-label="AI Briefing">
      <BriefingBody />
    </section>
  )
}

/** The Mac writes the briefing; the web only shows it (no Ask Claude here). */
function BriefingBody({ full }: { full?: boolean }) {
  const today = new Date()
  const briefing = doc.value.briefings[dayString(today)]
  const yesterday = !briefing ? doc.value.briefings[dayString(addDays(today, -1))] : undefined
  const shown = briefing ?? yesterday
  return (
    <div class="col" style={{ gap: 12 }}>
      {!full && (
        <div class="row">
          <Icon name="sparkle" size={14} class="accent" />
          <h2 class="t-section" style={{ margin: 0 }}>AI Briefing</h2>
          {shown?.source === 'basic' && <span class="chip" style={{ border: '1px solid var(--border)' }}>Basic: Claude unavailable</span>}
        </div>
      )}
      {!shown && <div class="t-callout secondary">Your briefing appears here after the morning refresh on your Mac.</div>}
      {yesterday && <div class="t-caption secondary">Today's briefing isn't ready yet. This is yesterday's.</div>}
      {shown && <>
        <ul class="briefing-list">
          {shown.bullets.map((b, i) => <li key={i} class="t-callout">{b}</li>)}
        </ul>
        {full && shown.suggestedTasks.length > 0 && <>
          <h3 class="t-section" style={{ margin: '4px 0 0' }}>Suggested Tasks</h3>
          <ul class="briefing-list">{shown.suggestedTasks.map((t, i) => <li key={i} class="t-body">{t}</li>)}</ul>
        </>}
        {shown.warnings.map((w, i) => (
          <div key={i} class="row t-caption secondary"><Icon name="warning" size={12} style={{ color: 'var(--warning)' }} />{w}</div>
        ))}
      </>}
    </div>
  )
}

