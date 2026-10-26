import { describe, expect, it } from 'vitest'
import { canonical, parseDocument, serialize } from '../src/sync/document'
import { merge } from '../src/sync/merge'
import { mergeFixtureNames, readFixture } from './fixtures'

describe('merge (shared fixtures)', () => {
  it('has the fixtures', () => expect(mergeFixtureNames().length).toBeGreaterThanOrEqual(10))

  for (const name of mergeFixtureNames()) {
    it(name, () => {
      const fixture = readFixture(`merge/${name}`)
      const result = merge(parseDocument(fixture.local), parseDocument(fixture.remote), {
        localDevice: fixture.options.localDevice,
        localIsMac: fixture.options.localIsMac,
        now: new Date(fixture.options.now),
      })
      expect(canonical(result), fixture.description).toBe(canonical(parseDocument(fixture.expected)))
      // Survives a round trip through JSON unchanged.
      expect(canonical(parseDocument(JSON.parse(serialize(result))))).toBe(canonical(result))
    })
  }
})

describe('parseDocument', () => {
  it('fills missing sections and normalizes dates', () => {
    const doc = parseDocument({ schemaVersion: 1, tasks: { a: { id: 'a', title: 'x', updatedAt: '2026-10-26T07:00:00Z', due: null } } })
    expect(doc.tasks.a.updatedAt).toBe('2026-10-26T07:00:00.000Z')
    expect('due' in doc.tasks.a).toBe(false)
    expect(doc.notes).toEqual({})
    expect(doc.deleted).toEqual({})
  })
})
