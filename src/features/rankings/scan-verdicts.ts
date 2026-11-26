import { hasNegative, scoreKeyword, topicOf } from "./scoring"
import { isBrandSearch, type ScanRow } from "./scan-sources"

/**
 * Is a keyword the client already ranks for worth keeping? (docs/plans/ranking-scan/04-verdicts.md)
 * Pure. First matching rule wins: Not useful → Brand → Keep → Quick win → Watch.
 */

export type Verdict = "keep" | "quick_win" | "brand" | "watch" | "skip"

export type VerdictContext = {
  topics: string[]
  negatives: string[]
  brandTerms: string[]
  city: string | null
  country: string | null
}

export type Judged = {
  verdict: Verdict
  reasons: string[]
  score: number
  position: number | null
  lowCtr: boolean
  isBrand: boolean
  topic: string | null
}

/** Expected click rate by position (rough industry averages), for the "rarely clicked" flag. */
export const EXPECTED_CTR: [number, number][] = [
  [1, 0.28],
  [2, 0.15],
  [3, 0.1],
  [4, 0.07],
  [5, 0.05],
  [10, 0.03],
]
export const expectedCtr = (position: number) => (EXPECTED_CTR.find(([p]) => Math.round(position) <= p) ?? [10, 0.03])[1]

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n))

/** The row's position: Search Console's average when it has enough impressions, else DataForSEO's. */
export function bestPosition(r: ScanRow): number | null {
  const gsc = r.gsc_position ?? null
  if (gsc !== null && (r.gsc_impressions ?? 0) >= 10) return gsc
  return r.dfs_position ?? gsc
}

export function judge(r: ScanRow, ctx: VerdictContext): Judged {
  const position = bestPosition(r)
  const clicks = r.gsc_clicks ?? 0
  const impressions = r.gsc_impressions ?? 0
  const monthlyImpr = impressions / 3
  const reach = r.gbp_reach ?? 0
  const volume = r.city_volume ?? (r.national_volume !== null && r.national_volume !== undefined ? Math.round(r.national_volume / 4) : null)
  const topic = topicOf(r.keyword_norm, ctx.topics)
  const brand = isBrandSearch(r.keyword_norm, ctx.brandTerms)
  const excluded = hasNegative(r.keyword_norm, ctx.negatives)

  // Reasons describe the facts first, then the verdict's own reason.
  const facts: string[] = []
  const gscUsed = r.gsc_position !== null && r.gsc_position !== undefined && impressions >= 10
  if (gscUsed) facts.push(`Position ${r.gsc_position} on Google (Search Console, 3-month average)`)
  if (r.dfs_position !== null && r.dfs_position !== undefined) {
    facts.push(`#${r.dfs_position} on Google${ctx.country ? ` in ${ctx.country}` : ""} (DataForSEO)`)
  }
  if (!gscUsed && r.gsc_position !== null && r.gsc_position !== undefined) facts.push(`Position ${r.gsc_position} in Search Console`)
  if (impressions > 0 || clicks > 0) facts.push(`${fmt(clicks)} clicks and ${fmt(impressions)} impressions in 3 months`)
  if (r.city_volume !== null && r.city_volume !== undefined) facts.push(`${fmt(r.city_volume)} searches a month${ctx.city ? ` in ${ctx.city}` : ""}`)
  else if (r.national_volume !== null && r.national_volume !== undefined) facts.push(`${fmt(r.national_volume)} searches a month nationally`)
  if (r.gbp_below_threshold) facts.push("Shown on the Maps listing (fewer than 15 people a month)")
  else if (reach > 0) facts.push(`Seen by ${fmt(reach)} people a month on the Maps listing`)

  const lowCtr =
    impressions >= 300 && r.gsc_position !== null && r.gsc_position !== undefined && r.gsc_position <= 10 &&
    (r.gsc_ctr ?? 0) < expectedCtr(r.gsc_position) / 2

  const { score: base } = scoreKeyword({
    localVolume: r.city_volume ?? null,
    nationalVolume: r.national_volume ?? null,
    difficulty: r.difficulty ?? null,
    cpc: r.cpc ?? null,
    intent: r.intent ?? null,
    position,
  })
  const score = Math.min(100, base + Math.min(15, Math.round(clicks / 2)))

  const out = (verdict: Verdict, why: string | null): Judged => ({
    verdict,
    reasons: [...(why ? [why] : []), ...facts, ...(lowCtr ? ["Seen but rarely clicked: improve the title and description"] : [])].slice(0, 8),
    score,
    position,
    lowCtr,
    isBrand: brand,
    topic,
  })

  const noDemand = (volume ?? 0) < 10 && monthlyImpr < 10 && clicks === 0 && reach === 0 && !r.gbp_below_threshold
  if (excluded) return out("skip", "Has a word the client doesn't want (Settings → Leave out keywords with)")
  if (r.other_language) return out("skip", "Another language")
  if (r.intent === "informational" && !topic && !brand) return out("skip", "Searching for information, not a business")
  if (noDemand && !brand) return out("skip", "Hardly anyone searches this")

  if (brand) return out("brand", "People search for the business by name")

  const demandKeep = (volume ?? 0) >= 10 || monthlyImpr >= 20 || clicks >= 3
  if ((position !== null && position <= 10 && demandKeep) || clicks >= 10 || reach >= 50) {
    return out("keep", "Ranking well: keep it")
  }
  const demandPush = (volume ?? 0) >= 20 || monthlyImpr >= 50
  if ((position !== null && position > 10 && position <= 20 && demandPush) || (reach >= 15 && reach < 50)) {
    return out("quick_win", "Close to the first page: worth pushing")
  }
  return out("watch", position !== null && position > 20 ? "Ranking, but far from the first page" : "Ranking, small demand for now")
}

/** The verdict labels and tones used across the UI. */
export const VERDICT_META: Record<Verdict, { label: string; short: string; tone: "success" | "info" | "brand" | "neutral" | "danger"; explain: string }> = {
  keep: { label: "Keep", short: "Keep", tone: "success", explain: "Ranking well with real searches or clicks. Don't swap it out." },
  quick_win: { label: "Quick win", short: "Quick win", tone: "info", explain: "Close to the first page (11–20) with demand. Worth pushing." },
  brand: { label: "Brand", short: "Brand", tone: "brand", explain: "People searching for the business by name. Good, but not an SEO win." },
  watch: { label: "Watch", short: "Watch", tone: "neutral", explain: "Ranking, but far down or with little demand for now." },
  skip: { label: "Not useful", short: "Not useful", tone: "danger", explain: "Unrelated, excluded, another language or no real searches." },
}
