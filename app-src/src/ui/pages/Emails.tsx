// Port of EmailsView: unread inbox mail, one row per conversation, grouped Needs Reply / FYI /
// Newsletters / Other, with a reading pane. Below 760 px it's the list or one conversation.
import { useState } from 'preact/hooks'
import type { EmailCategory } from '../../sync/document'
import { isSameDay, timeText } from '../../logic/dates'
import {
  CATEGORIES, categoryTitle, filterTitle, groupThreads, latest, participants, setCategory, threadCategory, threadSubject, threadSummary,
  type EmailMessage, type EmailThread,
} from '../../logic/email'
import { auth, renew } from '../../auth'
import { refreshGoogle } from '../../google/loader'
import { change, emails, google } from '../../state'
import { Empty, PageTitle, ReconnectBanner, Segmented, isTyping, showMenu, stepSelection, useNarrow } from '../components'
import { Icon, type IconName } from '../icons'

type Filter = 'all' | EmailCategory

export const categoryIcon: Record<EmailCategory, IconName> = { needsReply: 'reply', fyi: 'info', newsletter: 'newspaper' }


export function EmailsPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | undefined>()
  // The sidebar takes 210 px, so the Mac's 760 pt window rule is ~970 px of browser width here.
  const narrow = useNarrow(970)
  const g = google.value
  const threads = groupThreads(emails.value)
  const signedOut = auth.value.status === 'expired' || !!g.gmailError
  const ordered = filter === 'all'
    ? [...CATEGORIES.flatMap(c => threads.filter(t => threadCategory(t) === c)), ...threads.filter(t => !threadCategory(t))]
    : threads.filter(t => threadCategory(t) === filter)
  const thread = threads.find(t => t.id === selected)

  const replies = threads.filter(t => threadCategory(t) === 'needsReply').length
  let subtitle = `${g.unreadCount} unread`
  if (threads.length !== g.unreadCount) subtitle += ` in ${threads.length} conversation${threads.length === 1 ? '' : 's'}`
  if (replies) subtitle += ` · ${replies} need${replies === 1 ? 's' : ''} a reply`
  const label = (f: Filter) => {
    if (f === 'all') return 'All'
    const count = threads.filter(t => threadCategory(t) === f).length
    return count ? `${filterTitle[f]} (${count})` : filterTitle[f]
  }

  const onKey = (e: KeyboardEvent) => {
    if (isTyping(e)) return
    stepSelection(e, ordered.map(t => t.id), selected, setSelected)
  }

  let body
  if (!g.gmailLoaded && !threads.length) {
    body = signedOut
      ? <Empty icon="envelope" title="Couldn't Load Gmail" description={g.gmailError ?? 'Your Google sign-in expired.'}>
          <button class="plain-button" onClick={() => auth.value.status === 'expired' ? renew().then(refreshGoogle).catch(() => {}) : refreshGoogle()}>Try Again</button>
        </Empty>
      : <Empty icon="envelope" title="Loading Email…" />
  } else if (!threads.length) {
    body = <Empty icon="checkCircle" title="Inbox Zero" description="No unread email right now." />
  } else if (narrow && thread) {
    body = (
      <div class="col" style={{ flex: 1, minHeight: 0 }}>
        <button class="link-button row t-body" style={{ padding: '12px 20px 0', gap: 4 }} onClick={() => setSelected(undefined)}>
          <Icon name="chevronLeft" size={14} />Inbox
        </button>
        <ThreadDetail thread={thread} />
      </div>
    )
  } else {
    const list = (
      <div class={`list email-list ${narrow ? '' : 'email-list-side'}`} tabIndex={0} onKeyDown={onKey} role="listbox" aria-label="Conversations">
        {filter !== 'all' ? (
          ordered.length ? ordered.map(t => <ThreadRow key={t.id} thread={t} selected={t.id === selected} onSelect={() => setSelected(t.id)} />)
            : <Empty icon={categoryIcon[filter]} title="Nothing Here" />
        ) : <>
          {CATEGORIES.map(c => {
            const items = threads.filter(t => threadCategory(t) === c)
            return items.length ? <Section key={c} title={categoryTitle[c]} items={items} selected={selected} onSelect={setSelected} /> : null
          })}
          {threads.some(t => !threadCategory(t)) && <Section title="Other" items={threads.filter(t => !threadCategory(t))} selected={selected} onSelect={setSelected} />}
        </>}
      </div>
    )
    body = narrow ? list : (
      <div class="row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch', gap: 0 }}>
        {list}
        <div class="vdivider" />
        <div class="col" style={{ flex: 1, minHeight: 0 }}>
          {thread ? <ThreadDetail thread={thread} /> : <Empty icon="envelopeOpen" title="Select a Conversation" />}
        </div>
      </div>
    )
  }

  return (
    <div class="pane">
      <div class="pane-header wrap">
        <PageTitle title="Inbox" subtitle={g.gmailLoaded || threads.length ? subtitle : undefined} />
        <span class="spacer" />
        <Segmented label="Show" value={filter} onChange={setFilter}
          options={(['all', ...CATEGORIES] as Filter[]).map(f => ({ value: f, label: label(f) }))} />
      </div>
      <div class="pane-divider" />
      {signedOut && threads.length > 0 && (
        <ReconnectBanner message="Gmail isn't reachable right now, so this is the mail loaded earlier."
          onReconnect={() => (auth.value.status === 'expired' ? renew().then(refreshGoogle) : refreshGoogle()).catch(() => {})} />
      )}
      {body}
    </div>
  )
}

function Section({ title, items, selected, onSelect }: { title: string; items: EmailThread[]; selected?: string; onSelect: (id: string) => void }) {
  return (
    <div role="group" aria-label={title}>
      <div class="list-section">{title}</div>
      {items.map(t => <ThreadRow key={t.id} thread={t} selected={t.id === selected} onSelect={() => onSelect(t.id)} />)}
    </div>
  )
}

const listTime = (date: Date) => (isSameDay(date, new Date()) ? timeText(date) : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))

function moveMenu(e: MouseEvent, thread: EmailThread) {
  const current = threadCategory(thread)
  showMenu(e, CATEGORIES.map(c => ({
    label: `Move to ${categoryTitle[c]}`, icon: categoryIcon[c], disabled: current === c,
    action: () => change(d => setCategory(d, thread.messages.map(m => m.id), c)),
  })))
}

function ThreadRow({ thread, selected, onSelect }: { thread: EmailThread; selected: boolean; onSelect: () => void }) {
  const email = latest(thread)
  return (
    <div id={`row-${thread.id}`} class="list-row thread-row" role="option" aria-selected={selected} onClick={onSelect}
      onContextMenu={e => { onSelect(); moveMenu(e, thread) }}>
      <span class="unread-dot" />
      <div class="col" style={{ gap: 3, flex: 1 }}>
        <div class="row" style={{ gap: 6 }}>
          <span class="t-body semibold ellipsis">{participants(thread).join(', ')}</span>
          {thread.messages.length > 1 && <span class="count-pill">{thread.messages.length}</span>}
          <span class="spacer" />
          <span class="t-caption secondary" style={{ flex: 'none' }}>{listTime(email.receivedAt)}</span>
        </div>
        <span class="t-body ellipsis">{threadSubject(thread)}</span>
        <span class="t-caption secondary clamp-2">{threadSummary(thread) ?? email.snippet}</span>
      </div>
    </div>
  )
}

function ThreadDetail({ thread }: { thread: EmailThread }) {
  const category = threadCategory(thread)
  const summary = threadSummary(thread)
  const count = thread.messages.length
  return (
    <div class="thread-detail">
      <div class="col" style={{ gap: 16, maxWidth: 820 }}>
        <div class="row" style={{ alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 class="t-headline" style={{ margin: 0, flex: 1, minWidth: 200 }}>{threadSubject(thread)}</h2>
          <a class="accent-button compact" href={latest(thread).webURL} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={12} />Open in Gmail
          </a>
        </div>
        <div class="row" style={{ gap: 10 }}>
          <button class="plain-button" onClick={e => moveMenu(e, thread)} title="Re-sort this conversation. Your choice sticks.">
            <Icon name={category ? categoryIcon[category] : 'tray'} size={14} />{category ? categoryTitle[category] : 'Not sorted yet'}
            <Icon name="chevronDown" size={10} />
          </button>
          <span class="t-caption secondary">{count} unread message{count === 1 ? '' : 's'}</span>
        </div>
        {summary && (
          <div class="summary-box"><Icon name="sparkle" size={14} class="accent" /><span class="t-body">{summary}</span></div>
        )}
        {/* Oldest first, like reading the conversation. */}
        <div class="col" style={{ gap: 10 }}>
          {[...thread.messages].reverse().map(m => <MessageCard key={m.id} message={m} />)}
        </div>
      </div>
    </div>
  )
}

function MessageCard({ message }: { message: EmailMessage }) {
  return (
    <div class="message-card">
      <div class="row" style={{ alignItems: 'baseline' }}>
        <div class="col" style={{ gap: 1 }}>
          <span class="t-body semibold">{message.sender}</span>
          {message.senderAddress && message.senderAddress !== message.sender && <span class="t-caption secondary">{message.senderAddress}</span>}
        </div>
        <span class="spacer" />
        <span class="t-caption secondary">{message.receivedAt.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      {message.summary && <div class="row t-caption accent" style={{ alignItems: 'flex-start' }}><Icon name="sparkle" size={12} />{message.summary}</div>}
      <div class="t-body secondary">{message.snippet || 'No preview available.'}</div>
    </div>
  )
}
