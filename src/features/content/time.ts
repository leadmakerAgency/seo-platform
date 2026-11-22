/**
 * Time zone helpers without a library: the client's posts are planned in the client's own
 * time zone (content_settings.timezone), stored as UTC instants.
 */

function partsIn(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second }
}

/** Milliseconds the zone is ahead of UTC at that instant. */
function offsetMs(ms: number, tz: string) {
  const p = partsIn(ms, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000
}

const pad = (n: number) => String(n).padStart(2, "0")

/** "2026-11-22" and "09:30" in `tz` as a UTC ISO string. */
export function zonedToUtc(date: string, time: string, tz: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const tm = /^(\d{2}):(\d{2})$/.exec(time)
  if (!dm || !tm) return null
  const guess = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2])
  let ms = guess - offsetMs(guess, tz)
  // Daylight saving: re-check once with the offset at the result.
  ms = guess - offsetMs(ms, tz)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** The date and time an instant shows in `tz`. */
export function utcToZoned(iso: string, tz: string): { date: string; time: string } {
  const p = partsIn(Date.parse(iso), tz)
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` }
}

/** Wall-clock time in `tz` without an offset, as Zernio's scheduledFor + timezone expects. */
export function wallClock(iso: string, tz: string): string {
  const p = partsIn(Date.parse(iso), tz)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:00`
}

export function formatInZone(iso: string, tz: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...opts,
  }).format(new Date(iso))
}

export function zoneLabel(tz: string, iso = new Date().toISOString()) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date(iso))
    .find((p) => p.type === "timeZoneName")?.value
  return name ? `${tz.replace(/_/g, " ")} (${name})` : tz
}

export function isValidZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Common US and world zones for the settings picker (any valid IANA name is accepted). */
export const COMMON_ZONES = [
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Belgrade",
  "Australia/Sydney",
  "UTC",
]
