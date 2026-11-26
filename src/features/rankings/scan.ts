import "server-only"

import { adsSearchVolume, labs } from "@/lib/dataforseo/api"
import { DfsError, type Db } from "@/lib/dataforseo/client"
import { hasDataForSeo, hasZernioApiKey } from "@/lib/env.server"
import { countryName } from "@/lib/format"
import { iso3 } from "@/lib/iso3"
import type { Json, Tables, TablesInsert } from "@/lib/supabase/database.types"
import { gbpSearchKeywords, gscSearchAnalytics } from "@/lib/zernio/analytics"
import { ZernioError } from "@/lib/zernio/client"
import { intentOf } from "./constants"
import {
  aggregateGbp,
  aggregateGsc,
  brandTermsFor,
  dfsDate,
  dfsRows,
  gbpMonths,
  gscWindow,
  type ScanRow,
  type ScanSource,
} from "./scan-sources"
import { judge, type Verdict } from "./scan-verdicts"
import { ensureRankSettings, syncAndResolve } from "./setup"

/**
 * The "Ranking now" scan (docs/plans/ranking-scan/06-pipeline.md): what the client's site
 * already ranks for, from DataForSEO, Search Console and Google Business Profile. One scan per
 * client at a time, claimed by dfs_claim_rank_scan(); each source is stored as soon as it's read
 * and marked done, so a resumed scan never pays DataForSEO twice.
 */

type Scan = Tables<"rank_scans">
type State = "done" | "no_data" | "not_connected" | "skipped" | "failed"
export type SourceState = {
  state: State
  count?: number
  error?: string
  data_date?: string | null
  from?: string
  to?: string
  site?: string | null
}
export type ScanSources = Partial<Record<ScanSource, SourceState>>

const FINAL: State[] = ["done", "no_data", "not_connected", "skipped"]
const CACHE_DAYS = 35
const PAID_LOOKUPS = 500

async function overBudget(db: Db): Promise<boolean> {
  const { data } = await db.rpc("dfs_budget_status")
  return Boolean((data as { over_budget?: boolean } | null)?.over_budget)
}

/** Claims and runs queued scans (or resumes a stalled one). */
export async function processRankScans(db: Db, max = 1): Promise<number> {
  let done = 0
  for (let i = 0; i < max; i++) {
    const { data, error } = await db.rpc("dfs_claim_rank_scan")
    if (error) throw new Error(`Could not claim a ranking scan: ${error.message}`)
    const scan = (data as Scan[] | null)?.[0]
    if (!scan) break
    await runScan(db, scan)
    done++
  }
  return done
}

function zernioReason(e: unknown): string {
  if (e instanceof ZernioError) {
    if (e.status === 402) return e.code === "analytics_addon_required" || /analytics/i.test(e.message)
      ? "Turn on Zernio's Analytics add-on to read this."
      : "Zernio needs a payment method or a higher plan for this."
    if (e.status === 403) return "The connection needs reconnecting in Connections."
    if (e.status === 429) return "Zernio is busy right now. The next scan tries again."
    if (e.status === 404) return "Zernio doesn't have this account any more. Reconnect it in Connections."
    if (e.status === 0 || e.status >= 500) return "Zernio or Google didn't answer. The next scan tries again."
    return e.message.slice(0, 300)
  }
  return e instanceof Error ? e.message.slice(0, 300) : "Something went wrong."
}

function dfsReason(e: unknown): string {
  if (e instanceof DfsError) {
    if (e.kind === "funds") return "The DataForSEO balance is empty."
    if (e.kind === "auth") return "DataForSEO rejected the login."
    if (e.kind === "rate") return "DataForSEO is busy right now. The next scan tries again."
    return e.message.slice(0, 300)
  }
  return e instanceof Error ? e.message.slice(0, 300) : "Something went wrong."
}

async function storeRows(db: Db, scanId: string, rows: ScanRow[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.rpc("store_rank_scan_rows", { p_scan_id: scanId, p_rows: rows.slice(i, i + 500) as unknown as Json })
    if (error) throw new Error(`Could not save the scan's keywords: ${error.message}`)
  }
}

export async function runScan(db: Db, scan: Scan): Promise<void> {
  const sources: ScanSources = { ...((scan.sources ?? {}) as ScanSources) }
  const counts: Record<string, unknown> = { ...((scan.counts ?? {}) as Record<string, unknown>) }
  const beat = (step: number) =>
    db
      .from("rank_scans")
      .update({ step, sources: sources as unknown as Json, counts: counts as Json, heartbeat_at: new Date().toISOString() })
      .eq("id", scan.id)
  const finalDone = (s: ScanSource) => FINAL.includes(sources[s]?.state as State)
  const call = { clientId: scan.client_id, ref: scan.id }

  try {
    // 0. Context
    let ctx = await ensureRankSettings(db, scan.client_id)
    if (ctx.needsLocationSync && hasDataForSeo()) {
      await syncAndResolve(db, scan.client_id, ctx.countryIso).catch(() => null)
      ctx = await ensureRankSettings(db, scan.client_id)
    }
    const s = ctx.settings
    const { data: accounts } = await db
      .from("social_accounts")
      .select("id, zernio_account_id, platform, username, display_name, connected_at")
      .eq("client_id", scan.client_id)
      .eq("status", "connected")
      .in("platform", ["googlesearchconsole", "googlebusiness"])
      .order("connected_at", { ascending: false })
    const gscAccounts = (accounts ?? []).filter((a) => a.platform === "googlesearchconsole")
    const gbpAccounts = (accounts ?? []).filter((a) => a.platform === "googlebusiness")
    const host = ctx.domain?.replace(/^www\./, "") ?? null
    const gsc =
      gscAccounts.find((a) => a.id === s.gsc_account_id) ??
      gscAccounts.find((a) => host && `${a.username ?? ""} ${a.display_name ?? ""}`.toLowerCase().includes(host)) ??
      gscAccounts[0] ??
      null
    const window = gscWindow()
    const months = gbpMonths()
    await db
      .from("rank_scans")
      .update({
        params: {
          domain: ctx.domain,
          country: ctx.countryIso,
          country_location_code: s.country_location_code,
          language: s.language_code,
          gsc_site: gsc ? (gsc.username ?? gsc.display_name) : null,
          gsc_from: window.fromDate,
          gsc_to: window.toDate,
          gbp_from: months.startMonth,
          gbp_to: months.endMonth,
        } as Json,
      })
      .eq("id", scan.id)

    // 1. DataForSEO (national, from Labs)
    if (!finalDone("dataforseo")) {
      if (!ctx.domain) sources.dataforseo = { state: "skipped", error: "The client has no website yet." }
      else if (!hasDataForSeo()) sources.dataforseo = { state: "skipped", error: "DataForSEO isn't connected." }
      else if (s.country_location_code === null) sources.dataforseo = { state: "skipped", error: "The client's country isn't in DataForSEO." }
      else if (await overBudget(db)) sources.dataforseo = { state: "skipped", error: "This month's DataForSEO budget is used up." }
      else {
        try {
          sources.dataforseo = await readDataForSeo(db, scan.id, ctx.domain, s.country_location_code, s.language_code, call)
        } catch (e) {
          console.error("[rankings] scan: DataForSEO failed", scan.id, e)
          sources.dataforseo = { state: "failed", error: dfsReason(e) }
        }
      }
      await beat(1)
    }

    // 2. Search Console (through Zernio)
    if (!finalDone("search_console")) {
      if (!gsc) sources.search_console = { state: "not_connected" }
      else if (!hasZernioApiKey()) sources.search_console = { state: "skipped", error: "Zernio isn't set up." }
      else {
        try {
          const country = s.gsc_country_only ? iso3(ctx.countryIso) : null
          const res = await gscSearchAnalytics({
            accountId: gsc.zernio_account_id,
            fromDate: window.fromDate,
            toDate: window.toDate,
            dimensions: ["query", "page"],
            filters: country ? [{ dimension: "country", operator: "equals", expression: country }] : [],
            maxRows: 50_000,
          })
          const rows = aggregateGsc(res.rows)
          await storeRows(db, scan.id, rows)
          sources.search_console = {
            state: rows.length ? "done" : "no_data",
            count: rows.length,
            from: window.fromDate,
            to: window.toDate,
            site: res.siteUrl ?? gsc.username ?? gsc.display_name,
          }
        } catch (e) {
          console.error("[rankings] scan: Search Console failed", scan.id, e)
          sources.search_console = { state: "failed", error: zernioReason(e) }
        }
      }
      await beat(2)
    }

    // 3. Google Business Profile search keywords (through Zernio)
    if (!finalDone("google_business")) {
      if (!gbpAccounts.length) sources.google_business = { state: "not_connected" }
      else if (!hasZernioApiKey()) sources.google_business = { state: "skipped", error: "Zernio isn't set up." }
      else {
        try {
          const all = []
          for (const a of gbpAccounts.slice(0, 10)) {
            all.push(...(await gbpSearchKeywords({ accountId: a.zernio_account_id, startMonth: months.startMonth, endMonth: months.endMonth })))
          }
          const rows = aggregateGbp(all, months.months)
          await storeRows(db, scan.id, rows)
          sources.google_business = { state: rows.length ? "done" : "no_data", count: rows.length, from: months.startMonth, to: months.endMonth }
        } catch (e) {
          console.error("[rankings] scan: Business Profile failed", scan.id, e)
          sources.google_business = { state: "failed", error: zernioReason(e) }
        }
      }
      await beat(3)
    }

    // 4. Fill the gaps, judge, count
    const rows = await loadRows(db, scan.id)
    await fillMetrics(db, rows, s, call)
    const judgeCtx = {
      topics: s.topic_terms,
      negatives: s.negative_terms,
      brandTerms: brandTermsFor(ctx.name, ctx.domain, s.brand_terms),
      city: ctx.city,
      country: countryName(ctx.countryIso),
    }
    const tally: Record<Verdict, number> = { keep: 0, quick_win: 0, brand: 0, watch: 0, skip: 0 }
    const judged: ScanRow[] = rows.map((r) => {
      const j = judge(r, judgeCtx)
      tally[j.verdict]++
      return {
        keyword_norm: r.keyword_norm,
        phrase: r.phrase,
        sources: [],
        verdict: j.verdict,
        reasons: j.reasons,
        score: j.score,
        position: j.position,
        is_brand: j.isBrand,
        low_ctr: j.lowCtr,
        topic: j.topic,
        city_volume: r.city_volume ?? null,
        national_volume: r.national_volume ?? null,
        intent: r.intent ?? null,
        difficulty: r.difficulty ?? null,
        cpc: r.cpc ?? null,
      }
    })
    await storeRows(db, scan.id, judged)

    const { data: prevId } = await db.rpc("rank_scan_previous", { p_client_id: scan.client_id, p_scan_id: scan.id })
    let fresh = 0
    let lost = 0
    if (prevId) {
      const prev = await loadRows(db, prevId as string)
      const now = new Set(rows.map((r) => r.keyword_norm))
      const before = new Set(prev.map((r) => r.keyword_norm))
      fresh = rows.filter((r) => !before.has(r.keyword_norm)).length
      lost = prev.filter((r) => (r.verdict === "keep" || r.verdict === "quick_win") && !now.has(r.keyword_norm)).length
    }
    const bySource: Record<string, number> = {}
    for (const r of rows) for (const src of r.sources) bySource[src] = (bySource[src] ?? 0) + 1
    Object.assign(counts, {
      total: rows.length,
      ...tally,
      low_ctr: judged.filter((r) => r.low_ctr).length,
      page_one: judged.filter((r) => r.position !== null && r.position !== undefined && r.position <= 10 && r.verdict !== "skip").length,
      new: prevId ? fresh : null,
      lost: prevId ? lost : null,
      by_source: bySource,
    })
    await beat(4)

    // 5. Finish
    const states = Object.values(sources).map((x) => x?.state)
    const anyRead = states.some((st) => st === "done" || st === "no_data")
    const anyFailed = states.includes("failed")
    const status = !anyRead ? "failed" : anyFailed ? "partial" : "done"
    const error = !anyRead
      ? Object.values(sources).map((x) => x?.error).filter(Boolean)[0] ??
        "No source could be read. Add the website, or connect Search Console or Google Business Profile."
      : null
    const { error: finishError } = await db.rpc("finish_rank_scan", {
      p_scan_id: scan.id,
      p: { status, sources, counts, error } as unknown as Json,
    })
    if (finishError) throw new Error(finishError.message)
  } catch (e) {
    console.error("[rankings] scan failed", scan.id, e)
    await db.rpc("finish_rank_scan", {
      p_scan_id: scan.id,
      p: { status: "failed", sources, counts, error: e instanceof Error ? e.message.slice(0, 400) : "The scan failed." } as unknown as Json,
    })
  }
}

/** domain_rank_overview first (cheap); ranked_keywords only when the site has rankings. */
async function readDataForSeo(
  db: Db,
  scanId: string,
  domain: string,
  location: number,
  language: string,
  call: { clientId: string; ref: string },
): Promise<SourceState> {
  const ask = async <R>(fn: "domain_rank_overview" | "ranked_keywords", body: Record<string, unknown>): Promise<R | null> => {
    try {
      return await labs<R>(db, fn, { ...body, language_code: language }, call)
    } catch (e) {
      // 40102: no results. An unsupported language for the country: try once without it.
      if (e instanceof DfsError && e.code === 40102) return null
      if (e instanceof DfsError && e.kind === "input" && /language/i.test(e.message)) {
        try {
          return await labs<R>(db, fn, body, call)
        } catch (e2) {
          if (e2 instanceof DfsError && e2.code === 40102) return null
          throw e2
        }
      }
      throw e
    }
  }

  type Overview = { items?: { metrics?: Record<string, { count?: number } | undefined> }[] }
  const overview = await ask<Overview>("domain_rank_overview", { target: domain, location_code: location, limit: 1 })
  const m = overview?.items?.[0]?.metrics ?? {}
  const total = (m.organic?.count ?? 0) + (m.local_pack?.count ?? 0) + (m.featured_snippet?.count ?? 0)
  if (total === 0) return { state: "no_data", count: 0 }

  type Ranked = { total_count?: number; items?: Record<string, unknown>[] | null }
  const body = {
    target: domain,
    location_code: location,
    item_types: ["organic", "local_pack", "featured_snippet"],
    historical_serp_mode: "live",
    order_by: ["ranked_serp_element.serp_item.rank_group,asc", "keyword_data.keyword,asc"],
    limit: 1000,
  }
  const first = await ask<Ranked>("ranked_keywords", { ...body, offset: 0 })
  const items = [...(first?.items ?? [])]
  if ((first?.total_count ?? 0) > 1000 && !(await overBudget(db))) {
    const second = await ask<Ranked>("ranked_keywords", { ...body, offset: 1000 })
    items.push(...(second?.items ?? []))
  }
  const rows = dfsRows(items).map((r) => ({ ...r, dfs_updated_at: dfsDate(r.dfs_updated_at) }))
  await storeRows(db, scanId, rows)
  const newest = rows.map((r) => r.dfs_updated_at).filter((d): d is string => Boolean(d)).sort().at(-1) ?? null
  return { state: rows.length ? "done" : "no_data", count: rows.length, data_date: newest }
}

async function loadRows(db: Db, scanId: string): Promise<ScanRow[]> {
  const out: ScanRow[] = []
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await db
      .from("rank_scan_keywords")
      .select("*")
      .eq("scan_id", scanId)
      .order("keyword_norm")
      .range(from, from + 999)
    if (error) throw new Error(`Could not read the scan: ${error.message}`)
    for (const r of data ?? []) {
      out.push({
        ...(r as unknown as ScanRow),
        intent: intentOf(r.intent),
        gsc_ctr: r.gsc_ctr === null ? null : Number(r.gsc_ctr),
        gsc_position: r.gsc_position === null ? null : Number(r.gsc_position),
        position: r.position === null ? null : Number(r.position),
        dfs_etv: r.dfs_etv === null ? null : Number(r.dfs_etv),
        cpc: r.cpc === null ? null : Number(r.cpc),
      })
    }
    if (!data || data.length < 1000) break
  }
  return out
}

/** City and national metrics from the shared cache, then capped paid look-ups for the rest. */
async function fillMetrics(
  db: Db,
  rows: ScanRow[],
  s: Tables<"rank_settings">,
  call: { clientId: string; ref: string },
) {
  if (!rows.length) return
  const lang = s.language_code
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString()
  const byNorm = new Map(rows.map((r) => [r.keyword_norm, r]))
  const norms = rows.map((r) => r.keyword_norm)
  const demand = (r: ScanRow) => (r.gsc_impressions ?? 0) + (r.gbp_reach ?? 0) * 3 + (r.dfs_volume ?? 0)

  for (let i = 0; i < norms.length; i += 300) {
    const chunk = norms.slice(i, i + 300)
    const { data } = await db
      .from("keyword_metrics")
      .select("keyword_norm, source, location_code, search_volume, keyword_difficulty, main_intent, cpc, fetched_at")
      .in("keyword_norm", chunk)
      .eq("language_code", lang)
    for (const m of data ?? []) {
      const r = byNorm.get(m.keyword_norm)
      if (!r) continue
      if (m.source === "google_ads" && m.location_code === s.location_code && m.fetched_at >= since) {
        r.city_volume ??= m.search_volume
        r.cpc ??= m.cpc === null ? null : Number(m.cpc)
      }
      if (m.source === "labs" && m.location_code === s.country_location_code) {
        r.national_volume ??= m.search_volume
        r.difficulty ??= m.keyword_difficulty
        r.intent ??= intentOf(m.main_intent)
      }
    }
  }

  if (!hasDataForSeo() || (await overBudget(db))) return

  // City volumes (Google Ads), most searched first.
  if (s.location_code !== null) {
    const missing = rows.filter((r) => r.city_volume === null || r.city_volume === undefined).sort((a, b) => demand(b) - demand(a)).slice(0, PAID_LOOKUPS)
    if (missing.length) {
      try {
        const found = await adsSearchVolume(db, missing.map((r) => r.keyword_norm), s.location_code, lang, call)
        const now = new Date().toISOString()
        const metrics: TablesInsert<"keyword_metrics">[] = []
        const seen = new Set<string>()
        for (const f of found) {
          const k = f.keyword.trim().toLowerCase().replace(/\s+/g, " ")
          const r = byNorm.get(k)
          if (!r) continue
          r.city_volume = f.search_volume ?? 0
          r.cpc ??= f.cpc
          seen.add(k)
          metrics.push({
            keyword_norm: k, location_code: s.location_code, language_code: lang, source: "google_ads",
            search_volume: f.search_volume, monthly_searches: (f.monthly_searches ?? null) as Json, cpc: f.cpc,
            competition: f.competition_index !== null ? Math.min(1, Math.max(0, f.competition_index / 100)) : null,
            competition_level: f.competition && ["LOW", "MEDIUM", "HIGH"].includes(f.competition) ? f.competition : null,
            fetched_at: now,
          })
        }
        for (const r of missing) {
          if (seen.has(r.keyword_norm)) continue
          r.city_volume = 0
          metrics.push({ keyword_norm: r.keyword_norm, location_code: s.location_code, language_code: lang, source: "google_ads", search_volume: 0, fetched_at: now })
        }
        for (let i = 0; i < metrics.length; i += 500) await db.from("keyword_metrics").upsert(metrics.slice(i, i + 500))
      } catch (e) {
        console.error("[rankings] scan: city volumes failed", call.ref, e)
      }
    }
  }

  // Intent (Labs), for keywords that still have none.
  if (s.country_location_code !== null && !(await overBudget(db))) {
    const missing = rows.filter((r) => !r.intent).sort((a, b) => demand(b) - demand(a)).slice(0, PAID_LOOKUPS)
    if (missing.length) {
      try {
        type IntentAnswer = { items?: { keyword?: string; keyword_intent?: { label?: string } | null }[] | null }
        const res = await labs<IntentAnswer>(db, "search_intent", { keywords: missing.map((r) => r.keyword_norm), language_code: lang }, call).catch(
          async (e) => {
            if (e instanceof DfsError && e.kind === "input") {
              return labs<IntentAnswer>(db, "search_intent", { keywords: missing.map((r) => r.keyword_norm) }, call)
            }
            throw e
          },
        )
        const now = new Date().toISOString()
        const metrics: TablesInsert<"keyword_metrics">[] = []
        for (const it of res?.items ?? []) {
          const k = (it.keyword ?? "").trim().toLowerCase().replace(/\s+/g, " ")
          const r = byNorm.get(k)
          const intent = intentOf(it.keyword_intent?.label)
          if (!r || !intent) continue
          r.intent = intent
          metrics.push({ keyword_norm: k, location_code: s.country_location_code, language_code: lang, source: "labs", main_intent: intent, fetched_at: now })
        }
        for (let i = 0; i < metrics.length; i += 500) await db.from("keyword_metrics").upsert(metrics.slice(i, i + 500))
      } catch (e) {
        console.error("[rankings] scan: intent failed", call.ref, e)
      }
    }
  }
}
