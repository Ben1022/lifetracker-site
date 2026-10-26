// The JSON file shared with the Mac app through Google Drive's hidden app folder
// (lifetracker-sync.json). Mirrors the Mac's SyncDocument.swift field for field.
// Dates are ISO 8601 strings in UTC with milliseconds ("2026-10-26T07:00:12.000Z").

export const SCHEMA_VERSION = 1

export interface SyncTask {
  id: string
  title: string
  notes: string
  due?: string
  dueHasTime: boolean
  isDone: boolean
  completedAt?: string
  sortIndex: number
  createdAt: string
  listID?: string
  /** 1 (highest, red) … 4 (none). */
  priority: number
  repeatRule?: RepeatRule
  repeatUntil?: string
  /** On a logged day of a repeating task: the repeating task's id. */
  seriesTaskID?: string
  updatedAt: string
}

export type RepeatRule = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'

export interface SyncList {
  id: string
  name: string
  colorHex: string
  sortIndex: number
  createdAt: string
  updatedAt: string
}

export interface SyncNote {
  id: string
  body: string
  createdAt: string
  updatedAt: string
  isPinned: boolean
  /** "2026-10-26" for a daily note. */
  day?: string
}

export interface SyncEvent {
  /** "manual:<uuid>". */
  id: string
  title: string
  start: string
  end: string
  isAllDay: boolean
  location?: string
  notes: string
  updatedAt: string
}

export type MuteKind = 'series' | 'title' | 'keyword'

export interface SyncMuteRule {
  /** "<kind>:<value lowercased>". */
  id: string
  kind: MuteKind
  value: string
  label: string
  createdAt: string
  updatedAt: string
}

export type EmailCategory = 'needsReply' | 'fyi' | 'newsletter'

export interface SyncSorting {
  category: EmailCategory
  summary?: string
  /** Sorted by hand: beats automatic sorting whatever the times. */
  manual: boolean
  updatedAt: string
}

export interface SyncBriefing {
  day: string
  generatedAt: string
  bullets: string[]
  suggestedTasks: string[]
  warnings: string[]
  source: string
}

export interface SyncSettings {
  userName: string
  accentColor: string
  sidebarStyle: string
  hideMuted: boolean
  defaultListID?: string
  /** Mac only: with Claude off the web hides the briefing too. */
  claudeEnabled: boolean
  updatedAt: string
}

export interface SyncDocument {
  schemaVersion: number
  writtenAt?: string
  writtenBy?: string
  tasks: Record<string, SyncTask>
  lists: Record<string, SyncList>
  notes: Record<string, SyncNote>
  events: Record<string, SyncEvent>
  muteRules: Record<string, SyncMuteRule>
  emailSorting: Record<string, SyncSorting>
  briefings: Record<string, SyncBriefing>
  settings?: SyncSettings
  /** Tombstones: "<kind>:<id>" → when it was deleted. Kept 30 days. */
  deleted: Record<string, string>
}

export type SyncKind = 'task' | 'list' | 'note' | 'event' | 'muteRule'

export const tombstoneKey = (kind: SyncKind, id: string) => `${kind}:${id}`

export function emptyDocument(): SyncDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: {}, lists: {}, notes: {}, events: {}, muteRules: {}, emailSorting: {}, briefings: {}, deleted: {},
  }
}

// MARK: Dates

/** Milliseconds since 1970 for an ISO string (NaN-safe: invalid dates count as 0). */
export function ms(iso: string | undefined): number {
  if (!iso) return 0
  const value = Date.parse(iso)
  return Number.isNaN(value) ? 0 : value
}

export const iso = (date: Date | number) => new Date(date).toISOString()

/** The local day of `date` as "2026-10-26". */
export function dayString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "2026-10-26" → the start of that local day. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// MARK: Reading

const DATE_FIELDS: Record<string, string[]> = {
  tasks: ['due', 'completedAt', 'createdAt', 'repeatUntil', 'updatedAt'],
  lists: ['createdAt', 'updatedAt'],
  notes: ['createdAt', 'updatedAt'],
  events: ['start', 'end', 'updatedAt'],
  muteRules: ['createdAt', 'updatedAt'],
  emailSorting: ['updatedAt'],
  briefings: ['generatedAt'],
}

const normalizeDate = (value: unknown) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : undefined

/** Reads a sync file, filling in missing sections and writing every date the same way. */
export function parseDocument(json: unknown): SyncDocument {
  const raw = (json && typeof json === 'object' ? json : {}) as Record<string, any>
  const doc = emptyDocument()
  doc.schemaVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : SCHEMA_VERSION
  if (raw.writtenAt) doc.writtenAt = normalizeDate(raw.writtenAt)
  if (raw.writtenBy) doc.writtenBy = String(raw.writtenBy)
  for (const [section, fields] of Object.entries(DATE_FIELDS)) {
    const records: Record<string, any> = {}
    for (const [id, record] of Object.entries((raw[section] ?? {}) as Record<string, any>)) {
      const copy: Record<string, any> = {}
      for (const [key, value] of Object.entries(record ?? {})) {
        if (value === null || value === undefined) continue
        copy[key] = fields.includes(key) ? normalizeDate(value) : value
        if (copy[key] === undefined) delete copy[key]
      }
      records[id] = copy
    }
    ;(doc as any)[section] = records
  }
  if (raw.settings) {
    const s = { ...raw.settings }
    if (s.defaultListID === null) delete s.defaultListID
    s.updatedAt = normalizeDate(s.updatedAt) ?? iso(0)
    doc.settings = s
  }
  for (const [key, value] of Object.entries((raw.deleted ?? {}) as Record<string, unknown>)) {
    const date = normalizeDate(value)
    if (date) doc.deleted[key] = date
  }
  return doc
}

/** Everything except who wrote it and when. */
export function sameContent(a: SyncDocument, b: SyncDocument): boolean {
  const strip = ({ writtenAt: _a, writtenBy: _b, ...rest }: SyncDocument) => rest
  return canonical(strip(a)) === canonical(strip(b))
}

/** JSON with sorted keys and no undefined values, for comparing documents. */
export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) out[key] = sortKeys(v)
    }
    return out
  }
  return value
}

export function serialize(doc: SyncDocument): string {
  return canonical(doc)
}
