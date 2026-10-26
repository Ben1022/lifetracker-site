import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from '../src/logic/quickAdd'
import { localDate, localText, readFixture } from './fixtures'

describe('quick add (shared fixtures)', () => {
  const fixture = readFixture('quick-add.json')
  it('runs in the fixture time zone', () => expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(fixture.timeZone))
  const now = localDate(fixture.now)!
  for (const item of fixture.cases) {
    it(item.input, () => {
      const parsed = parseQuickAdd(item.input, now)
      expect({
        title: parsed.title, due: localText(parsed.due), dueHasTime: parsed.dueHasTime, priority: parsed.priority,
        listName: parsed.listName ?? null, repeatRule: parsed.repeatRule ?? null,
        repeatUntil: parsed.repeatUntil ? localText(parsed.repeatUntil)!.slice(0, 10) : null,
      }).toEqual({
        title: item.title, due: item.due, dueHasTime: item.dueHasTime, priority: item.priority,
        listName: item.listName, repeatRule: item.repeatRule, repeatUntil: item.repeatUntil,
      })
    })
  }
})
