import { intentOf, type Intent } from "./constants"

/**
 * Reading and merging the three sources of a ranking scan (docs/plans/ranking-scan/02-sources.md).
 * Pure (no server imports) so it can be checked by scripts/ranking-scan-check.ts.
 */

export type ScanSource = "dataforseo" | "search_console" | "google_business"

/** One keyword of a scan, with the database's column names (rank_scan_keywords). */
export type ScanRow = {
  keyword_norm: string
  phrase: string
  sources: ScanSource[]
  verdict?: "keep" | "quick_win" | "brand" | "watch" | "skip" | null
  reasons?: string[]
  is_brand?: boolean
  low_ctr?: boolean
  score?: number | null
  position?: number | null
  topic?: string | null
  dfs_position?: number | null
  dfs_type?: string | null
  dfs_url?: string | null
  dfs_previous_position?: number | null
  dfs_volume?: number | null
  dfs_etv?: number | null
  dfs_check_url?: string | null
  dfs_updated_at?: string | null
  other_language?: boolean
  gsc_clicks?: number | null
  gsc_impressions?: number | null
  gsc_ctr?: number | null
  gsc_position?: number | null
  gsc_page?: string | null
  gbp_reach?: number | null
  gbp_below_threshold?: boolean
  city_volume?: number | null
  national_volume?: number | null
  difficulty?: number | null
  intent?: Intent | null
  cpc?: number | null
}

type Rec = Record<string, unknown>
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
const str = (v: unknown) => (typeof v === "string" && v ? v : null)
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {})
const round1 = (n: number) => Math.round(n * 10) / 10

/** Same rule as private.normalize_keyword, plus the tracker's limits (80 characters, 10 words). */
export function normKeyword(s: string | null | undefined): string | null {
  const k = (s ?? "").trim().toLowerCase().replace(/\s+/g, " ")
  if (!k || k.length > 80 || k.split(" ").length > 10) return null
  return k
}

// ---------------------------------------------------------------------------
// DataForSEO Labs ranked_keywords
// ---------------------------------------------------------------------------

/** One ranked_keywords item → a scan row (DataForSEO columns). */
export function readRankedItem(item: Rec): ScanRow | null {
  const kd = rec(item.keyword_data)
  const info = rec(kd.keyword_info)
  const props = rec(kd.keyword_properties)
  const intentInfo = rec(kd.search_intent_info)
  const serpInfo = rec(kd.serp_info)
  const el = rec(item.ranked_serp_element)
  const serp = rec(el.serp_item)
  const norm = normKeyword(str(kd.keyword))
  const position = num(serp.rank_group)
  if (!norm || position === null) return null
  const changes = rec(serp.rank_changes)
  return {
    keyword_norm: norm,
    phrase: norm,
    sources: ["dataforseo"],
    dfs_position: Math.round(position),
    dfs_type: str(serp.type),
    dfs_url: str(serp.url),
    dfs_previous_position: num(changes.previous_rank_absolute) !== null ? Math.round(num(changes.previous_rank_absolute)!) : null,
    dfs_volume: num(info.search_volume) !== null ? Math.round(num(info.search_volume)!) : null,
    dfs_etv: num(serp.etv),
    dfs_check_url: str(el.check_url) ?? str(serpInfo.check_url),
    dfs_updated_at: str(el.last_updated_time) ?? str(serpInfo.last_updated_time),
    other_language: props.is_another_language === true,
    national_volume: num(info.search_volume) !== null ? Math.round(num(info.search_volume)!) : null,
    difficulty: num(props.keyword_difficulty) !== null ? Math.round(num(props.keyword_difficulty)!) : null,
    intent: intentOf(str(intentInfo.main_intent)),
    cpc: num(info.cpc),
  }
}

/** All items → one row per keyword, keeping the best (lowest) position across item types. */
export function dfsRows(items: Rec[]): ScanRow[] {
  const map = new Map<string, ScanRow>()
  for (const item of items) {
    const r = readRankedItem(item)
    if (!r) continue
    const cur = map.get(r.keyword_norm)
    if (!cur || (r.dfs_position ?? 999) < (cur.dfs_position ?? 999)) map.set(r.keyword_norm, r)
  }
  return [...map.values()]
}

/** DataForSEO dates look like "2026-11-12 08:31:22 +00:00". */
export function dfsDate(s: string | null | undefined): string | null {
  if (!s) return null
  const iso = s.replace(" +00:00", "Z").replace(" ", "T")
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString()
}

// ---------------------------------------------------------------------------
// Search Console (rows with keys [query, page])
// ---------------------------------------------------------------------------

export type GscInputRow = { keys: string[]; clicks: number; impressions: number; position: number }

/**
 * Query+page rows → one row per query: summed clicks and impressions, impression-weighted
 * position, the page with the most clicks (then impressions). Keeps queries with ≥ 3
 * impressions or a click, at most `max` by impressions.
 */
export function aggregateGsc(rows: GscInputRow[], max = 5000): ScanRow[] {
  type Acc = { phrase: string; clicks: number; impressions: number; posWeight: number; page: string | null; pageClicks: number; pageImpr: number }
  const map = new Map<string, Acc>()
  for (const r of rows) {
    const norm = normKeyword(r.keys[0])
    if (!norm) continue
    const a = map.get(norm) ?? { phrase: norm, clicks: 0, impressions: 0, posWeight: 0, page: null, pageClicks: -1, pageImpr: -1 }
    const impressions = Math.max(0, r.impressions || 0)
    a.clicks += Math.max(0, r.clicks || 0)
    a.impressions += impressions
    a.posWeight += (r.position || 0) * impressions
    const page = r.keys[1] ?? null
    if (page && (r.clicks > a.pageClicks || (r.clicks === a.pageClicks && impressions > a.pageImpr))) {
      a.page = page
      a.pageClicks = r.clicks
      a.pageImpr = impressions
    }
    map.set(norm, a)
  }
  return [...map.entries()]
    .filter(([, a]) => a.impressions >= 3 || a.clicks >= 1)
    .sort((x, y) => y[1].impressions - x[1].impressions)
    .slice(0, max)
    .map(([norm, a]) => ({
      keyword_norm: norm,
      phrase: a.phrase,
      sources: ["search_console"] as ScanSource[],
      gsc_clicks: a.clicks,
      gsc_impressions: a.impressions,
      gsc_ctr: a.impressions > 0 ? Math.round((a.clicks / a.impressions) * 10_000) / 10_000 : 0,
      gsc_position: a.impressions > 0 ? round1(a.posWeight / a.impressions) : null,
      gsc_page: a.page,
    }))
}

// ---------------------------------------------------------------------------
// Google Business Profile search keywords
// ---------------------------------------------------------------------------

/** Keywords across months and locations → monthly reach (or "below Google's threshold"). */
export function aggregateGbp(list: { keyword: string; impressions: number; belowThreshold: boolean }[], months: number): ScanRow[] {
  const map = new Map<string, { total: number; below: boolean; any: boolean }>()
  for (const k of list) {
    const norm = normKeyword(k.keyword)
    if (!norm) continue
    const a = map.get(norm) ?? { total: 0, below: true, any: false }
    a.total += Math.max(0, k.impressions || 0)
    a.below = a.below && k.belowThreshold
    a.any = true
    map.set(norm, a)
  }
  return [...map.entries()].map(([norm, a]) => ({
    keyword_norm: norm,
    phrase: norm,
    sources: ["google_business"] as ScanSource[],
    gbp_reach: Math.round(a.total / Math.max(1, months)),
    gbp_below_threshold: a.total === 0 && a.below,
  }))
}

// ---------------------------------------------------------------------------
// Merging, brand terms, dates
// ---------------------------------------------------------------------------

/** Rows from several sources → one row per keyword (sources unioned, non-null values kept). */
export function mergeRows(...lists: ScanRow[][]): ScanRow[] {
  const map = new Map<string, ScanRow>()
  for (const list of lists) {
    for (const r of list) {
      const cur = map.get(r.keyword_norm)
      if (!cur) {
        map.set(r.keyword_norm, { ...r, sources: [...r.sources] })
        continue
      }
      for (const [k, v] of Object.entries(r) as [keyof ScanRow, unknown][]) {
        if (k === "sources") continue
        if (typeof v === "boolean") (cur as Record<string, unknown>)[k] = Boolean(cur[k]) || v
        else if (v !== null && v !== undefined && (cur[k] === null || cur[k] === undefined)) (cur as Record<string, unknown>)[k] = v
      }
      for (const s of r.sources) if (!cur.sources.includes(s)) cur.sources.push(s)
    }
  }
  const order: ScanSource[] = ["dataforseo", "search_console", "google_business"]
  for (const r of map.values()) r.sources.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return [...map.values()]
}

/** "www.novachki-dev.com" → "novachki-dev" (the registrable name without the TLD). */
export function domainStem(domain: string | null | undefined): string | null {
  if (!domain) return null
  const host = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
  const parts = host.split(".").filter(Boolean)
  if (parts.length < 2) return parts[0] ?? null
  // co.uk, com.au, com.mk… keep the label before the public suffix.
  const twoPart = parts.length >= 3 && ["co", "com", "org", "net", "gov", "edu", "ac"].includes(parts[parts.length - 2])
  return parts[parts.length - (twoPart ? 3 : 2)] ?? null
}

/** Brand terms: the domain stem (also with dashes as spaces), the client's name, and extras. */
export function brandTermsFor(name: string | null, domain: string | null, extra: string[]): string[] {
  const stem = domainStem(domain)
  const terms = [
    stem,
    stem?.includes("-") ? stem.replace(/-/g, " ") : null,
    stem?.includes("-") ? stem.replace(/-/g, "") : null,
    normKeyword(name),
    ...extra.map((e) => normKeyword(e)),
  ].filter((t): t is string => Boolean(t) && t!.length >= 4)
  return [...new Set(terms)]
}

export function isBrandSearch(norm: string, terms: string[]): boolean {
  const squashed = norm.replace(/[\s-]/g, "")
  return terms.some((t) => norm.includes(t) || (t.length >= 6 && squashed.includes(t.replace(/[\s-]/g, ""))))
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

/** The Search Console window: the last 3 months ending 3 days ago (data lag). */
export function gscWindow(now = new Date()): { fromDate: string; toDate: string } {
  const to = new Date(now.getTime() - 3 * 86_400_000)
  const from = new Date(to.getTime() - 89 * 86_400_000)
  return { fromDate: ymd(from), toDate: ymd(to) }
}

/** The last 3 full months for Business Profile keywords (YYYY-MM). */
export function gbpMonths(now = new Date()): { startMonth: string; endMonth: string; months: number } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1))
  const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
  return { startMonth: ym(start), endMonth: ym(end), months: 3 }
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<ScanSource, string> = {
  dataforseo: "DataForSEO",
  search_console: "Search Console",
  google_business: "Business Profile",
}
export const sourceLabel = (s: ScanSource) => SOURCE_LABEL[s]

// The scan CSV is scanCsv in ./csv.ts, with the other Rankings downloads.
