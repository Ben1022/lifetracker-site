// Ports of EmailThread.swift and EmailCategory.swift, plus re-sorting on the web.
import { iso, type EmailCategory, type SyncDocument } from '../sync/document'

/** One unread Gmail message (fetched straight from Gmail), with its sorting from the sync file. */
export interface EmailMessage {
  id: string
  threadID?: string
  sender: string
  senderAddress: string
  subject: string
  snippet: string
  receivedAt: Date
  webURL: string
  category?: EmailCategory
  summary?: string
}

export const CATEGORIES: EmailCategory[] = ['needsReply', 'fyi', 'newsletter']

export const categoryTitle: Record<EmailCategory, string> = {
  needsReply: 'Needs Reply',
  fyi: 'FYI',
  newsletter: 'Newsletters & Updates',
}

export const filterTitle: Record<EmailCategory, string> = { needsReply: 'Needs Reply', fyi: 'FYI', newsletter: 'Newsletters' }

export interface EmailThread {
  id: string
  /** Newest first. */
  messages: EmailMessage[]
}

export const latest = (thread: EmailThread) => thread.messages[0]

/** "Re: Grading" → "Grading", so a conversation reads by its topic. */
export function threadSubject(thread: EmailThread): string {
  const original = thread.messages[thread.messages.length - 1]?.subject ?? latest(thread).subject
  return original.replace(/^((re|fwd?|fw):\s*)+/i, '')
}

/** Senders in the order they joined the conversation, without repeats. */
export function participants(thread: EmailThread): string[] {
  const seen = new Set<string>()
  return [...thread.messages].reverse().map(m => m.sender).filter(s => !seen.has(s) && !!seen.add(s))
}

/** Needs Reply if any message needs one; otherwise the newest message's category. */
export function threadCategory(thread: EmailThread): EmailCategory | undefined {
  if (thread.messages.some(m => m.category === 'needsReply')) return 'needsReply'
  return latest(thread).category ?? thread.messages.find(m => m.category)?.category
}

/** The message that needs a reply, else the newest one with a summary. */
export function threadSummary(thread: EmailThread): string | undefined {
  return thread.messages.find(m => m.category === 'needsReply' && m.summary)?.summary ?? thread.messages.find(m => m.summary)?.summary
}

/** Groups messages by conversation, newest conversation first. */
export function groupThreads(emails: EmailMessage[]): EmailThread[] {
  const groups = new Map<string, EmailMessage[]>()
  for (const email of emails) {
    const key = email.threadID ?? email.id
    groups.set(key, [...(groups.get(key) ?? []), email])
  }
  return [...groups.entries()]
    .map(([id, messages]) => ({ id, messages: messages.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()) }))
    .sort((a, b) => latest(b).receivedAt.getTime() - latest(a).receivedAt.getTime())
}

/** Applies the sync file's sorting to messages fetched from Gmail. */
export function withSorting(emails: EmailMessage[], doc: SyncDocument): EmailMessage[] {
  return emails.map(email => {
    const sorting = doc.emailSorting[email.id]
    return sorting ? { ...email, category: sorting.category, summary: sorting.summary } : { ...email, category: undefined, summary: undefined }
  })
}

/** Re-sorts a whole conversation by hand; hand-sorting wins over Claude's from then on. */
export function setCategory(doc: SyncDocument, messageIDs: string[], category: EmailCategory, now: Date = new Date()): SyncDocument {
  const next = { ...doc, emailSorting: { ...doc.emailSorting } }
  for (const id of messageIDs) {
    const current = doc.emailSorting[id]
    next.emailSorting[id] = { category, manual: true, updatedAt: iso(now), ...(current?.summary ? { summary: current.summary } : {}) }
  }
  return next
}

/** Needing a reply first, newsletters last (the Overview card's order). */
export function overviewRank(thread: EmailThread): number {
  const category = threadCategory(thread)
  return category === 'needsReply' ? 0 : category === 'newsletter' ? 2 : 1
}
