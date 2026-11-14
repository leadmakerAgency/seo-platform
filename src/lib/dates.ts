/**
 * Due dates are plain calendar dates ("2026-11-12"). "Today" is the same for
 * the whole team: the agency's time zone, matching private.agency_today() in
 * the database.
 */
export const AGENCY_TIME_ZONE = "America/Phoenix"

const isoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: AGENCY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Today in the agency's time zone, as YYYY-MM-DD. */
export function agencyToday(now: Date = new Date()): string {
  return isoFormatter.format(now)
}

/** Treats a YYYY-MM-DD string as a calendar date (no time zone shifts). */
function utcDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(iso: string, days: number): string {
  const date = utcDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** The Sunday that ends the week containing `iso` (weeks run Monday to Sunday). */
export function endOfWeek(iso: string): string {
  const dow = utcDate(iso).getUTCDay() // 0 = Sunday
  return addDays(iso, dow === 0 ? 0 : 7 - dow)
}

const shortFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
})

/** "Mon 9 Nov" */
export function formatDay(iso: string): string {
  return shortFormatter.format(utcDate(iso)).replace(",", "")
}

export type DueState = "none" | "done" | "overdue" | "today" | "tomorrow" | "this_week" | "later"

export function dueState(dueOn: string | null, done: boolean, today: string): DueState {
  if (done) return "done"
  if (!dueOn) return "none"
  if (dueOn < today) return "overdue"
  if (dueOn === today) return "today"
  if (dueOn === addDays(today, 1)) return "tomorrow"
  if (dueOn <= endOfWeek(today)) return "this_week"
  return "later"
}

/** "Overdue · Mon 9 Nov", "Today", "Tomorrow", "Fri 13 Nov", "No due date". */
export function dueLabel(dueOn: string | null, state: DueState): string {
  if (!dueOn) return "No due date"
  if (state === "overdue") return `Overdue · ${formatDay(dueOn)}`
  if (state === "today") return "Today"
  if (state === "tomorrow") return "Tomorrow"
  return formatDay(dueOn)
}

/** First day of the month containing `iso` ("2026-11-14" -> "2026-11-01"). */
export function monthOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** This month in the agency's time zone, as YYYY-MM-01 (matches private.agency_month()). */
export function agencyMonth(now: Date = new Date()): string {
  return monthOf(agencyToday(now))
}

/** Number of days in the month containing `iso`. */
export function daysInMonth(iso: string): number {
  const [y, m] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Days left after `today` in its month ("21 days left" on 9 Nov). */
export function daysLeftInMonth(today: string): number {
  return daysInMonth(today) - Number(today.slice(8, 10))
}

/** Shift a YYYY-MM-01 month by whole months. */
export function addMonths(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1 + months, 1))
  return date.toISOString().slice(0, 10)
}

const monthFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long" })
const monthYearFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
})

/** "November" (or "November 2025" when `withYear`). */
export function formatMonth(month: string, withYear = false): string {
  return (withYear ? monthYearFormatter : monthFormatter).format(utcDate(month))
}

/** A valid YYYY-MM-01 that isn't after this month, or null. Accepts "2026-10" too. */
export function parseMonth(value: string | undefined, current: string): string | null {
  if (!value) return null
  const m = /^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/.exec(value)
  if (!m) return null
  const month = `${m[1]}-${m[2]}-01`
  return month <= current ? month : null
}

/** Converts between Date objects used by the calendar picker and YYYY-MM-DD. */
export function dateToIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}
