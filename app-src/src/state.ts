// App state (in memory only; nothing is written to browser storage, so closing the tab forgets it).
import { computed, signal } from '@preact/signals'
import { emptyDocument, type SyncDocument } from './sync/document'
import type { CalendarEvent } from './logic/calendar'
import { fromSync, isMuted } from './logic/calendar'
import type { EmailMessage } from './logic/email'
import { withSorting } from './logic/email'
import { restore, undoable, type TaskSnapshot } from './logic/tasks'
import { defaultList } from './logic/filters'
import { DEFAULT_ACCENT } from './logic/appearance'
import { iso, type SyncSettings } from './sync/document'

export type Page = 'overview' | 'calendar' | 'tasks' | 'emails' | 'notes' | 'settings'
export const PAGES: Page[] = ['overview', 'calendar', 'tasks', 'emails', 'notes']
export const pageTitle: Record<Page, string> = {
  overview: 'Overview', calendar: 'Calendar', tasks: 'Tasks', emails: 'Emails', notes: 'Notes', settings: 'Settings',
}

export const page = signal<Page>('overview')

/** This browser's copy of the sync file: the last merged copy plus edits made here since. */
export const doc = signal<SyncDocument>(emptyDocument())

export const sync = signal<{
  /** The sync file has been read at least once. */
  loaded: boolean
  syncing: boolean
  lastSyncedAt?: Date
  error?: string
  /** Drive has no sync file yet (sync is off on the Mac). */
  noFile?: boolean
}>({ loaded: false, syncing: false })

export const google = signal<{
  events: CalendarEvent[]
  /** Day ranges already fetched from Google Calendar, as [start, end) times. */
  ranges: [number, number][]
  calendarError?: string
  calendarSyncedAt?: Date
  emails: EmailMessage[]
  unreadCount: number
  gmailError?: string
  gmailSyncedAt?: Date
  /** Gmail has been read at least once this visit. */
  gmailLoaded: boolean
}>({ events: [], ranges: [], emails: [], unreadCount: 0, gmailLoaded: false })

/** Light/dark for this visit (not saved anywhere). */
export const colorMode = signal<'system' | 'light' | 'dark'>('system')

// MARK: Derived

export const tasks = computed(() => Object.values(doc.value.tasks))
export const lists = computed(() => Object.values(doc.value.lists).sort((a, b) => a.sortIndex - b.sortIndex))
export const muteRules = computed(() => Object.values(doc.value.muteRules))
export const defaultListID = computed(() => defaultList(lists.value, doc.value.settings?.defaultListID)?.id)
export const claudeEnabled = computed(() => doc.value.settings?.claudeEnabled ?? false)
export const accentHex = computed(() => doc.value.settings?.accentColor)
export const emails = computed(() => withSorting(google.value.emails, doc.value))
export const allEvents = computed(() =>
  [...google.value.events, ...Object.values(doc.value.events).map(fromSync)].sort((a, b) => a.start.getTime() - b.start.getTime()))
export const mutedIDs = computed(() => new Set(allEvents.value.filter(e => isMuted(e, muteRules.value)).map(e => e.id)))

// MARK: Changes

type Listener = () => void
const changeListeners: Listener[] = []
/** The sync engine listens, to upload 3 seconds after the last edit. */
export const onLocalChange = (listener: Listener) => changeListeners.push(listener)

/** Every edit goes through here. */
export function change(update: (doc: SyncDocument) => SyncDocument) {
  const next = update(doc.value)
  if (next === doc.value) return
  doc.value = next
  changeListeners.forEach(l => l())
}

// MARK: Undo

export const toast = signal<{ id: number; message: string } | undefined>(undefined)
let lastUndo: TaskSnapshot | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined

/** A task change that can be undone (the toast's Undo button, or ⌘Z / Ctrl+Z). */
export function changeTasks(message: string, ids: string[], update: (doc: SyncDocument) => SyncDocument) {
  const { doc: next, undo } = undoable(doc.value, ids, update)
  change(() => next)
  lastUndo = undo
  toast.value = { id: Date.now(), message }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = undefined }, 6000)
}

export function undoLastTaskChange() {
  if (!lastUndo) return
  const snapshot = lastUndo
  lastUndo = undefined
  toast.value = undefined
  change(d => restore(d, snapshot))
}

// MARK: Settings

/** Changes the synced settings (name, accent, sidebar, default list, hide muted). Never `claudeEnabled`: the Mac owns it. */
export function updateSettings(update: Partial<Omit<SyncSettings, 'claudeEnabled' | 'updatedAt'>>) {
  change(d => {
    const current: SyncSettings = d.settings ?? {
      userName: '', accentColor: DEFAULT_ACCENT, sidebarStyle: 'neutral', hideMuted: false, claudeEnabled: false, updatedAt: iso(0),
    }
    const next = { ...current, ...update }
    if ((Object.keys(update) as (keyof typeof update)[]).every(k => current[k] === next[k])) return d
    return { ...d, settings: { ...next, updatedAt: iso(new Date()) } }
  })
}
