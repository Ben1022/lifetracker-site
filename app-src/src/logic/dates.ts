// Local-calendar date arithmetic, matching Foundation's Calendar.current on the Mac.

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Same time of day, `days` later (calendar days, so DST changes keep the clock time). */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Like Calendar.date(byAdding: .month): Jan 31 + 1 month = Feb 28. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return d
}

export const addYears = (date: Date, years: number) => addMonths(date, years * 12)

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6

export function atTime(day: Date, hour: number, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0)
}

// MARK: Formatting (the Mac's Date.formatted styles)

const locale = undefined

/** "5:00 PM" */
export const timeText = (date: Date) => date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
/** "Friday" */
export const weekdayText = (date: Date) => date.toLocaleDateString(locale, { weekday: 'long' })
/** "Fri, Oct 30" */
export const shortDayText = (date: Date) => date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
/** "Monday, October 26" */
export const longDayText = (date: Date) => date.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
/** "Oct 26" */
export const monthDayText = (date: Date) => date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
/** "5 PM" */
export const hourText = (date: Date) => date.toLocaleTimeString(locale, { hour: 'numeric' })
