// Reads the fixtures shared with the Mac app's Swift tests (../../sync-fixtures).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const FIXTURES = join(__dirname, '..', '..', 'sync-fixtures')

export const readFixture = (path: string) => JSON.parse(readFileSync(join(FIXTURES, path), 'utf8'))
export const mergeFixtureNames = () => readdirSync(join(FIXTURES, 'merge')).filter(f => f.endsWith('.json')).sort()

/** "2026-10-23T10:00" as a local time (the tests run with TZ=America/Los_Angeles, like the fixtures). */
export function localDate(text: string | null | undefined): Date | undefined {
  if (!text) return undefined
  const [y, m, d, h, min] = text.split(/[-T:]/).map(Number)
  return new Date(y, m - 1, d, h, min)
}

export function localText(date: Date | undefined): string | null {
  if (!date) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
