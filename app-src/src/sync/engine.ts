// Read → merge → write with Drive (WEB-PLAN.md §4.3-4.4): download the sync file, merge it with
// this browser's copy, keep the result, and upload it only if Drive's `version` hasn't moved
// (otherwise start over, up to 3 times). Runs at sign-in, 3 s after the last edit, every 2 minutes
// while the tab is open, and when you come back to the tab.
import { AuthError } from '../auth'
import { createFile, currentVersion, download, findFile, updateFile } from '../google/drive'
import { doc, onLocalChange, sync } from '../state'
import { SCHEMA_VERSION, parseDocument, emptyDocument, sameContent, serialize } from './document'
import { merge } from './merge'

/** A new ID per visit: there's nothing to remember between visits. */
export const deviceID = `web-${crypto.randomUUID()}`

const MAX_ATTEMPTS = 3
let running: Promise<void> | undefined
let again = false
let debounce: ReturnType<typeof setTimeout> | undefined
let started = false

export function startSync() {
  if (started) return
  started = true
  onLocalChange(() => {
    clearTimeout(debounce)
    debounce = setTimeout(() => void syncNow(), 3000)
  })
  setInterval(() => void syncNow(), 2 * 60_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow() })
  void syncNow()
}

/** One sync; a call while one is running queues exactly one more. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    sync.value = { ...sync.value, syncing: true }
    try {
      await syncOnce()
    } finally {
      running = undefined
      sync.value = { ...sync.value, syncing: false }
    }
    if (again) {
      again = false
      await syncNow()
    }
  })()
  return running
}

async function syncOnce() {
  try {
    let restarts = 0
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const file = await findFile()
      const remote = file ? parseDocument(await download(file)) : emptyDocument()
      if (remote.schemaVersion > SCHEMA_VERSION) {
        throw new Error('The sync file was written by a newer version of LifeTracker. Reload the page.')
      }
      const base = doc.value
      const merged = merge(base, remote, { localDevice: deviceID, localIsMac: false, now: new Date() })
      // Edited here while downloading: merge again with the newer copy.
      if (doc.value !== base && restarts++ < 5) { attempt--; continue }
      if (doc.value !== base) return
      doc.value = merged

      const hasContent = Object.keys(merged.tasks).length + Object.keys(merged.notes).length + Object.keys(merged.lists).length > 0
      if (!file && !hasContent) {
        // Nothing here and nothing in Drive: sync is off on the Mac. Don't create an empty file.
        sync.value = { ...sync.value, loaded: true, noFile: true, error: undefined, lastSyncedAt: new Date() }
        return
      }
      if (file && sameContent(merged, remote)) return done()
      const body = serialize(merged)
      if (file) {
        if (await currentVersion(file) !== file.version) continue
        await updateFile(file, body)
      } else {
        if (await findFile()) continue
        await createFile(body)
      }
      return done()
    }
    sync.value = { ...sync.value, error: 'Google Drive was busy. Trying again shortly.' }
  } catch (error) {
    const message = error instanceof AuthError ? undefined : (error as Error).message
    sync.value = { ...sync.value, error: message }
  }
}

function done() {
  sync.value = { ...sync.value, loaded: true, noFile: false, error: undefined, lastSyncedAt: new Date() }
}
