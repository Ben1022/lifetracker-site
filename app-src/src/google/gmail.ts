// Unread Gmail (read-only), with the same query as the Mac's GmailConnector.
import type { EmailMessage } from '../logic/email'
import { getJSON } from './api'

/** Unread inbox mail minus the Promotions and Social tabs. */
export const UNREAD_QUERY = 'is:unread in:inbox -category:promotions -category:social'

export async function fetchUnread(max = 40): Promise<{ emails: EmailMessage[]; unreadCount: number }> {
  const params = new URLSearchParams({ q: UNREAD_QUERY, maxResults: String(max) })
  const list = await getJSON<{ messages?: { id: string }[]; resultSizeEstimate?: number }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`)
  const ids = (list.messages ?? []).map(m => m.id)
  const emails: EmailMessage[] = []
  // Ten at a time, like the Mac.
  for (let i = 0; i < ids.length; i += 10) {
    const batch = await Promise.all(ids.slice(i, i + 10).map(id =>
      getJSON<any>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)))
    emails.push(...batch.map(parseMessage))
  }
  return { emails, unreadCount: Math.max(list.resultSizeEstimate ?? 0, emails.length) }
}

export function parseMessage(message: any): EmailMessage {
  const headers: { name: string; value: string }[] = message.payload?.headers ?? []
  const header = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value
  const sender = parseSender(header('From') ?? '')
  const subject = header('Subject')
  return {
    id: message.id, threadID: message.threadId, sender: sender.name, senderAddress: sender.address,
    subject: subject ? subject : '(No subject)', snippet: decodeEntities(message.snippet ?? ''),
    receivedAt: new Date(Number(message.internalDate ?? 0)),
    webURL: `https://mail.google.com/mail/u/0/#inbox/${message.threadId ?? message.id}`,
  }
}

/** `"Lee, Sarah" <sarah@x.com>` → ("Lee, Sarah", "sarah@x.com"); a bare address is used for both. */
export function parseSender(header: string): { name: string; address: string } {
  const trimmed = header.trim()
  const open = trimmed.lastIndexOf('<'), close = trimmed.lastIndexOf('>')
  if (open < 0 || close < open) return { name: trimmed, address: trimmed }
  const address = trimmed.slice(open + 1, close)
  const name = trimmed.slice(0, open).trim().replace(/^"+|"+$/g, '')
  return { name: name || address, address }
}

export function decodeEntities(text: string): string {
  return [['&#39;', "'"], ['&quot;', '"'], ['&amp;', '&'], ['&lt;', '<'], ['&gt;', '>'], ['&nbsp;', ' ']]
    .reduce((s, [from, to]) => s.split(from).join(to), text)
}
