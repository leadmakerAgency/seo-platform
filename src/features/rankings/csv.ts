import { toCsv } from "@/lib/csv"
import { countryShort } from "@/lib/format"
import { difficultyWord, ENGINE_META, INTENT_META, intentOf, NOT_FOUND, SOURCE_LABELS, type Engine } from "./constants"
import type { Candidate, TrackedKeyword } from "./queries"
import type { LostRow, ScanPageRow } from "./scan-queries"
import { sourceLabel, type ScanRow } from "./scan-sources"
import { VERDICT_META, type Verdict } from "./scan-verdicts"

/**
 * The Rankings CSV downloads (Keywords, Ranking now, Find better keywords). Pure: built in the
 * browser from loaded rows, or by a server action for lists longer than the screen shows.
 * Labels match the screen; numbers stay numbers so spreadsheets can sort them.
 */

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "")
const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100
const intentLabel = (v: string | null | undefined) => {
  const i = intentOf(v)
  return i ? INTENT_META[i].label : ""
}
const verdictLabel = (v: Verdict | null | undefined) => (v ? VERDICT_META[v].label : "")
const difficulty = (n: number | null | undefined) => (n === null || n === undefined ? "" : `${n} ${difficultyWord(n)}`)
const money = (n: number | string | null | undefined) => {
  if (n === null || n === undefined || n === "") return null
  const v = Number(n)
  return Number.isFinite(v) ? round2(v) : null
}
const pos = (n: number | null | undefined) => (n === null || n === undefined ? null : round1(n))
/** Positive = moved up (a smaller position number). */
const change = (now: number | null | undefined, before: number | null | undefined) =>
  now === null || now === undefined || before === null || before === undefined ? null : round1(before - now)

/** "AU searches / month", or "National searches / month" with no country. */
export const nationalHeader = (country: string | null) => `${country ? countryShort(country) : "National"} searches / month`

const KEYWORD_SOURCE: Record<string, string> = {
  manual: "Added by hand",
  research: "Find better keywords",
  onboarding: "Onboarding",
  ranked: "Ranking now",
}

/** Rankings → Keywords (tracked keywords), one block of columns per engine the client tracks. */
export function trackedKeywordsCsv(rows: TrackedKeyword[], engines: Engine[], country: string | null): string {
  const head = ["Keyword", "Service", "Score", "Weak because", "Ranking scan"]
  for (const e of engines) {
    const l = ENGINE_META[e].label
    head.push(`${l} position`, `${l} change since last check`, `${l} first position`, `${l} page`)
    if (e === "google_maps") head.push("Map pack position")
    if (e === "google") head.push("In AI Overview")
  }
  head.push("City searches / month", nationalHeader(country), "Difficulty", "Intent", "CPC (USD)", "Last checked", "Added on", "Added from")

  const lines = rows.map((k) => {
    const out: unknown[] = [k.phrase, k.topic ?? "", k.score, k.weak.join("; "), verdictLabel(k.scan?.verdict)]
    let checked: string | null = null
    for (const e of engines) {
      const r = k.engines[e]
      if (r?.checkedAt && (!checked || r.checkedAt > checked)) checked = r.checkedAt
      out.push(
        r ? (r.position ?? (r.checkedAt ? NOT_FOUND[e] : "")) : "",
        change(r?.position, r?.previous),
        r?.start ?? null,
        r?.url ?? "",
      )
      if (e === "google_maps") out.push(r?.localPack ?? null)
      if (e === "google") out.push(r ? r.inAiOverview : "")
    }
    out.push(
      k.localVolume,
      k.nationalVolume,
      difficulty(k.difficulty),
      intentLabel(k.intent),
      money(k.cpc),
      day(checked),
      day(k.addedAt),
      KEYWORD_SOURCE[k.source] ?? k.source,
    )
    return out
  })
  return toCsv(head, lines)
}

type ScanCsvRow = ScanRow & Partial<Pick<ScanPageRow, "prev_position" | "is_new" | "tracked_id">>

/** Rankings → Ranking now (one scan's keywords). */
export function scanCsv(rows: ScanCsvRow[], country: string | null = null): string {
  const head = [
    "Keyword", "Sources", "Verdict", "Position", "Change since last scan", "New", "Tracked", "Brand",
    "DataForSEO position", "Search Console position", "Clicks (3 mo)", "Impressions (3 mo)", "CTR", "Low click rate",
    "Maps reach / month", "City searches / month", nationalHeader(country), "Difficulty", "Intent", "CPC (USD)", "Page",
    "Reasons",
  ]
  const lines = rows.map((r) => [
    r.phrase,
    r.sources.map(sourceLabel).join(" + "),
    verdictLabel(r.verdict),
    pos(r.position),
    change(r.position, r.prev_position),
    r.is_new === undefined ? "" : r.is_new,
    r.tracked_id === undefined ? "" : Boolean(r.tracked_id),
    Boolean(r.is_brand),
    pos(r.dfs_position),
    pos(r.gsc_position),
    r.gsc_clicks ?? null,
    r.gsc_impressions ?? null,
    r.gsc_ctr !== null && r.gsc_ctr !== undefined ? `${Math.round(r.gsc_ctr * 1000) / 10}%` : "",
    Boolean(r.low_ctr),
    r.gbp_below_threshold ? "<15" : (r.gbp_reach ?? null),
    r.city_volume ?? null,
    r.national_volume ?? null,
    difficulty(r.difficulty),
    intentLabel(r.intent),
    money(r.cpc),
    r.gsc_page ?? r.dfs_url ?? "",
    (r.reasons ?? []).join("; "),
  ])
  return toCsv(head, lines)
}

/** Rankings → Ranking now → Lost since last scan. */
export function lostCsv(rows: LostRow[]): string {
  return toCsv(
    ["Keyword", "Last verdict", "Last position", "Sources", "Clicks (3 mo)"],
    rows.map((r) => [r.phrase, verdictLabel(r.verdict), pos(r.position), r.sources.map(sourceLabel).join(" + "), r.gsc_clicks]),
  )
}

const STATUS: Record<string, string> = { new: "New", tracked: "Tracked", dismissed: "Dismissed" }

/** Rankings → Find better keywords (ideas, or the dismissed list with its reasons). */
export function candidatesCsv(rows: Candidate[], country: string | null, trackedNorms: Set<string>, dismissed = false): string {
  const head = [
    "Keyword", "Score", "Service", "City searches / month", nationalHeader(country), "Difficulty", "Intent", "CPC (USD)",
    "Trend (yearly %)", "Already ranking (position)", "Ranking page", "Found in", "Status", "Core keyword",
  ]
  if (dismissed) head.push("Dismiss reason", "Dismissed on")
  const lines = rows.map((c) => {
    const status = c.status !== "dismissed" && trackedNorms.has(c.keyword_norm) ? "tracked" : c.status
    const out: unknown[] = [
      c.phrase,
      c.score,
      c.topic ?? "",
      c.local_volume,
      c.national_volume,
      difficulty(c.difficulty),
      intentLabel(c.intent),
      money(c.cpc),
      c.trend_yearly,
      c.ranked_position,
      c.ranked_url ?? "",
      [...new Set(c.sources.map((s) => SOURCE_LABELS[s] ?? s))].join(" + "),
      STATUS[status] ?? status,
      c.core_keyword ?? "",
    ]
    if (dismissed) out.push(c.dismiss_reason ?? "", day(c.decided_at))
    return out
  })
  return toCsv(head, lines)
}
