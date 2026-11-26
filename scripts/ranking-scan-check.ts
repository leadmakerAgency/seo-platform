import assert from "node:assert/strict"

import {
  aggregateGbp,
  aggregateGsc,
  brandTermsFor,
  dfsDate,
  dfsRows,
  domainStem,
  gbpMonths,
  gscWindow,
  isBrandSearch,
  mergeRows,
  normKeyword,
  scanCsv,
  type ScanRow,
} from "../src/features/rankings/scan-sources"
import { bestPosition, expectedCtr, judge, type VerdictContext } from "../src/features/rankings/scan-verdicts"
import { iso3 } from "../src/lib/iso3"

let n = 0
const ok = (name: string, fn: () => void) => {
  fn()
  n++
  console.log("ok", name)
}

const item = (keyword: string, rank: number, extra: Record<string, unknown> = {}) => ({
  keyword_data: {
    keyword,
    keyword_info: { search_volume: 320, cpc: 12.5 },
    keyword_properties: { keyword_difficulty: 30, is_another_language: false },
    search_intent_info: { main_intent: "transactional" },
    serp_info: { last_updated_time: "2026-11-12 08:31:22 +00:00" },
  },
  ranked_serp_element: {
    check_url: "https://www.google.com/search?q=x",
    serp_item: { type: "organic", rank_group: rank, url: "https://example.com/a", etv: 12.3, rank_changes: { previous_rank_absolute: 6 } },
  },
  ...extra,
})

ok("normalising", () => {
  assert.equal(normKeyword("  Plumber   PHOENIX "), "plumber phoenix")
  assert.equal(normKeyword(""), null)
  assert.equal(normKeyword("a ".repeat(11)), null)
  assert.equal(normKeyword("x".repeat(81)), null)
})

ok("dataforseo items", () => {
  const rows = dfsRows([item("Plumber Phoenix", 7), item("plumber  phoenix", 3), item("drain cleaning", 14), { keyword_data: {} }])
  assert.equal(rows.length, 2)
  const p = rows.find((r) => r.keyword_norm === "plumber phoenix")!
  assert.equal(p.dfs_position, 3)
  assert.equal(p.dfs_volume, 320)
  assert.equal(p.national_volume, 320)
  assert.equal(p.intent, "transactional")
  assert.equal(p.dfs_previous_position, 6)
  assert.equal(dfsDate("2026-11-12 08:31:22 +00:00"), "2026-11-12T08:31:22.000Z")
})

ok("search console aggregation", () => {
  const rows = aggregateGsc([
    { keys: ["Plumber Phoenix", "https://a.com/"], clicks: 10, impressions: 100, position: 2 },
    { keys: ["plumber phoenix", "https://a.com/plumbing"], clicks: 30, impressions: 300, position: 4 },
    { keys: ["rare one", "https://a.com/"], clicks: 0, impressions: 2, position: 9 },
    { keys: ["clicked once", "https://a.com/"], clicks: 1, impressions: 1, position: 12 },
  ])
  assert.equal(rows.length, 2)
  const p = rows.find((r) => r.keyword_norm === "plumber phoenix")!
  assert.equal(p.gsc_clicks, 40)
  assert.equal(p.gsc_impressions, 400)
  assert.equal(p.gsc_position, 3.5) // (2·100 + 4·300) / 400
  assert.equal(p.gsc_page, "https://a.com/plumbing")
  assert.equal(p.gsc_ctr, 0.1)
})

ok("business profile aggregation", () => {
  const rows = aggregateGbp(
    [
      { keyword: "Plumber near me", impressions: 90, belowThreshold: false },
      { keyword: "plumber near me", impressions: 60, belowThreshold: false },
      { keyword: "emergency plumber", impressions: 0, belowThreshold: true },
    ],
    3,
  )
  assert.equal(rows.find((r) => r.keyword_norm === "plumber near me")!.gbp_reach, 50)
  assert.equal(rows.find((r) => r.keyword_norm === "emergency plumber")!.gbp_below_threshold, true)
})

ok("merging sources", () => {
  const merged = mergeRows(
    dfsRows([item("plumber phoenix", 4)]),
    aggregateGsc([{ keys: ["Plumber Phoenix", "https://a.com/"], clicks: 5, impressions: 50, position: 3 }]),
    aggregateGbp([{ keyword: "PLUMBER phoenix", impressions: 30, belowThreshold: false }], 3),
  )
  assert.equal(merged.length, 1)
  assert.deepEqual(merged[0].sources, ["dataforseo", "search_console", "google_business"])
  assert.equal(merged[0].dfs_position, 4)
  assert.equal(merged[0].gsc_position, 3)
  assert.equal(merged[0].gbp_reach, 10)
  assert.equal(bestPosition(merged[0]), 3)
  assert.equal(bestPosition({ ...merged[0], gsc_impressions: 5 }), 4)
})

ok("brand terms", () => {
  assert.equal(domainStem("www.novachki-dev.com"), "novachki-dev")
  assert.equal(domainStem("shop.example.co.uk"), "example")
  assert.equal(domainStem("bob.com.mk"), "bob")
  const terms = brandTermsFor("Stefan Novachki", "novachkidev.com", ["ND", "Novachki Dev"])
  assert.ok(terms.includes("novachkidev"))
  assert.ok(terms.includes("stefan novachki"))
  assert.ok(!terms.includes("nd"), "short terms are ignored")
  assert.ok(isBrandSearch("novachki dev reviews", terms))
  assert.ok(isBrandSearch("novachkidev", terms))
  assert.ok(!isBrandSearch("web developer skopje", terms))
})

const ctx: VerdictContext = { topics: ["plumber", "drain cleaning"], negatives: ["jobs", "diy"], brandTerms: ["acmeplumbing"], city: "Phoenix", country: "the United States" }
const row = (r: Partial<ScanRow> & { keyword_norm: string }): ScanRow => ({ phrase: r.keyword_norm, sources: ["search_console"], ...r })

ok("verdicts", () => {
  assert.equal(judge(row({ keyword_norm: "plumber phoenix", gsc_position: 3.2, gsc_impressions: 1250, gsc_clicks: 41, city_volume: 90 }), ctx).verdict, "keep")
  assert.equal(judge(row({ keyword_norm: "water heater plumber", dfs_position: 14, national_volume: 320 }), ctx).verdict, "quick_win")
  assert.equal(judge(row({ keyword_norm: "acmeplumbing", gsc_position: 1, gsc_impressions: 40, gsc_clicks: 9 }), ctx).verdict, "brand")
  assert.equal(judge(row({ keyword_norm: "plumber jobs", dfs_position: 2, national_volume: 5000 }), ctx).verdict, "skip")
  assert.equal(judge(row({ keyword_norm: "how to fix a leaky faucet", dfs_position: 5, national_volume: 9000, intent: "informational" }), ctx).verdict, "skip")
  assert.equal(judge(row({ keyword_norm: "drain cleaning mesa", gsc_position: 34, gsc_impressions: 36 }), ctx).verdict, "watch")
  // No demand at all
  assert.equal(judge(row({ keyword_norm: "plumber xyz", gsc_position: 4, gsc_impressions: 6 }), ctx).verdict, "skip")
  // Clicks alone keep it, at any position
  assert.equal(judge(row({ keyword_norm: "plumber far", gsc_position: 25, gsc_impressions: 200, gsc_clicks: 10 }), ctx).verdict, "keep")
  // Maps reach
  assert.equal(judge(row({ keyword_norm: "plumber near me", sources: ["google_business"], gbp_reach: 60 }), ctx).verdict, "keep")
  assert.equal(judge(row({ keyword_norm: "plumber near me", sources: ["google_business"], gbp_reach: 20 }), ctx).verdict, "quick_win")
  // Thresholds exactly at the edge
  assert.equal(judge(row({ keyword_norm: "plumber ten", dfs_position: 10, city_volume: 10 }), ctx).verdict, "keep")
  assert.equal(judge(row({ keyword_norm: "plumber eleven", dfs_position: 11, city_volume: 20 }), ctx).verdict, "quick_win")
  assert.equal(judge(row({ keyword_norm: "plumber twentyone", dfs_position: 21, city_volume: 500 }), ctx).verdict, "watch")
  // Brand with an excluded word is still not useful
  assert.equal(judge(row({ keyword_norm: "acmeplumbing jobs", gsc_position: 1, gsc_impressions: 100 }), ctx).verdict, "skip")
  // Informational on a topic is fine
  assert.equal(judge(row({ keyword_norm: "how much does a plumber cost", dfs_position: 6, city_volume: 50, intent: "informational" }), ctx).verdict, "keep")
  // Another language
  assert.equal(judge(row({ keyword_norm: "plumber phoenix es", dfs_position: 2, city_volume: 50, other_language: true }), ctx).verdict, "skip")
})

ok("reasons, flags and score", () => {
  const j = judge(row({ keyword_norm: "plumber phoenix", gsc_position: 2, gsc_impressions: 900, gsc_clicks: 20, gsc_ctr: 0.022, city_volume: 300, dfs_position: 3 }), ctx)
  assert.equal(j.verdict, "keep")
  assert.equal(j.lowCtr, true, "2.2% at position 2 is under half of 15%")
  assert.ok(j.reasons[0].startsWith("Ranking well"))
  assert.ok(j.reasons.some((r) => r.includes("Search Console")))
  assert.ok(j.reasons.some((r) => r.includes("in Phoenix")))
  assert.ok(j.reasons.some((r) => r.includes("rarely clicked")))
  assert.ok(j.score > 0 && j.score <= 100)
  assert.equal(expectedCtr(1), 0.28)
  assert.equal(expectedCtr(7.4), 0.03)
})

ok("dates and countries", () => {
  const w = gscWindow(new Date("2026-11-26T12:00:00Z"))
  assert.deepEqual(w, { fromDate: "2026-08-26", toDate: "2026-11-23" })
  assert.deepEqual(gbpMonths(new Date("2026-11-26T12:00:00Z")), { startMonth: "2026-08", endMonth: "2026-10", months: 3 })
  assert.equal(iso3("US"), "usa")
  assert.equal(iso3("mk"), "mkd")
  assert.equal(iso3("XX"), null)
})

ok("csv", () => {
  const csv = scanCsv([row({ keyword_norm: 'plumber, "best"', verdict: "keep", reasons: ["a", "b"], gsc_ctr: 0.1234 })])
  assert.ok(csv.startsWith("﻿Keyword,"))
  assert.ok(csv.includes('"plumber, ""best"""'))
  assert.ok(csv.includes("12.3%"))
  assert.ok(csv.includes("a; b"))
})

console.log(`${n} groups pass`)
