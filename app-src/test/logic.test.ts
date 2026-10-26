import { describe, expect, it } from 'vitest'
import { emptyDocument } from '../src/sync/document'
import { addQuickTask, addTask, deleteList, deleteTask, restore, undoable, toggleDone, addList } from '../src/logic/tasks'
import { overview, today, upcoming, completed, defaultList } from '../src/logic/filters'
import { PRESETS, accentPalette, contrast, parseHex, WHITE, DARK_CARD, NEAR_BLACK } from '../src/logic/appearance'
import { groupThreads, threadCategory, threadSubject, participants, type EmailMessage } from '../src/logic/email'
import { slots, weekDays } from '../src/logic/calendar'
import { noteGroups, noteTitle, ensureDailyNote } from '../src/logic/notes'

const now = new Date(2026, 9, 26, 10, 0)

describe('tasks', () => {
  it('quick add without #List goes to the default list; #List reuses or creates', () => {
    let doc = emptyDocument()
    doc = addList(doc, 'Other', now).doc
    doc = addQuickTask(doc, 'Essay fri 5pm p1', {}, now).doc
    doc = addQuickTask(doc, 'Reading #School', {}, now).doc
    doc = addQuickTask(doc, 'Lab #school', {}, now).doc
    const lists = Object.values(doc.lists)
    expect(lists.map(l => l.name).sort()).toEqual(['Other', 'School'])
    const other = lists.find(l => l.name === 'Other')!.id
    const school = lists.find(l => l.name === 'School')!.id
    const byTitle = Object.fromEntries(Object.values(doc.tasks).map(t => [t.title, t]))
    expect(byTitle['Essay fri'].listID).toBe(other)
    expect(byTitle['Essay fri'].priority).toBe(1)
    expect(byTitle.Reading.listID).toBe(school)
    expect(byTitle.Lab.listID).toBe(school)
  })

  it('creates a Tasks list when there are none', () => {
    const doc = addQuickTask(emptyDocument(), 'Anything', {}, now).doc
    expect(Object.values(doc.lists).map(l => l.name)).toEqual(['Tasks'])
  })

  it('undo puts a deleted task back and drops its tombstone', () => {
    let doc = addQuickTask(emptyDocument(), 'Essay', {}, now).doc
    const id = Object.keys(doc.tasks)[0]
    const { doc: deleted, undo } = undoable(doc, [id], d => deleteTask(d, id, now))
    expect(deleted.deleted[`task:${id}`]).toBeDefined()
    const restored = restore(deleted, undo, new Date(now.getTime() + 1000))
    expect(restored.tasks[id].title).toBe('Essay')
    expect(restored.deleted[`task:${id}`]).toBeUndefined()
  })

  it('undo of a recurring check-off removes the logged copy', () => {
    let doc = addQuickTask(emptyDocument(), 'Quiz every monday', {}, now).doc
    const id = Object.keys(doc.tasks)[0]
    const { doc: checked, undo } = undoable(doc, [id], d => toggleDone(d, id, now))
    expect(Object.keys(checked.tasks)).toHaveLength(2)
    const restored = restore(checked, undo, new Date(now.getTime() + 1000))
    expect(Object.keys(restored.tasks)).toEqual([id])
    expect(restored.tasks[id].due).toBe(doc.tasks[id].due)
  })

  it('deleting a list moves its tasks to the default list; the default list stays', () => {
    let doc = addList(emptyDocument(), 'Other', now).doc
    doc = addQuickTask(doc, 'Essay #School', {}, now).doc
    const school = Object.values(doc.lists).find(l => l.name === 'School')!.id
    const other = Object.values(doc.lists).find(l => l.name === 'Other')!.id
    doc = deleteList(doc, school, now)
    expect(Object.values(doc.tasks)[0].listID).toBe(other)
    expect(deleteList(doc, other, now)).toBe(doc)
  })

  it('groups tasks like the Mac', () => {
    let doc = addList(emptyDocument(), 'Other', now).doc
    doc = addTask(doc, { title: 'Late', due: new Date(2026, 9, 25) }, now).doc
    for (const line of ['Now today', 'Soon tomorrow', 'Later on fri', 'Far nov 20', 'Undated']) doc = addQuickTask(doc, line, {}, now).doc
    const tasks = Object.values(doc.tasks)
    expect(overview(tasks, now).map(g => [g.title, g.tasks.map(t => t.title)])).toEqual([
      ['Overdue', ['Late']], ['Today', ['Now']], ['Tomorrow', ['Soon']], ['This Week', ['Later']],
    ])
    expect(today(tasks, now).overdue.map(t => t.title)).toEqual(['Late'])
    expect(upcoming(tasks, now).map(g => g.tasks[0].title)).toEqual(['Soon', 'Later', 'Far'])
    expect(completed(tasks)).toEqual([])
    expect(defaultList(Object.values(doc.lists))?.name).toBe('Other')
  })
})

describe('appearance (mirrors AppearanceTests.swift)', () => {
  for (const preset of PRESETS) {
    it(`${preset.name} reads on light and dark cards and under its fill`, () => {
      const palette = accentPalette(preset.hex)
      expect(contrast(parseHex(palette.accentLight)!, WHITE)).toBeGreaterThanOrEqual(4.45)
      expect(contrast(parseHex(palette.accentDark)!, DARK_CARD)).toBeGreaterThanOrEqual(4.45)
      const on = palette.onAccent === '#FFFFFF' ? WHITE : NEAR_BLACK
      expect(contrast(on, parseHex(preset.hex)!)).toBeGreaterThanOrEqual(4.45)
    })
  }
  it('uses dark text on orange and white on purple', () => {
    expect(accentPalette('#F07A1A').onAccent).toBe('#14141A')
    expect(accentPalette('#5B3FD9').onAccent).toBe('#FFFFFF')
  })
})

describe('email threads', () => {
  const message = (id: string, threadID: string, sender: string, subject: string, minutes: number, category?: any): EmailMessage =>
    ({ id, threadID, sender, senderAddress: '', subject, snippet: '', receivedAt: new Date(now.getTime() + minutes * 60_000), webURL: '', category })
  it('groups by conversation, newest first; needs reply wins', () => {
    const threads = groupThreads([
      message('1', 't1', 'Ana', 'Grading', 0, 'fyi'), message('2', 't1', 'Ben', 'Re: Grading', 5, 'needsReply'),
      message('3', 't2', 'Shop', 'Sale', 10, 'newsletter'),
    ])
    expect(threads.map(t => t.id)).toEqual(['t2', 't1'])
    expect(threadCategory(threads[1])).toBe('needsReply')
    expect(threadSubject(threads[1])).toBe('Grading')
    expect(participants(threads[1])).toEqual(['Ana', 'Ben'])
  })
})

describe('calendar layout', () => {
  it('puts overlapping events side by side', () => {
    const at = (h: number) => new Date(2026, 9, 26, h)
    const result = slots([{ id: 'a', start: at(9), end: at(11) }, { id: 'b', start: at(10), end: at(12) }, { id: 'c', start: at(13), end: at(14) }])
    expect(result).toEqual({ a: { column: 0, columns: 2 }, b: { column: 1, columns: 2 }, c: { column: 0, columns: 1 } })
  })
  it('weeks start on Sunday', () => expect(weekDays(now)[0].getDate()).toBe(25))
})

describe('notes', () => {
  it('titles and groups like the Mac', () => {
    expect(noteTitle('\n# Plan\nmore')).toBe('Plan')
    let doc = emptyDocument()
    const daily = ensureDailyNote(doc, now, now)
    expect(daily.id).toBe('daily-2026-10-26')
    doc = daily.doc
    expect(ensureDailyNote(doc, now, now).id).toBe(daily.id)
    expect(noteGroups(Object.values(doc.notes), now)).toEqual({ pinned: [], others: [] })
  })
})
