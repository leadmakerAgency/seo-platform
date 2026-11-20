/**
 * Competitors for Shockwave AI Search (docs/plans/backlinks/11-competitor-backlinks.md §2.1).
 * Pure: domain checks and picking the top 5. The database enforces the same rules.
 */

export const MAX_COMPETITORS = 5
export const MIN_COMPETITORS = 2

/** Big platforms are never "competitors" (mirrors private.competitor_platform). */
export const PLATFORMS = new Set([
  "google.com", "youtube.com", "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "tiktok.com", "pinterest.com", "reddit.com", "wikipedia.org", "amazon.com", "ebay.com", "yelp.com",
  "g2.com", "capterra.com", "clutch.co", "trustpilot.com", "bbb.org", "apple.com", "microsoft.com",
  "medium.com", "quora.com", "github.com", "yahoo.com", "bing.com", "indeed.com", "glassdoor.com",
])

/** Sites that link to almost everyone; never a useful "place to apply". */
export const GENERIC_LINKERS = new Set([
  ...PLATFORMS,
  "t.co", "bit.ly", "lnkd.in", "archive.org", "web.archive.org", "w3.org", "wordpress.org", "wordpress.com",
  "blogspot.com", "tumblr.com", "gravatar.com", "googleusercontent.com", "feedburner.com", "feedly.com",
  "similarweb.com", "semrush.com", "ahrefs.com", "moz.com", "builtwith.com", "whois.com", "who.is",
  "sitelike.org", "siteprice.org", "websiteoutlook.com", "statshow.com", "hypestat.com", "site-analyzer.com",
])

/** "https://www.Example.com/path" → "example.com"; null if it isn't a domain. */
export function cleanDomain(raw: string): string | null {
  const d = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/:?#].*$/, "")
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null
}

export type CompetitorOption = {
  domain: string
  name: string | null
  source: "ai" | "dataforseo" | "team"
  active: boolean
  /** How often and where it was seen (markets, positions). */
  evidence?: Record<string, unknown>
}

/**
 * The competitors a run uses: the team's active list first, then those the AI found in most
 * places, then keyword-overlap suggestions, up to 5.
 */
export function pickCompetitors(input: {
  saved: CompetitorOption[]
  found: { domain: string; name?: string | null; markets?: number }[]
  clientDomain: string | null
  max?: number
}): string[] {
  const max = input.max ?? MAX_COMPETITORS
  const out: string[] = []
  const ok = (d: string | null): d is string =>
    Boolean(d) && !PLATFORMS.has(d!) && d !== input.clientDomain && !out.includes(d!)
  for (const c of input.saved.filter((s) => s.active)) {
    const d = cleanDomain(c.domain)
    if (ok(d) && out.length < max) out.push(d)
  }
  if (out.length >= MIN_COMPETITORS) return out
  for (const f of [...input.found].sort((a, b) => (b.markets ?? 1) - (a.markets ?? 1))) {
    const d = cleanDomain(f.domain)
    if (ok(d) && out.length < max) out.push(d)
  }
  for (const c of input.saved.filter((s) => !s.active)) {
    const d = cleanDomain(c.domain)
    if (ok(d) && out.length < max) out.push(d)
  }
  return out
}
