// Merges this browser's copy of the sync file with the one in Drive. A line-for-line port of the
// Mac's SyncMerge.swift; both are checked against the shared fixtures in ../sync-fixtures, so keep
// the two in step.
//
// 1. The newer updatedAt wins; equal times go to the alphabetically smaller device ID.
// 2. A tombstone at or after a record's updatedAt deletes it; an edit after the delete brings it
//    back (and drops the tombstone). Tombstones older than 30 days are dropped.
// 3. Briefings: the Mac's copy always wins; 14 days are kept. Email sorting: hand-sorted beats
//    automatic, otherwise newer wins; 30 days are kept.
// 4. Recurring tasks need nothing special: a logged day is an ordinary task record.
// 5. A task with no list goes to the default list.
// Daily notes: two notes for the same day keep the smaller ID as the daily note; the other becomes
// an ordinary note, or is deleted if it's empty.

import {
  emptyDocument, ms, iso, tombstoneKey,
  type SyncDocument, type SyncKind, type SyncList, type SyncNote, type SyncSorting,
} from './document'

export interface MergeOptions {
  /** This device's ID ("mac-…" / "web-…"). */
  localDevice: string
  /** The Mac owns briefings and the "Use Claude" setting. */
  localIsMac: boolean
  now: Date
}

export const TOMBSTONE_DAYS = 30
export const BRIEFING_DAYS = 14
const DAY_MS = 86_400_000

interface Stamped { updatedAt: string }

export function merge(local: SyncDocument, remote: SyncDocument, options: MergeOptions): SyncDocument {
  const localWinsTies = options.localDevice <= (remote.writtenBy ?? '')
  const result = emptyDocument()
  result.writtenAt = iso(options.now)
  result.writtenBy = options.localDevice

  const deleted: Record<string, string> = { ...local.deleted }
  for (const [key, time] of Object.entries(remote.deleted)) {
    if (deleted[key] === undefined || ms(deleted[key]) < ms(time)) deleted[key] = time
  }

  result.tasks = records('task', local.tasks, remote.tasks, deleted, localWinsTies)
  result.lists = records('list', local.lists, remote.lists, deleted, localWinsTies)
  result.notes = records('note', local.notes, remote.notes, deleted, localWinsTies)
  result.events = records('event', local.events, remote.events, deleted, localWinsTies)
  result.muteRules = records('muteRule', local.muteRules, remote.muteRules, deleted, localWinsTies)
  dedupeDailyNotes(result.notes, deleted)

  const settings = pick(local.settings, remote.settings, localWinsTies)
  if (settings) {
    result.settings = { ...settings }
    const owner = options.localIsMac ? local.settings : remote.settings
    if (owner) result.settings.claudeEnabled = owner.claudeEnabled
  }

  // Rule 5: every task has a list.
  const fallback = defaultListID(result.lists, result.settings?.defaultListID)
  if (fallback) {
    for (const [id, task] of Object.entries(result.tasks)) {
      if (!task.listID) result.tasks[id] = { ...task, listID: fallback }
    }
  }

  const cutoff = ms(iso(options.now)) - TOMBSTONE_DAYS * DAY_MS
  for (const [key, time] of Object.entries(deleted)) {
    if (ms(time) >= cutoff) result.deleted[key] = time
  }

  for (const id of union(local.emailSorting, remote.emailSorting)) {
    const l = local.emailSorting[id], r = remote.emailSorting[id]
    let winner: SyncSorting
    if (l && r) winner = l.manual !== r.manual ? (l.manual ? l : r) : newer(l, r, localWinsTies)
    else winner = (l ?? r)!
    if (ms(winner.updatedAt) >= cutoff) result.emailSorting[id] = winner
  }

  const briefings = { ...remote.briefings }
  for (const [day, briefing] of Object.entries(local.briefings)) {
    if (options.localIsMac || briefings[day] === undefined) briefings[day] = briefing
  }
  for (const day of Object.keys(briefings).sort().reverse().slice(0, BRIEFING_DAYS)) {
    result.briefings[day] = briefings[day]
  }
  return result
}

/** The chosen list if it exists, else one called "Other", else the first by sortIndex (then id). */
export function defaultListID(lists: Record<string, SyncList>, preferred?: string): string | undefined {
  if (preferred && lists[preferred]) return preferred
  const ordered = Object.values(lists).sort((a, b) => a.sortIndex - b.sortIndex || compare(a.id, b.id))
  return (ordered.find(l => l.name.toLowerCase() === 'other') ?? ordered[0])?.id
}

// MARK: Helpers

function records<R extends Stamped>(
  kind: SyncKind, local: Record<string, R>, remote: Record<string, R>, deleted: Record<string, string>, localWinsTies: boolean,
): Record<string, R> {
  const result: Record<string, R> = {}
  for (const id of union(local, remote)) {
    const winner = pick(local[id], remote[id], localWinsTies)
    if (!winner) continue
    const key = tombstoneKey(kind, id)
    const tombstone = deleted[key]
    if (tombstone !== undefined) {
      if (ms(tombstone) >= ms(winner.updatedAt)) continue
      delete deleted[key]
    }
    result[id] = winner
  }
  return result
}

function pick<R extends Stamped>(local: R | undefined, remote: R | undefined, localWinsTies: boolean): R | undefined {
  if (!local || !remote) return local ?? remote
  return newer(local, remote, localWinsTies)
}

function newer<R extends Stamped>(local: R, remote: R, localWinsTies: boolean): R {
  const l = ms(local.updatedAt), r = ms(remote.updatedAt)
  if (l !== r) return l > r ? local : remote
  return localWinsTies ? local : remote
}

function dedupeDailyNotes(notes: Record<string, SyncNote>, deleted: Record<string, string>) {
  const byDay = new Map<string, SyncNote[]>()
  for (const note of Object.values(notes)) {
    if (note.day) byDay.set(note.day, [...(byDay.get(note.day) ?? []), note])
  }
  for (const sameDay of byDay.values()) {
    if (sameDay.length < 2) continue
    for (const extra of sameDay.sort((a, b) => compare(a.id, b.id)).slice(1)) {
      if (extra.body.trim() === '') {
        delete notes[extra.id]
        deleted[tombstoneKey('note', extra.id)] = extra.updatedAt
      } else {
        const { day: _day, ...rest } = extra
        notes[extra.id] = rest
      }
    }
  }
}

const union = (a: object, b: object) => new Set([...Object.keys(a), ...Object.keys(b)])
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
