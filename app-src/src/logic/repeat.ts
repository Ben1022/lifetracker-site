// Port of TaskRepeat.swift: how a repeating task comes back after it's checked off.
import type { RepeatRule } from '../sync/document'
import { addDays, addMonths, addYears, isWeekend, startOfDay } from './dates'

export const REPEAT_RULES: RepeatRule[] = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly']

export const repeatTitle: Record<RepeatRule, string> = {
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
}

/** The next due date after `date`, keeping the time of day. */
export function nextDate(rule: RepeatRule, date: Date): Date {
  switch (rule) {
    case 'daily': return addDays(date, 1)
    case 'weekdays': {
      let next = addDays(date, 1)
      while (isWeekend(next)) next = addDays(next, 1)
      return next
    }
    case 'weekly': return addDays(date, 7)
    case 'monthly': return addMonths(date, 1)
    case 'yearly': return addYears(date, 1)
  }
}

/** The next due date that isn't in the past: a daily task finished three days late comes back today. */
export function nextUpcoming(rule: RepeatRule, due: Date, now: Date = new Date()): Date {
  const startOfToday = startOfDay(now)
  let next = nextDate(rule, due)
  while (next < startOfToday) next = nextDate(rule, next)
  return next
}

export const isRepeatRule = (value: unknown): value is RepeatRule => REPEAT_RULES.includes(value as RepeatRule)
