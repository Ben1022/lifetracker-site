import { describe, expect, it } from 'vitest'
import { emptyDocument, iso, type SyncTask } from '../src/sync/document'
import { toggleDone } from '../src/logic/tasks'
import { localDate, localText, readFixture } from './fixtures'

describe('check off / uncheck (shared recurring fixtures)', () => {
  const fixture = readFixture('recurring.json')
  for (const item of fixture.cases) {
    it(item.description, () => {
      const doc = emptyDocument()
      item.before.forEach((raw: any, index: number) => {
        const task: SyncTask = {
          id: raw.id, title: raw.title, notes: '', dueHasTime: raw.dueHasTime, isDone: raw.isDone, sortIndex: index,
          createdAt: iso(0), priority: raw.priority, listID: raw.listID, updatedAt: iso(0),
        }
        if (raw.due) task.due = iso(localDate(raw.due)!)
        if (raw.completedAt) task.completedAt = iso(localDate(raw.completedAt)!)
        if (raw.repeatRule) task.repeatRule = raw.repeatRule
        if (raw.repeatUntil) task.repeatUntil = iso(localDate(raw.repeatUntil)!)
        if (raw.seriesTaskID) task.seriesTaskID = raw.seriesTaskID
        doc.tasks[task.id] = task
      })
      const now = localDate(item.now)!
      const result = toggleDone(doc, item.toggle, now)
      const before = new Set(item.before.map((t: any) => t.id))
      const describeTask = (t: any) => JSON.stringify({
        id: t.id, title: t.title, due: t.due, dueHasTime: t.dueHasTime, isDone: t.isDone, completedAt: t.completedAt,
        repeatRule: t.repeatRule, repeatUntil: t.repeatUntil, seriesTaskID: t.seriesTaskID, listID: t.listID, priority: t.priority,
      })
      const actual = Object.values(result.tasks).map(t => describeTask({
        ...t, id: before.has(t.id) ? t.id : 'NEW', due: localText(t.due ? new Date(t.due) : undefined),
        completedAt: localText(t.completedAt ? new Date(t.completedAt) : undefined),
        repeatUntil: localText(t.repeatUntil ? new Date(t.repeatUntil) : undefined),
        repeatRule: t.repeatRule ?? null, seriesTaskID: t.seriesTaskID ?? null,
      })).sort()
      const expected = item.after.map(describeTask).sort()
      expect(actual).toEqual(expected)
      // Every change is stamped, and a deleted log entry leaves a tombstone.
      for (const t of Object.values(result.tasks)) {
        if (JSON.stringify(t) !== JSON.stringify(doc.tasks[t.id])) expect(t.updatedAt).toBe(iso(now))
      }
      for (const id of before) if (!result.tasks[id as string]) expect(result.deleted[`task:${id}`]).toBe(iso(now))
    })
  }
})
