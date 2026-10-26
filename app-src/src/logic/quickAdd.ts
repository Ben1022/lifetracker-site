// Port of TaskQuickAdd.swift: Todoist-style quick add ("Read ch. 4 tomorrow 5pm p2 #School every week").
// Understands dates (today, tonight, tomorrow/tmr, weekday names, "next week", "in 3 days", "oct 30",
// "10/30"), times ("5pm", "at 5:30 pm", "17:00", "noon"), p1–p4, #List and repeats ("every monday",
// "until dec 5"). Anything it recognizes is removed from the title. Checked against
// ../sync-fixtures/quick-add.json, which the Mac's tests read too.
import type { RepeatRule } from '../sync/document'
import { addDays, addMonths, addYears, atTime, startOfDay } from './dates'

export interface ParsedTask {
  title: string
  due?: Date
  dueHasTime: boolean
  priority: number
  listName?: string
  repeatRule?: RepeatRule
  repeatUntil?: Date
}

const WEEKDAY_NAMES: [string[], number][] = [
  [['sunday', 'sun'], 0], [['monday', 'mon'], 1], [['tuesday', 'tue', 'tues'], 2], [['wednesday', 'wed'], 3],
  [['thursday', 'thu', 'thur', 'thurs'], 4], [['friday', 'fri'], 5], [['saturday', 'sat'], 6],
]
const FULL_WEEKDAYS = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday'
const ANY_WEEKDAY = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun'
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH_PATTERN = MONTHS.join('|')

export function parseQuickAdd(input: string, now: Date = new Date()): ParsedTask {
  let text = ` ${input} `
  const result: ParsedTask = { title: '', dueHasTime: false, priority: 4 }
  const today = startOfDay(now)

  /** Finds the first match, removes it from the text and returns its capture groups (lowercased). */
  const take = (pattern: string): string[] | undefined => {
    const match = new RegExp(`(?<=\\s)(?:${pattern})(?=\\s)`, 'iu').exec(text)
    if (!match) return undefined
    text = text.slice(0, match.index) + ' ' + text.slice(match.index + match[0].length)
    return Array.from(match, group => (group ?? '').toLowerCase())
  }
  const weekday = (name: string) => WEEKDAY_NAMES.find(([names]) => names.includes(name))?.[1]
  /** The next date with this weekday, counting today. */
  const upcoming = (day: number) => addDays(today, (day - today.getDay() + 7) % 7)

  let groups: string[] | undefined
  if ((groups = take('p([1-4])'))) result.priority = Number(groups[1])
  if ((groups = take('#([\\p{L}\\p{N}_-]+)'))) result.listName = originalCase(groups[1], input)

  // Repeats ("every friday" also sets the first due date).
  let date: Date | undefined
  if (take('every\\s+day|daily')) {
    result.repeatRule = 'daily'
  } else if (take('every\\s+weekday|weekdays')) {
    result.repeatRule = 'weekdays'
  } else if ((groups = take(`every\\s+(${ANY_WEEKDAY})`)) && weekday(groups[1]) !== undefined) {
    result.repeatRule = 'weekly'
    date = upcoming(weekday(groups[1])!)
  } else if (take('every\\s+week|weekly')) {
    result.repeatRule = 'weekly'
  } else if (take('every\\s+month|monthly')) {
    result.repeatRule = 'monthly'
  } else if (take('every\\s+year|yearly|annually')) {
    result.repeatRule = 'yearly'
  }

  // "until dec 5" / "until 12/5" ends a repeat.
  if (result.repeatRule) {
    if ((groups = take(`until\\s+(${MONTH_PATTERN})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?`))) {
      result.repeatUntil = nextMonthDay(MONTHS.indexOf(groups[1].slice(0, 3)) + 1, Number(groups[2]), today)
    } else if ((groups = take('until\\s+(\\d{1,2})/(\\d{1,2})'))) {
      result.repeatUntil = nextMonthDay(Number(groups[1]), Number(groups[2]), today)
    }
  }

  // Time of day.
  let time: [number, number] | undefined
  if ((groups = take('(?:at\\s+)?(noon|(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)|(\\d{1,2}):(\\d{2}))'))) {
    if (groups[1] === 'noon') {
      time = [12, 0]
    } else if (groups[2] !== '') {
      let hour = Number(groups[2])
      const minute = groups[3] === '' ? 0 : Number(groups[3])
      if (groups[4] === 'pm' && hour < 12) hour += 12
      if (groups[4] === 'am' && hour === 12) hour = 0
      if (hour < 24 && minute < 60) time = [hour, minute]
    } else {
      const hour = Number(groups[5]), minute = Number(groups[6])
      if (hour < 24 && minute < 60) time = [hour, minute]
    }
  }

  // Date.
  let isTonight = false
  if (!date) {
    if (take('today|tod')) {
      date = today
    } else if (take('tonight')) {
      date = today
      isTonight = true
    } else if (take('tomorrow|tmrw|tmr')) {
      date = addDays(today, 1)
    } else if (take('next\\s+week')) {
      const monday = upcoming(1)
      date = monday.getTime() === today.getTime() ? addDays(today, 7) : monday
    } else if ((groups = take('in\\s+(\\d+)\\s+(days?|weeks?|months?)'))) {
      const count = Number(groups[1])
      date = groups[2].startsWith('day') ? addDays(today, count)
        : groups[2].startsWith('week') ? addDays(today, 7 * count)
        : addMonths(today, count)
    } else if ((groups = take(`(?:on\\s+)?next\\s+(${ANY_WEEKDAY})`)) && weekday(groups[1]) !== undefined) {
      date = addDays(upcoming(weekday(groups[1])!), 7)
    } else if ((groups = take(`(?:on\\s+(${ANY_WEEKDAY}))|(${FULL_WEEKDAYS})`))) {
      // Short names ("sun") only count after "on", so "Sun cream" stays a title.
      const day = weekday(groups[1] === '' ? groups[2] : groups[1])
      if (day !== undefined) date = upcoming(day)
    } else if ((groups = take(`(?:on\\s+)?(${MONTH_PATTERN})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?`))) {
      date = nextMonthDay(MONTHS.indexOf(groups[1].slice(0, 3)) + 1, Number(groups[2]), today)
    } else if ((groups = take('(\\d{1,2})/(\\d{1,2})'))) {
      date = nextMonthDay(Number(groups[1]), Number(groups[2]), today)
    }
  }

  // A time with no date means today, or tomorrow if it has already passed.
  if (time) {
    let day = date ?? today
    if (!date && atTime(today, time[0], time[1]) <= now) day = addDays(today, 1)
    result.due = atTime(day, time[0], time[1])
    result.dueHasTime = true
  } else if (isTonight) {
    result.due = atTime(today, 20, 0)
    result.dueHasTime = true
  } else if (date) {
    result.due = date
  } else if (result.repeatRule) {
    result.due = today
  }

  const title = text.split(/\s+/).filter(Boolean).join(' ')
  result.title = title === '' ? input.trim() : title
  return result
}

/** The list name as typed ("#School" stays "School"). */
function originalCase(lowercased: string, input: string): string {
  const index = input.toLowerCase().indexOf(`#${lowercased}`)
  return index < 0 ? lowercased : input.slice(index + 1, index + 1 + lowercased.length)
}

/** This year's month/day, or next year's if it has passed. */
function nextMonthDay(month: number, day: number, today: Date): Date | undefined {
  const thisYear = new Date(today.getFullYear(), month - 1, day)
  if (thisYear.getMonth() !== month - 1) return undefined
  return thisYear < today ? addYears(thisYear, 1) : thisYear
}
