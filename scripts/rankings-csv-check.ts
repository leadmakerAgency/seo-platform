import assert from "node:assert/strict"

import { DEFAULT_CANDIDATE_FILTERS, isFiltered, matchesCandidate, type CandidateFilters } from "../src/features/rankings/candidate-filter"
import { candidatesCsv, lostCsv, nationalHeader, scanCsv, trackedKeywordsCsv } from "../src/features/rankings/csv"
import type { Candidate, EngineRank, TrackedKeyword } from "../src/features/rankings/queries"
import { csvCell, csvFileName, toCsv } from "../src/lib/csv"

/** Pure checks for the Rankings CSV downloads: npx tsx --conditions=react-server scripts/rankings-csv-check.ts */

let n = 0
const ok = (name: string, fn: () => void) => {
  fn()
  n++
  console.log("ok", name)
}
const lines = (csv: string) => csv.replace(/^﻿/, "").split("\r\n")

ok("cells: quoting, formulas, numbers", () => {
  assert.equal(csvCell('plumber, "best"'), '"plumber, ""best"""')
  assert.equal(csvCell("two\nlines"), '"two\nlines"')
  assert.equal(csvCell("=SUM(1)"), "'=SUM(1)")
  assert.equal(csvCell("+1 call"), "'+1 call")
  assert.equal(csvCell("@me"), "'@me")
  assert.equal(csvCell("-x"), "'-x")
  assert.equal(csvCell(-5), "-5")
  assert.equal(csvCell(3.5), "3.5")
  assert.equal(csvCell(Number.NaN), "")
  assert.equal(csvCell(null), "")
  assert.equal(csvCell(undefined), "")
  assert.equal(csvCell(true), "Yes")
  assert.equal(csvCell(false), "No")
})

ok("file: BOM, CRLF, name", () => {
  const csv = toCsv(["A", "B"], [[1, "x"], [2, "y"]])
  assert.ok(csv.startsWith("﻿A,B\r\n1,x\r\n2,y"))
  assert.equal(csvFileName("market-beacon-report", "ranking-now-Quick win", "2026-11-27T10:00:00Z"), "market-beacon-report-ranking-now-quick-win-2026-11-27.csv")
  assert.equal(nationalHeader("AU"), "AU searches / month")
  assert.equal(nationalHeader("GB"), "UK searches / month")
  assert.equal(nationalHeader(null), "National searches / month")
})

const rank = (p: Partial<EngineRank>): EngineRank => ({
  position: null,
  previous: null,
  start: null,
  url: null,
  checkedAt: null,
  history: [],
  localPack: null,
  features: [],
  inAiOverview: false,
  checkUrl: null,
  mapsRating: null,
  mapsReviews: null,
  checks: 0,
  found: 0,
  ...p,
})

const tracked = (p: Partial<TrackedKeyword>): TrackedKeyword => ({
  id: "k1",
  phrase: "plumber sydney",
  topic: "plumbing",
  source: "research",
  addedAt: "2026-10-01T00:00:00Z",
  firstCheckedAt: null,
  localVolume: 90,
  nationalVolume: 1600,
  difficulty: 42,
  intent: "transactional",
  cpc: 12.345,
  coreKeyword: null,
  monthly: [],
  engines: { google: null, google_maps: null, bing: null },
  score: 71,
  weak: [],
  scan: null,
  ...p,
})

ok("tracked keywords", () => {
  const csv = trackedKeywordsCsv(
    [
      tracked({
        engines: {
          google: rank({ position: 4, previous: 7, start: 12, url: "https://x.com/a", checkedAt: "2026-11-20T00:00:00Z", inAiOverview: true }),
          google_maps: rank({ position: null, checkedAt: "2026-11-21T00:00:00Z", localPack: 2 }),
          bing: null,
        },
        weak: ["a", "b"],
        scan: { verdict: "quick_win", reasons: [], position: 14, clicks: 3 },
      }),
    ],
    ["google", "google_maps"],
    "AU",
  )
  const [head, row] = lines(csv)
  assert.ok(head.includes("Google position,Google change since last check,Google first position,Google page,In AI Overview"))
  assert.ok(head.includes("Google Maps position") && head.includes("Map pack position"))
  assert.ok(!head.includes("Bing"), "only the engines the client tracks")
  assert.ok(head.includes("AU searches / month"))
  assert.ok(row.startsWith("plumber sydney,plumbing,71,a; b,Quick win,4,3,12,https://x.com/a,Yes,Not in the top 20,,,,2,"))
  assert.ok(row.includes(",90,1600,42 Medium,Buying,12.35,2026-11-21,2026-10-01,Find better keywords"))
})

ok("ranking now + lost", () => {
  const csv = scanCsv(
    [
      {
        keyword_norm: 'plumber, "best"',
        phrase: 'plumber, "best"',
        sources: ["dataforseo", "search_console"],
        verdict: "keep",
        reasons: ["a", "b"],
        position: 3.04,
        prev_position: 5,
        is_new: false,
        tracked_id: null,
        gsc_ctr: 0.1234,
        intent: "commercial",
        difficulty: 10,
      },
    ],
    "CA",
  )
  const [head, row] = lines(csv)
  assert.ok(head.includes("CA searches / month"))
  assert.ok(row.startsWith('"plumber, ""best""",DataForSEO + Search Console,Keep,3,2,No,No,No,'))
  assert.ok(row.includes("12.3%") && row.includes("10 Easy,Comparing") && row.endsWith("a; b"))
  const whole = scanCsv([{ keyword_norm: "x", phrase: "x", sources: ["dataforseo"] }])
  assert.equal(lines(whole)[1].split(",")[5], "", "no New column value outside the filtered read")
  const lost = lines(lostCsv([{ keyword_norm: "y", phrase: "y", verdict: "quick_win", position: 12.26, sources: ["search_console"], gsc_clicks: 4 }]))
  assert.equal(lost[1], "y,Quick win,12.3,Search Console,4")
})

const cand = (p: Partial<Candidate>): Candidate => ({
  client_id: "c",
  competition: null,
  competitor_domains: [],
  core_keyword: null,
  cpc: 1.5,
  decided_at: null,
  decided_by: null,
  difficulty: 70,
  dismiss_reason: null,
  first_seen_run: null,
  intent: "informational",
  keyword_norm: "gold stocks asx",
  last_seen_run: null,
  local_volume: null,
  national_volume: 880,
  phrase: "gold stocks asx",
  ranked_position: null,
  ranked_url: null,
  score: 55,
  score_parts: {},
  sources: ["ideas", "suggestions"],
  status: "new",
  topic: "mining",
  trend_yearly: -12,
  updated_at: "2026-11-27T00:00:00Z",
  ...p,
})

ok("keyword ideas + dismissed", () => {
  const [head, row] = lines(candidatesCsv([cand({})], "AU", new Set(["gold stocks asx"])))
  assert.ok(head.includes("AU searches / month") && !head.includes("Dismiss reason"))
  assert.equal(row, "gold stocks asx,55,mining,,880,70 Hard,Researching,1.5,-12,,,Ideas + Suggestions,Tracked,")
  const d = lines(candidatesCsv([cand({ status: "dismissed", dismiss_reason: "Not relevant", decided_at: "2026-11-02T09:00:00Z" })], null, new Set(["gold stocks asx"]), true))
  assert.ok(d[0].endsWith("Dismiss reason,Dismissed on"))
  assert.ok(d[1].endsWith(",Dismissed,,Not relevant,2026-11-02"))
})

ok("candidate filter = the old Research rule", () => {
  // The rule research-view.tsx had inline before it moved to candidate-filter.ts.
  const old = (c: Candidate, f: CandidateFilters) => {
    const q = f.q.trim().toLowerCase()
    const min = Number(f.min)
    if (q && !c.phrase.includes(q)) return false
    if (min > 0 && (c.local_volume ?? c.national_volume ?? 0) < min) return false
    if (f.intent !== "any" && c.intent !== f.intent) return false
    if (f.topic !== "any" && c.topic !== f.topic) return false
    if (f.source !== "any") {
      const s = f.source === "ideas" ? ["ideas", "suggestions", "related"] : [f.source]
      if (!c.sources.some((x) => s.includes(x))) return false
    }
    return true
  }
  const cs = [
    cand({}),
    cand({ phrase: "lithium shares", keyword_norm: "lithium shares", local_volume: 40, intent: "commercial", topic: null, sources: ["ranked"] }),
    cand({ phrase: "mining news", keyword_norm: "mining news", national_volume: null, sources: ["search_console", "competitor"] }),
  ]
  let combos = 0
  for (const q of ["", "  GOLD ", "shares"])
    for (const min of ["0", "10", "50", "500"])
      for (const intent of ["any", "informational", "commercial"])
        for (const topic of ["any", "mining"])
          for (const source of ["any", "ideas", "ranked", "search_console", "competitor"]) {
            const f = { q, min, intent, topic, source }
            for (const c of cs) assert.equal(matchesCandidate(c, f), old(c, f), JSON.stringify(f))
            combos++
          }
  assert.equal(isFiltered(DEFAULT_CANDIDATE_FILTERS), false)
  assert.equal(isFiltered({ ...DEFAULT_CANDIDATE_FILTERS, q: " x " }), true)
  assert.ok(combos > 300)
})

console.log(`${n} groups pass`)
