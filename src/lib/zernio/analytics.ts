import "server-only"

import { z } from "zod"

import { request } from "./client"

/**
 * Zernio analytics for the Rankings "Ranking now" scan (docs/plans/ranking-scan/02-sources.md):
 * Google Search Console search analytics and Google Business Profile search keywords. Parsed
 * loosely; field names confirmed in the phase 0 check.
 */

const n = z.union([z.number(), z.string()]).nullish().transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
const optStr = z.string().nullish()

const zGscRow = z.looseObject({
  keys: z.array(z.union([z.string(), z.number()])).nullish(),
  clicks: n,
  impressions: n,
  ctr: n,
  position: n,
})
const zGscAnswer = z.looseObject({
  data: z.array(zGscRow).nullish(),
  rows: z.array(zGscRow).nullish(),
  pagination: z.looseObject({ hasMore: z.boolean().nullish(), nextStartRow: n }).nullish(),
  meta: z
    .looseObject({ siteUrl: optStr, fromDate: optStr, toDate: optStr, firstIncompleteDate: optStr })
    .nullish(),
})

export type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }
export type GscFilter = { dimension: string; operator: string; expression: string }

/**
 * Search analytics rows for one connected site, following `nextStartRow` up to `maxRows`.
 * Dates are YYYY-MM-DD (Pacific time, inclusive).
 */
export async function gscSearchAnalytics(input: {
  accountId: string
  fromDate: string
  toDate: string
  dimensions: string[]
  filters?: GscFilter[]
  maxRows?: number
}): Promise<{ rows: GscRow[]; siteUrl: string | null; firstIncompleteDate: string | null }> {
  const max = input.maxRows ?? 50_000
  const rows: GscRow[] = []
  let startRow = 0
  let siteUrl: string | null = null
  let firstIncompleteDate: string | null = null
  for (let page = 0; page < 10 && rows.length < max; page++) {
    const answer = await request("POST", "/analytics/googlesearchconsole/search-analytics", zGscAnswer, {
      body: {
        accountId: input.accountId,
        fromDate: input.fromDate,
        toDate: input.toDate,
        dimensions: input.dimensions,
        type: "web",
        dataState: "final",
        rowLimit: Math.min(25_000, max - rows.length),
        startRow,
        ...(input.filters?.length ? { dimensionFilterGroups: [{ groupType: "and", filters: input.filters }] } : {}),
      },
      timeoutMs: 60_000,
    })
    siteUrl ??= answer.meta?.siteUrl ?? null
    firstIncompleteDate ??= answer.meta?.firstIncompleteDate ?? null
    const batch = answer.data ?? answer.rows ?? []
    for (const r of batch) {
      rows.push({
        keys: (r.keys ?? []).map(String),
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0,
      })
    }
    const more = answer.pagination?.hasMore === true
    if (!batch.length || !more) break
    startRow = answer.pagination?.nextStartRow ?? startRow + batch.length
  }
  return { rows, siteUrl, firstIncompleteDate }
}

const zKeyword = z.looseObject({
  keyword: optStr,
  searchKeyword: optStr,
  impressions: n,
  impressionsThreshold: n,
  value: n,
  threshold: n,
})
const zGbpAnswer = z.looseObject({
  keywords: z.array(zKeyword).nullish(),
  searchKeywordsCounts: z.array(zKeyword).nullish(),
  nextPageToken: optStr,
  pagination: z.looseObject({ nextPageToken: optStr, pageToken: optStr }).nullish(),
})

export type GbpKeyword = { keyword: string; impressions: number; belowThreshold: boolean }

/** Searches that showed a Google Business Profile listing, between two months (YYYY-MM). */
export async function gbpSearchKeywords(input: {
  accountId: string
  startMonth: string
  endMonth: string
  maxPages?: number
}): Promise<GbpKeyword[]> {
  const out: GbpKeyword[] = []
  let pageToken: string | null = null
  for (let page = 0; page < (input.maxPages ?? 20); page++) {
    const answer: z.infer<typeof zGbpAnswer> = await request("GET", "/analytics/googlebusiness/search-keywords", zGbpAnswer, {
      query: { accountId: input.accountId, startMonth: input.startMonth, endMonth: input.endMonth, pageToken },
      timeoutMs: 30_000,
    })
    for (const k of answer.keywords ?? answer.searchKeywordsCounts ?? []) {
      const keyword = (k.keyword ?? k.searchKeyword ?? "").trim()
      if (!keyword) continue
      const impressions = k.impressions ?? k.value ?? 0
      const threshold = k.impressionsThreshold ?? k.threshold ?? null
      out.push({ keyword, impressions, belowThreshold: impressions === 0 && threshold !== null })
    }
    pageToken = answer.nextPageToken ?? answer.pagination?.nextPageToken ?? null
    if (!pageToken) break
  }
  return out
}
