import "server-only"

import { adsSearchVolume, labsItems } from "@/lib/dataforseo/api"
import { DfsError, type Db } from "@/lib/dataforseo/client"
import { normalizeHost } from "@/lib/dataforseo/domains"
import type { Json, Tables, TablesInsert } from "@/lib/supabase/database.types"
import { intentOf, type Intent } from "./constants"
import { hasNegative, scoreKeyword, topicOf } from "./scoring"
import { ensureRankSettings, syncAndResolve } from "./setup"

/**
 * "Find better keywords" (docs/plans/rankings/03-keyword-research.md).
 * One run per client at a time, claimed by public.dfs_claim_research_run(); each step
 * bumps the heartbeat so cron can resume a run whose worker died (3 attempts max).
 */

type ResearchRun = Tables<"keyword_research_runs">
type Rec = Record<string, unknown>

const LOCAL_CACHE_DAYS = 35
const MAX_CANDIDATES = 500
/** Directories and big sites that "compete" for everything but aren't real competitors. */
const NOT_COMPETITORS = [
  "yelp.com", "angi.com", "angieslist.com", "homeadvisor.com", "thumbtack.com", "bbb.org",
  "facebook.com", "nextdoor.com", "houzz.com", "yellowpages.com", "mapquest.com", "porch.com",
  "bark.com", "reddit.com", "amazon.com", "wikipedia.org", "youtube.com", "google.com",
  "linkedin.com", "instagram.com", "pinterest.com", "x.com", "twitter.com", "quora.com",
  "tripadvisor.com", "indeed.com", "glassdoor.com", "homedepot.com", "lowes.com", "networx.com",
  "expertise.com", "manta.com", "superpages.com", "chamberofcommerce.com", "nerdwallet.com",
]

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
const str = (v: unknown) => (typeof v === "string" && v ? v : null)
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {})
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

type Cand = {
  norm: string
  phrase: string
  sources: Set<string>
  competitors: Set<string>
  nationalVolume: number | null
  cpc: number | null
  competition: number | null
  competitionLevel: string | null
  difficulty: number | null
  intent: Intent | null
  coreKeyword: string | null
  trendYearly: number | null
  monthly: Json | null
  otherLanguage: boolean
  rankedPosition: number | null
  rankedUrl: string | null
}

/** One Labs item (flat for ideas/suggestions, nested under keyword_data for ranked/related). */
function readLabsItem(item: Rec) {
  const kd = item.keyword_data ? rec(item.keyword_data) : item
  const info = rec(kd.keyword_info)
  const props = rec(kd.keyword_properties)
  const intent = rec(kd.search_intent_info)
  const serp = rec(rec(item.ranked_serp_element).serp_item)
  const keyword = str(kd.keyword)
  return {
    keyword,
    volume: num(info.search_volume),
    cpc: num(info.cpc),
    competition: num(info.competition),
    competitionLevel: str(info.competition_level),
    monthly: Array.isArray(info.monthly_searches) ? (info.monthly_searches as Json) : null,
    trendYearly: num(rec(info.search_volume_trend).yearly),
    difficulty: num(props.keyword_difficulty) ?? num(item.keyword_difficulty),
    coreKeyword: str(props.core_keyword),
    otherLanguage: props.is_another_language === true,
    intent: intentOf(str(intent.main_intent)),
    position: num(serp.rank_group),
    url: str(serp.url),
  }
}

class Pool {
  readonly map = new Map<string, Cand>()
  add(item: Rec, source: string, competitor?: string) {
    const r = readLabsItem(item)
    if (!r.keyword) return
    const key = norm(r.keyword)
    if (!key || key.length > 80 || key.split(" ").length > 10) return
    const c =
      this.map.get(key) ??
      ({
        norm: key,
        phrase: key,
        sources: new Set(),
        competitors: new Set(),
        nationalVolume: null,
        cpc: null,
        competition: null,
        competitionLevel: null,
        difficulty: null,
        intent: null,
        coreKeyword: null,
        trendYearly: null,
        monthly: null,
        otherLanguage: false,
        rankedPosition: null,
        rankedUrl: null,
      } satisfies Cand)
    c.sources.add(source)
    if (competitor) c.competitors.add(competitor)
    c.nationalVolume ??= r.volume
    c.cpc ??= r.cpc
    c.competition ??= r.competition !== null ? Math.min(1, Math.max(0, r.competition)) : null
    c.competitionLevel ??= r.competitionLevel
    c.difficulty ??= r.difficulty
    c.intent ??= r.intent
    c.coreKeyword ??= r.coreKeyword
    c.trendYearly ??= r.trendYearly
    c.monthly ??= r.monthly
    c.otherLanguage ||= r.otherLanguage
    if ((source === "ranked" || source === "search_console" || source === "google_business") && r.position !== null) {
      c.rankedPosition = c.rankedPosition === null ? r.position : Math.min(c.rankedPosition, r.position)
      c.rankedUrl ??= r.url
    }
    this.map.set(key, c)
  }
}

/**
 * Keywords of the client's latest ranking scan if it is under 14 days old and DataForSEO was read,
 * as Labs-shaped items for the pool. Sources: "ranked" (DataForSEO), "search_console",
 * "google_business".
 */
async function keywordsFromRecentScan(db: Db, clientId: string): Promise<{ item: Rec; source: string }[] | null> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const { data: scan } = await db
    .from("rank_scans")
    .select("id, sources")
    .eq("client_id", clientId)
    .in("status", ["done", "partial"])
    .gte("finished_at", since)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const dfs = (scan?.sources as Record<string, { state?: string }> | null)?.dataforseo?.state
  if (!scan || (dfs !== "done" && dfs !== "no_data")) return null
  const out: { item: Rec; source: string }[] = []
  for (let from = 0; from < 10_000; from += 1000) {
    const { data } = await db
      .from("rank_scan_keywords")
      .select("keyword_norm, sources, verdict, position, dfs_position, dfs_url, gsc_page, national_volume, cpc, difficulty, intent")
      .eq("scan_id", scan.id)
      .neq("verdict", "skip")
      .range(from, from + 999)
    for (const r of data ?? []) {
      const item: Rec = {
        keyword_data: {
          keyword: r.keyword_norm,
          keyword_info: { search_volume: r.national_volume, cpc: r.cpc === null ? null : Number(r.cpc) },
          keyword_properties: { keyword_difficulty: r.difficulty },
          search_intent_info: { main_intent: r.intent },
        },
        ranked_serp_element: {
          serp_item: {
            rank_group: r.dfs_position ?? (r.position === null ? null : Math.round(Number(r.position))),
            url: r.dfs_url ?? r.gsc_page,
          },
        },
      }
      const src = r.sources.includes("dataforseo") ? "ranked" : r.sources.includes("search_console") ? "search_console" : "google_business"
      out.push({ item, source: src })
    }
    if (!data || data.length < 1000) break
  }
  return out
}

async function heartbeat(db: Db, runId: string, step: number, counts: Rec) {
  await db
    .from("keyword_research_runs")
    .update({ step, counts: counts as Json, heartbeat_at: new Date().toISOString() })
    .eq("id", runId)
}

async function overBudget(db: Db): Promise<boolean> {
  const { data } = await db.rpc("dfs_budget_status")
  return Boolean((data as { over_budget?: boolean } | null)?.over_budget)
}

/** Claims and runs queued research runs (or resumes a stalled one). */
export async function processResearchRuns(db: Db, max = 2): Promise<number> {
  let done = 0
  for (let i = 0; i < max; i++) {
    const { data, error } = await db.rpc("dfs_claim_research_run")
    if (error) throw new Error(`Could not claim a research run: ${error.message}`)
    const run = (data as ResearchRun[] | null)?.[0]
    if (!run) break
    await runResearch(db, run)
    done++
  }
  return done
}

export async function runResearch(db: Db, run: ResearchRun): Promise<void> {
  const counts: Rec = {}
  try {
    let ctx = await ensureRankSettings(db, run.client_id)
    if (ctx.needsLocationSync) {
      await syncAndResolve(db, run.client_id, ctx.countryIso)
      ctx = await ensureRankSettings(db, run.client_id)
    }
    const s = ctx.settings
    if (!ctx.domain) throw new Error("Add the client's website first (Edit details on the Overview).")
    if (s.country_location_code === null) throw new Error("The client's country isn't available in DataForSEO.")

    const country = s.country_location_code
    const lang = s.language_code
    const call = { clientId: run.client_id, ref: run.id }
    const topics = s.topic_terms
    const cityName = (ctx.city ?? "").trim().toLowerCase()
    const pool = new Pool()

    const { data: tracked } = await db
      .from("keywords")
      .select("id, phrase")
      .eq("client_id", run.client_id)
      .is("archived_at", null)
      .eq("tracked", true)

    await db
      .from("keyword_research_runs")
      .update({
        params: {
          domain: ctx.domain,
          country_location_code: country,
          city_location_code: s.location_code,
          language: lang,
          topics,
          negatives: s.negative_terms,
        } as Json,
      })
      .eq("id", run.id)

    // 1. What the site already ranks for. A ranking scan from the last 14 days is reused (no
    // second payment); it also brings Search Console and Business Profile keywords.
    if (await overBudget(db)) throw new Error("This month's DataForSEO budget is used up.")
    const reused = await keywordsFromRecentScan(db, run.client_id)
    if (reused) {
      for (const r of reused) pool.add(r.item, r.source)
      counts.ranked = reused.length
      counts.from_scan = true
    } else {
      const ranked = await labsItems(
        db,
        "ranked_keywords",
        {
          target: ctx.domain,
          location_code: country,
          language_code: lang,
          item_types: ["organic", "local_pack"],
          limit: 1000,
          filters: [["keyword_data.keyword_info.search_volume", ">", 0]],
          order_by: ["keyword_data.keyword_info.search_volume,desc"],
        },
        call,
      )
      ranked.forEach((i) => pool.add(i, "ranked"))
      counts.ranked = ranked.length
    }
    await heartbeat(db, run.id, 1, counts)

    // 2. Ideas from the client's services (with the city and "near me").
    const seedBase = (topics.length ? topics : [norm(ctx.name)]).slice(0, 6)
    const seeds = [
      ...new Set(
        seedBase.flatMap((t) => [t, cityName ? `${t} ${cityName}` : null, `${t} near me`].filter((x): x is string => !!x)),
      ),
    ].slice(0, 20)
    if (seeds.length) {
      if (await overBudget(db)) throw new Error("This month's DataForSEO budget is used up.")
      const ideas = await labsItems(
        db,
        "keyword_ideas",
        {
          keywords: seeds,
          location_code: country,
          language_code: lang,
          limit: 700,
          filters: [["keyword_info.search_volume", ">=", 10]],
          order_by: ["keyword_info.search_volume,desc"],
        },
        call,
      )
      ideas.forEach((i) => pool.add(i, "ideas"))
      counts.ideas = ideas.length
    }
    await heartbeat(db, run.id, 2, counts)

    // 3. Suggestions and related searches for the main services.
    let suggestions = 0
    for (const term of seedBase.slice(0, 3)) {
      if (await overBudget(db)) break
      const items = await labsItems(
        db,
        "keyword_suggestions",
        {
          keyword: term,
          location_code: country,
          language_code: lang,
          limit: 200,
          filters: [["keyword_info.search_volume", ">=", 10]],
        },
        call,
      )
      items.forEach((i) => pool.add(i, "suggestions"))
      suggestions += items.length
    }
    let related = 0
    for (const term of seedBase.slice(0, 2)) {
      if (await overBudget(db)) break
      const items = await labsItems(
        db,
        "related_keywords",
        { keyword: term, location_code: country, language_code: lang, depth: 2, limit: 200 },
        call,
      )
      items.forEach((i) => pool.add(i, "related"))
      related += items.length
    }
    counts.suggestions = suggestions
    counts.related = related
    await heartbeat(db, run.id, 3, counts)

    // 4. What real competitors rank for (and the client doesn't).
    const competitors: string[] = []
    if (!(await overBudget(db))) {
      const items = await labsItems(
        db,
        "competitors_domain",
        {
          target: ctx.domain,
          location_code: country,
          language_code: lang,
          exclude_top_domains: true,
          item_types: ["organic"],
          limit: 20,
        },
        call,
      )
      for (const it of items) {
        const d = normalizeHost(str(it.domain))
        if (!d || d === ctx.domain || NOT_COMPETITORS.some((n) => d === n || d.endsWith(`.${n}`))) continue
        competitors.push(d)
        if (competitors.length === 3) break
      }
    }
    const topicFilters = topics.slice(0, 3).map((t) => ["keyword_data.keyword", "ilike", `%${t}%`])
    let fromCompetitors = 0
    for (const comp of competitors) {
      if (await overBudget(db)) break
      const filters: unknown[] = [["keyword_data.keyword_info.search_volume", ">", 0]]
      if (topicFilters.length) {
        filters.push("and")
        filters.push(topicFilters.flatMap((f, i) => (i ? ["or", f] : [f])))
      }
      const items = await labsItems(
        db,
        "ranked_keywords",
        { target: comp, location_code: country, language_code: lang, limit: 300, filters },
        call,
      )
      items.forEach((i) => pool.add(i, "competitor", comp))
      fromCompetitors += items.length
    }
    counts.competitors = competitors
    counts.competitor_keywords = fromCompetitors
    await heartbeat(db, run.id, 4, counts)

    // 5. Keep what's relevant to this client.
    const trackedNorms = new Set((tracked ?? []).map((k) => norm(k.phrase)))
    for (const t of tracked ?? []) pool.add({ keyword: t.phrase }, "tracked")
    const kept: Cand[] = []
    let filtered = 0
    for (const c of pool.map.values()) {
      const isTracked = trackedNorms.has(c.norm)
      const relevant =
        isTracked ||
        topicOf(c.norm, topics) !== null ||
        ((c.sources.has("ranked") || c.sources.has("search_console")) && (c.rankedPosition ?? 999) <= 50) ||
        c.sources.has("google_business") ||
        (topics.length === 0 && (c.intent === "transactional" || c.intent === "commercial"))
      if (!isTracked && (!relevant || c.otherLanguage || hasNegative(c.norm, s.negative_terms))) {
        filtered++
        continue
      }
      kept.push(c)
    }
    counts.kept = kept.length
    counts.filtered = filtered
    await heartbeat(db, run.id, 5, counts)

    // 6. Searches a month in the client's city (Google Ads), cached for 35 days.
    const local = new Map<string, number | null>()
    if (s.location_code !== null) {
      const wanted = [
        ...kept.filter((c) => trackedNorms.has(c.norm)),
        ...kept.filter((c) => !trackedNorms.has(c.norm)).sort((a, b) => (b.nationalVolume ?? 0) - (a.nationalVolume ?? 0)),
      ]
        .slice(0, 1000)
        .map((c) => c.norm)
      const since = new Date(Date.now() - LOCAL_CACHE_DAYS * 86_400_000).toISOString()
      for (let i = 0; i < wanted.length; i += 500) {
        const { data: cached } = await db
          .from("keyword_metrics")
          .select("keyword_norm, search_volume")
          .eq("source", "google_ads")
          .eq("location_code", s.location_code)
          .eq("language_code", lang)
          .gte("fetched_at", since)
          .in("keyword_norm", wanted.slice(i, i + 500))
        for (const m of cached ?? []) local.set(m.keyword_norm, m.search_volume)
      }
      const missing = wanted.filter((k) => !local.has(k))
      if (missing.length && !(await overBudget(db))) {
        const rows = await adsSearchVolume(db, missing.slice(0, 1000), s.location_code, lang, call)
        const now = new Date().toISOString()
        const metrics: TablesInsert<"keyword_metrics">[] = rows.map((r) => {
          local.set(norm(r.keyword), r.search_volume)
          return {
            keyword_norm: norm(r.keyword),
            location_code: s.location_code!,
            language_code: lang,
            source: "google_ads",
            search_volume: r.search_volume,
            monthly_searches: (r.monthly_searches ?? null) as Json,
            cpc: r.cpc,
            competition: r.competition_index !== null ? Math.min(1, Math.max(0, r.competition_index / 100)) : null,
            competition_level: r.competition && ["LOW", "MEDIUM", "HIGH"].includes(r.competition) ? r.competition : null,
            fetched_at: now,
          }
        })
        // Keywords Google returned nothing for still count as "looked up".
        for (const k of missing.slice(0, 1000)) {
          if (!local.has(k)) {
            local.set(k, 0)
            metrics.push({ keyword_norm: k, location_code: s.location_code!, language_code: lang, source: "google_ads", search_volume: 0, fetched_at: now })
          }
        }
        for (let i = 0; i < metrics.length; i += 500) {
          await db.from("keyword_metrics").upsert(metrics.slice(i, i + 500))
        }
      }
      counts.local_lookups = local.size
    }
    // National Labs metrics go to the shared cache too.
    const national: TablesInsert<"keyword_metrics">[] = kept
      .filter((c) => c.nationalVolume !== null || c.difficulty !== null)
      .map((c) => ({
        keyword_norm: c.norm,
        location_code: country,
        language_code: lang,
        source: "labs",
        search_volume: c.nationalVolume,
        monthly_searches: c.monthly,
        cpc: c.cpc,
        competition: c.competition,
        competition_level: c.competitionLevel && ["LOW", "MEDIUM", "HIGH"].includes(c.competitionLevel) ? c.competitionLevel : null,
        keyword_difficulty: c.difficulty !== null ? Math.round(Math.min(100, Math.max(0, c.difficulty))) : null,
        main_intent: c.intent,
        core_keyword: c.coreKeyword?.slice(0, 200) ?? null,
        trend_yearly: c.trendYearly !== null ? Math.round(c.trendYearly) : null,
        fetched_at: new Date().toISOString(),
      }))
    for (let i = 0; i < national.length; i += 500) {
      await db.from("keyword_metrics").upsert(national.slice(i, i + 500))
    }
    await heartbeat(db, run.id, 6, counts)

    // 7. Score and save (the best 500, plus every tracked keyword).
    const scored = kept.map((c) => {
      const localVolume = local.has(c.norm) ? (local.get(c.norm) ?? null) : null
      const { score, parts } = scoreKeyword({
        localVolume,
        nationalVolume: c.nationalVolume,
        difficulty: c.difficulty,
        cpc: c.cpc,
        intent: c.intent,
        position: c.rankedPosition,
      })
      return { c, localVolume, score, parts }
    })
    const best = [
      ...scored.filter((x) => trackedNorms.has(x.c.norm)),
      ...scored.filter((x) => !trackedNorms.has(x.c.norm)).sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES),
    ]

    const { data: existingRows } = await db
      .from("keyword_candidates")
      .select("keyword_norm")
      .eq("client_id", run.client_id)
    const existing = new Set((existingRows ?? []).map((r) => r.keyword_norm))
    const now = new Date().toISOString()
    const toRow = (x: (typeof best)[number]) => ({
      client_id: run.client_id,
      keyword_norm: x.c.norm,
      phrase: x.c.phrase,
      topic: topicOf(x.c.norm, topics),
      sources: [...x.c.sources],
      competitor_domains: [...x.c.competitors].slice(0, 10),
      local_volume: x.localVolume,
      national_volume: x.c.nationalVolume,
      difficulty: x.c.difficulty !== null ? Math.round(Math.min(100, Math.max(0, x.c.difficulty))) : null,
      cpc: x.c.cpc,
      competition: x.c.competition,
      intent: x.c.intent,
      trend_yearly: x.c.trendYearly !== null ? Math.round(x.c.trendYearly) : null,
      core_keyword: x.c.coreKeyword?.slice(0, 200) ?? null,
      ranked_position: x.c.rankedPosition,
      ranked_url: x.c.rankedUrl?.slice(0, 2000) ?? null,
      score: x.score,
      score_parts: x.parts as unknown as Json,
      last_seen_run: run.id,
      updated_at: now,
    })
    const fresh = best.filter((x) => !existing.has(x.c.norm))
    const seen = best.filter((x) => existing.has(x.c.norm))
    for (let i = 0; i < fresh.length; i += 200) {
      const { error } = await db.from("keyword_candidates").insert(
        fresh.slice(i, i + 200).map((x) => ({
          ...toRow(x),
          first_seen_run: run.id,
          status: trackedNorms.has(x.c.norm) ? ("tracked" as const) : ("new" as const),
        })),
      )
      if (error) throw new Error(`Could not save suggestions: ${error.message}`)
    }
    for (let i = 0; i < seen.length; i += 200) {
      // Existing rows keep their status (tracked / dismissed) and first run.
      const { error } = await db.from("keyword_candidates").upsert(seen.slice(i, i + 200).map(toRow), {
        onConflict: "client_id,keyword_norm",
      })
      if (error) throw new Error(`Could not update suggestions: ${error.message}`)
    }
    counts.saved = best.length
    counts.new = fresh.length

    // 8. Done.
    const { data: spent } = await db.from("dfs_calls").select("cost_usd").eq("ref", run.id)
    const cost = (spent ?? []).reduce((n, r) => n + Number(r.cost_usd), 0)
    await db
      .from("keyword_research_runs")
      .update({
        status: "done",
        step: 8,
        counts: counts as Json,
        cost_usd: Math.round(cost * 10_000) / 10_000,
        finished_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", run.id)
    await db.from("activity_log").insert({
      actor_id: run.created_by,
      client_id: run.client_id,
      action: "keyword.research_finished",
      meta: { saved: best.length, new: fresh.length, cost: Math.round(cost * 100) / 100 } as Json,
    })
    if (run.created_by) {
      await db.from("notifications").insert({
        recipient_id: run.created_by,
        kind: "research_finished",
        client_id: run.client_id,
      })
    }
  } catch (e) {
    const message =
      e instanceof DfsError ? e.message : e instanceof Error ? e.message : "Keyword research failed."
    console.error("[rankings] research failed", run.id, e)
    const { data: spent } = await db.from("dfs_calls").select("cost_usd").eq("ref", run.id)
    await db
      .from("keyword_research_runs")
      .update({
        status: "failed",
        error: message.slice(0, 500),
        counts: counts as Json,
        cost_usd: (spent ?? []).reduce((n, r) => n + Number(r.cost_usd), 0),
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id)
  }
}
