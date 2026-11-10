const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  IE: "Ireland",
  AU: "Australia",
  NZ: "New Zealand",
}

/** Countries offered in forms and filters, in display order. */
export const COUNTRIES = Object.entries(COUNTRY_NAMES).map(([code, name]) => ({ code, name }))

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code
}

/** Short country label for dense tables ("UK" reads better than "GB"). */
export function countryShort(code: string): string {
  return code === "GB" ? "UK" : code
}

export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.includes("@") ? nameOrEmail.split("@")[0] : nameOrEmail
  const parts = base
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return "?"
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]
  return letters.toUpperCase()
}

/** "Peoria, AZ, US" from whatever parts are filled in. */
export function formatLocation(city: string | null, region: string | null, country: string) {
  return [city, region, countryShort(country)].filter(Boolean).join(", ")
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value)
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

export function formatDate(value: string | Date): string {
  return dateFormatter.format(typeof value === "string" ? new Date(value) : value)
}

const relativeFormatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" })

/** "3 hours ago", "yesterday", or a date for anything older than a week. */
export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return "just now"
  if (abs < 3600) return relativeFormatter.format(Math.round(seconds / 60), "minute")
  if (abs < 86400) return relativeFormatter.format(Math.round(seconds / 3600), "hour")
  if (abs < 7 * 86400) return relativeFormatter.format(Math.round(seconds / 86400), "day")
  return formatDate(date)
}

/** Strips the protocol and trailing slash: "https://site.com/" -> "site.com". */
export function displayUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
}
