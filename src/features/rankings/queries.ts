import "server-only"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Tables } from "@/lib/supabase/database.types"
import { ENGINES, intentOf, type Engine, type Intent } from "./constants"
import { scoreKeyword, weakReasons, type TrackedFacts } from "./scoring"

/** Reads for the Rankings page. Everything goes through RLS (VAs see only their clients). */

export type RankPoint = { at: string; position: number | null; full: boolean }

export type EngineRank = {
  position: number | null
  previous: number | null
  start: number | null
  url: string | null
  checkedAt: string | null
  history: RankPoint[]
  localPack: number | null
  features: string[]
  inAiOverview: boolean
  checkUrl: string | null
  mapsRating: number | null
  mapsReviews: number | null
  /** Full weekly checks so far, and how many found the client. */
  checks: number
  found: number
}

export type TrackedKeyword = {
  id: string
  phrase: string
  topic: string | null
  source: string
  addedAt: string
  firstCheckedAt: string | null
  localVolume: number | null
  nationalVolume: number | null
  difficulty: number | null
  intent: Intent | null
  cpc: number | null
  coreKeyword: string | null
  monthly: { year: number; month: number; search_volume: number | null }[]
  engines: Record<Engine, EngineRank | null>
  score: number
  weak: string[]
  /** The latest ranking scan's verdict for this keyword (Rankings → Ranking now). */
  scan?: { verdict: "keep" | "quick_win" | "brand" | "watch" | "skip"; reasons: string[]; position: number | null; clicks: number | null } | null
}

export type CheckSummary = {
  keywords: number
  top3: number
  top10: number
  top20: number
  top100: number
  not_found: number
  in_local_pack: number
}

export type RankingsData = {
  settings: Tables<"rank_settings"> | null
  keywords: TrackedKeyword[]
  limit: number
  summary: { now: CheckSummary | null; before: CheckSummary | null; mapsTop3: number | null; mapsBefore: number | null }
  lastCheckAt: string | null
  openRun: { id: string; scope: string; status: string; done: number; total: number; createdAt: string } | null
  lastRun: { status: string; error: string | null; finishedAt: string | null } | null
}

const HISTORY_DAYS = 100

export async function getRankingsData(clientId: string, city: string | null): Promise<RankingsData> {
  const supabase = await createSupabaseServerClient()
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString()

  const [settings, client, keywords, checks, runs] = await Promise.all([
    supabase.from("rank_settings").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("clients").select("keywords_target").eq("id", clientId).single(),
    supabase
      .from("keywords")
      .select("id, phrase, topic, source, created_at, first_checked_at")
      .eq("client_id", clientId)
      .is("archived_at", null)
      .eq("tracked", true)
      .order("phrase"),
    supabase
      .from("rank_checks")
      .select("id, engine, scope, status, checked_at, summary")
      .eq("client_id", clientId)
      .eq("status", "done")
      .order("checked_at", { ascending: false })
      .limit(200),
    supabase
      .from("rank_runs")
      .select("id, scope, status, error, created_at, finished_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  const kw = keywords.data ?? []
  const checkRows = checks.data ?? []
  const checkById = new Map(checkRows.map((c) => [c.id, c]))

  // Ranks for the tracked keywords over the last ~14 weeks (all engines, full and partial
  // checks), fetched in pages because the API returns at most 1,000 rows at a time.
  const recentChecks = checkRows.filter((c) => c.checked_at && c.checked_at >= since).map((c) => c.id)
  type RankRow = {
    check_id: string
    keyword_id: string
    engine: Engine
    position: number | null
    url: string | null
    local_pack_position: number | null
    serp_features: string[]
    in_ai_overview: boolean
    check_url: string | null
    maps_rating: number | null
    maps_reviews: number | null
  }
  const ranks: RankRow[] = []
  if (kw.length && recentChecks.length) {
    for (let from = 0; from < 20_000; from += 1000) {
      const { data: page } = await supabase
        .from("keyword_ranks")
        .select(
          "check_id, keyword_id, engine, position, url, local_pack_position, serp_features, in_ai_overview, check_url, maps_rating, maps_reviews",
        )
        .eq("client_id", clientId)
        .in("check_id", recentChecks)
        .order("check_id")
        .order("keyword_id")
        .range(from, from + 999)
      ranks.push(...((page ?? []) as RankRow[]))
      if (!page || page.length < 1000) break
    }
  }

  // First-ever position per keyword and engine ("start").
  const { data: firstRanks } = kw.length
    ? await supabase.rpc("keyword_first_ranks", { p_client_id: clientId })
    : { data: [] }
  const start = new Map<string, number | null>()
  for (const r of firstRanks ?? []) start.set(`${r.keyword_id}:${r.engine}`, r.first_position)

  // Search volume, difficulty and intent from the shared cache.
  const s = settings.data
  const phrases = kw.map((k) => k.phrase)
  const metrics = phrases.length
    ? (
        await supabase
          .from("keyword_metrics")
          .select("keyword_norm, source, location_code, search_volume, keyword_difficulty, main_intent, cpc, core_keyword, monthly_searches")
          .in("keyword_norm", phrases)
      ).data ?? []
    : []
  const local = new Map<string, (typeof metrics)[number]>()
  const national = new Map<string, (typeof metrics)[number]>()
  for (const m of metrics) {
    if (m.source === "google_ads" && m.location_code === s?.location_code) local.set(m.keyword_norm, m)
    if (m.source === "labs" && m.location_code === s?.country_location_code) national.set(m.keyword_norm, m)
  }

  const out: TrackedKeyword[] = kw.map((k) => {
    const engines = Object.fromEntries(
      ENGINES.map((engine) => {
        const rows = ranks
          .filter((r) => r.keyword_id === k.id && r.engine === engine)
          .map((r) => ({ r, check: checkById.get(r.check_id)! }))
          .filter((x) => x.check?.checked_at)
          .sort((a, b) => b.check.checked_at!.localeCompare(a.check.checked_at!))
        if (rows.length === 0) return [engine, null]
        const latest = rows[0]
        const full = rows.filter((x) => x.check.scope === "full")
        return [
          engine,
          {
            position: latest.r.position,
            previous: rows[1]?.r.position ?? null,
            start: start.get(`${k.id}:${engine}`) ?? null,
            url: latest.r.url,
            checkedAt: latest.check.checked_at,
            history: rows
              .map((x) => ({ at: x.check.checked_at!, position: x.r.position, full: x.check.scope === "full" }))
              .reverse(),
            localPack: latest.r.local_pack_position,
            features: latest.r.serp_features ?? [],
            inAiOverview: latest.r.in_ai_overview,
            checkUrl: latest.r.check_url,
            mapsRating: latest.r.maps_rating !== null ? Number(latest.r.maps_rating) : null,
            mapsReviews: latest.r.maps_reviews,
            checks: full.length,
            found: full.filter((x) => x.r.position !== null).length,
          } satisfies EngineRank,
        ]
      }),
    ) as Record<Engine, EngineRank | null>

    const l = local.get(k.phrase)
    const n = national.get(k.phrase)
    const intent = intentOf(n?.main_intent)
    const facts = {
      localVolume: l?.search_volume ?? null,
      nationalVolume: n?.search_volume ?? null,
      difficulty: n?.keyword_difficulty ?? null,
      cpc: l?.cpc !== undefined && l?.cpc !== null ? Number(l.cpc) : n?.cpc !== undefined && n?.cpc !== null ? Number(n.cpc) : null,
      intent,
      position: engines.google?.position ?? null,
    }
    const { score } = scoreKeyword(facts)
    const monthly = Array.isArray(l?.monthly_searches)
      ? (l!.monthly_searches as { year: number; month: number; search_volume: number | null }[])
      : Array.isArray(n?.monthly_searches)
        ? (n!.monthly_searches as { year: number; month: number; search_volume: number | null }[])
        : []
    return {
      id: k.id,
      phrase: k.phrase,
      topic: k.topic,
      source: k.source,
      addedAt: k.created_at,
      firstCheckedAt: k.first_checked_at,
      ...facts,
      coreKeyword: n?.core_keyword ?? null,
      monthly,
      engines,
      score,
      weak: [],
    }
  })

  // Weak flags need every tracked keyword (duplicates are found across the list).
  const facts: TrackedFacts[] = out.map((k) => ({
    phrase: k.phrase,
    localVolume: k.localVolume,
    nationalVolume: k.nationalVolume,
    difficulty: k.difficulty,
    cpc: k.cpc,
    intent: k.intent,
    position: k.engines.google?.position ?? null,
    score: k.score,
    coreKeyword: k.coreKeyword,
    checks: k.engines.google?.checks ?? 0,
    checksFound: k.engines.google?.found ?? 0,
  }))
  out.forEach((k, i) => {
    k.weak = weakReasons(facts[i], facts, city)
  })

  const fullGoogle = checkRows.filter((c) => c.engine === "google" && c.scope === "full")
  const fullMaps = checkRows.filter((c) => c.engine === "google_maps" && c.scope === "full")
  const summaryOf = (c?: (typeof checkRows)[number]) => (c?.summary as CheckSummary | null) ?? null

  const openRun = (runs.data ?? []).find((r) => r.status === "queued" || r.status === "running")
  const progress = { done: 0, total: 0 }
  if (openRun) {
    const { data: rc } = await supabase
      .from("rank_checks")
      .select("tasks_total, tasks_done, tasks_failed")
      .eq("run_id", openRun.id)
    for (const c of rc ?? []) {
      progress.total += c.tasks_total
      progress.done += c.tasks_done + c.tasks_failed
    }
  }
  const lastFinished = (runs.data ?? []).find((r) => r.finished_at)

  return {
    settings: s,
    keywords: out,
    limit: client.data?.keywords_target ?? 20,
    summary: {
      now: summaryOf(fullGoogle[0]),
      before: summaryOf(fullGoogle[1]),
      mapsTop3: fullMaps[0] ? (summaryOf(fullMaps[0])?.top3 ?? null) : null,
      mapsBefore: fullMaps[1] ? (summaryOf(fullMaps[1])?.top3 ?? null) : null,
    },
    lastCheckAt: fullGoogle[0]?.checked_at ?? null,
    openRun: openRun
      ? {
          id: openRun.id,
          scope: openRun.scope,
          status: openRun.status,
          done: progress.done,
          total: progress.total,
          createdAt: openRun.created_at,
        }
      : null,
    lastRun: lastFinished
      ? { status: lastFinished.status, error: lastFinished.error, finishedAt: lastFinished.finished_at }
      : null,
  }
}

export type Candidate = Tables<"keyword_candidates">

export type ResearchData = {
  lastRun: Tables<"keyword_research_runs"> | null
  candidates: Candidate[]
  /** Every idea that isn't dismissed (the screen loads the best 400). */
  total: number
  dismissed: number
  runsThisMonth: number
  runLimit: number
  overBudget: boolean
}

export async function getResearchData(clientId: string): Promise<ResearchData> {
  const supabase = await createSupabaseServerClient()
  const [runs, candidates, dismissed, quota] = await Promise.all([
    supabase
      .from("keyword_research_runs")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("keyword_candidates")
      .select("*", { count: "exact" })
      .eq("client_id", clientId)
      .neq("status", "dismissed")
      .order("score", { ascending: false })
      .limit(400),
    supabase
      .from("keyword_candidates")
      .select("keyword_norm", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("status", "dismissed"),
    supabase.rpc("research_quota", { p_client_id: clientId }),
  ])
  const q = (quota.data ?? {}) as { used?: number; limit?: number; over_budget?: boolean }
  return {
    lastRun: runs.data?.[0] ?? null,
    candidates: candidates.data ?? [],
    total: candidates.count ?? candidates.data?.length ?? 0,
    dismissed: dismissed.count ?? 0,
    runsThisMonth: q.used ?? 0,
    runLimit: q.limit ?? 4,
    overBudget: Boolean(q.over_budget),
  }
}

export async function getDismissed(clientId: string): Promise<Candidate[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("keyword_candidates")
    .select("*")
    .eq("client_id", clientId)
    .eq("status", "dismissed")
    .order("decided_at", { ascending: false })
    .limit(200)
  return data ?? []
}

export type BudgetStatus = {
  spent: number
  budget: number
  research_runs_per_client_month: number
  low_balance: number
  balance: number | null
  balance_at: string | null
  over_budget: boolean
}

/** Admins only (the database refuses others). */
export async function getBudgetStatus(): Promise<BudgetStatus | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("dfs_budget_status")
  if (error) return null
  return data as unknown as BudgetStatus
}
