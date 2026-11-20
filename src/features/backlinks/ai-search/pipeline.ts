import "server-only"

import { ClaudeError, claudeJsonWithUsage, claudeResearch, type CallUsage } from "@/lib/ai/claude"
import type { Db } from "@/lib/dataforseo/client"
import { hasAnthropicKey } from "@/lib/env.server"
import type { Database, Json, Tables } from "@/lib/supabase/database.types"
import { snapshotOf, type BriefSnapshot } from "../brief"
import type { DirectoryType } from "../constants"
import { registrableDomain, siteKeyOf } from "../site-key"
import { checkPage, linkTypeOf, type RedFlag } from "./checks"
import {
  AI_REVIEW_CAP,
  CATEGORIES,
  CATEGORY,
  languageOf,
  LIMITS,
  planAiSearch,
  SEARCHES,
  type CategoryKey,
  type FinderKey,
  type Market,
  type PlannedTask,
} from "./config"
import { fetchMany, fetchPage } from "./fetcher"
import { norm, parseWith, quoteOnPage } from "./parse"
import * as P from "./prompts"
import {
  CandidatesSchema,
  CompetitorsSchema,
  DossierSchema,
  JudgementSchema,
  PageReadSchema,
  PicksSchema,
  RankingSchema,
  type Candidates,
  type Dossier,
  type Judgement,
  type PageRead,
  type Ranking,
} from "./schemas"

/**
 * Shockwave AI Search pipeline (docs/plans/backlinks/08-shockwave-ai-search.md). AI only: Claude
 * Haiku 5.5 with web search, plus our own page fetcher. Every unit of work is a row in
 * ai_search_tasks, so a redeploy or crash resumes where it stopped and never pays twice.
 *
 * Steps: 1 dossier · 2 where to rank · 3 competitors · 4 research · 5 merge · 6 verify ·
 * 8 judge · 9 pick the top 30. (7 was site strength through DataForSEO; not used.)
 */

type Run = Tables<"ai_search_runs">
type Task = Tables<"ai_search_tasks">

class StopRun extends Error {}
class Released extends Error {}

const HEARTBEAT_MS = 30_000
const STAGE_NAMES: Record<number, string> = {
  1: "dossier",
  2: "ranking",
  3: "competitors",
  4: "research",
  5: "merge",
  6: "verify",
  8: "judge",
  9: "pick",
}

// A redeploy sends SIGTERM and gives ~120 s before KILL: stop starting tasks and hand the run back.
let stopping = false
let hooked = false
function hookShutdown() {
  if (hooked || typeof process === "undefined" || typeof process.once !== "function") return
  hooked = true
  process.once("SIGTERM", () => {
    stopping = true
    // If nothing else handles SIGTERM, our listener would keep the process alive until KILL:
    // give the worker time to hand its run back, then exit.
    if (process.listenerCount("SIGTERM") === 0) setTimeout(() => process.exit(0), 25_000).unref?.()
  })
}

/** Claims and runs queued AI searches (or resumes a stalled or released one). */
export async function processAiSearchRuns(db: Db, max = 1): Promise<number> {
  hookShutdown()
  let done = 0
  for (let i = 0; i < max && !stopping; i++) {
    const { data, error } = await db.rpc("dfs_claim_ai_search_run")
    if (error) throw new Error(`Could not claim an AI search: ${error.message}`)
    const run = (data as Run[] | null)?.[0]
    if (!run) break
    await runAiSearch(db, run)
    done++
  }
  return done
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type Ctx = {
  db: Db
  run: Run
  clientId: string
  name: string
  website: string | null
  domain: string | null
  services: string[]
  industry: string | null
  profileText: string
  brief: BriefSnapshot
  markets: Market[]
  disabled: CategoryKey[]
  caps: { maxUsd: number; maxSearches: number; searchPrice: number }
  spent: number
  searches: number
  dossier: Dossier | null
  competitors: Record<string, { domain: string; name: string }[]>
  counts: Record<string, unknown>
}

type Rec = Record<string, unknown>
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v ?? d) || d)

async function loadContext(db: Db, run: Run): Promise<Ctx> {
  const [{ data: client, error }, { data: profile }, { data: targets }, { data: calls }] = await Promise.all([
    db.from("clients").select("id, name, industry, website, stage, city, region, country_code").eq("id", run.client_id).single(),
    db
      .from("client_business_profiles")
      .select("business_name, services, primary_category, other_categories, website, service_areas, description, city, region, country_code, year_founded")
      .eq("client_id", run.client_id)
      .maybeSingle(),
    db
      .from("backlink_targets")
      .select("id, label, kind, country_iso, city, region_name")
      .in("id", run.target_ids.length ? run.target_ids : ["00000000-0000-0000-0000-000000000000"]),
    db.from("ai_calls").select("cost_usd, web_searches").eq("ref", run.id),
  ])
  if (error || !client) throw new StopRun("Client not found.")
  if (client.stage === "paused" || client.stage === "churned") throw new StopRun("This client is paused or has left.")
  const params = (run.params ?? {}) as Rec
  const brief = snapshotOf(params.brief)
  if (!brief) throw new StopRun("This search has no strategy brief. Run it again from the Backlinks page.")
  const markets: Market[] = (targets ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    kind: t.kind as Market["kind"],
    countryIso: t.country_iso,
    city: t.city,
    region: t.region_name,
    language: languageOf(t.country_iso),
  }))
  if (markets.length === 0) throw new StopRun("The places for this search were removed. Add places and run it again.")
  const website = (profile?.website || client.website || "").trim() || null
  const host = website ? safeHost(website) : null
  const caps = (params.caps ?? {}) as Rec
  const options = (params.options ?? {}) as Rec
  const services = [...new Set([...(profile?.services ?? []), profile?.primary_category ?? ""].filter(Boolean))].slice(0, 12)
  const profileText = [
    `Business name: ${profile?.business_name ?? client.name}`,
    website ? `Website: ${website}` : null,
    client.industry ? `Industry: ${client.industry}` : null,
    profile?.primary_category ? `Primary category: ${profile.primary_category}` : null,
    profile?.other_categories?.length ? `Other categories: ${profile.other_categories.join(", ")}` : null,
    services.length ? `Services: ${services.join(", ")}` : null,
    profile?.service_areas?.length ? `Service areas: ${profile.service_areas.join(", ")}` : null,
    [profile?.city ?? client.city, profile?.region ?? client.region, profile?.country_code ?? client.country_code]
      .filter(Boolean)
      .join(", ")
      ? `Location: ${[profile?.city ?? client.city, profile?.region ?? client.region, profile?.country_code ?? client.country_code].filter(Boolean).join(", ")}`
      : null,
    profile?.year_founded ? `Founded: ${profile.year_founded}` : null,
    profile?.description ? `Description: ${profile.description}` : null,
  ]
    .filter(Boolean)
    .join("\n")
  return {
    db,
    run,
    clientId: client.id,
    name: profile?.business_name || client.name,
    website,
    domain: host ? registrableDomain(host) : null,
    services,
    industry: client.industry,
    profileText,
    brief,
    markets,
    disabled: Array.isArray(options.disabled) ? (options.disabled as CategoryKey[]) : [],
    caps: {
      maxUsd: num(caps.max_usd, 4),
      maxSearches: num(caps.max_web_searches, 80),
      searchPrice: num(caps.web_search_price, 0.01),
    },
    spent: (calls ?? []).reduce((n, c) => n + Number(c.cost_usd), 0),
    searches: (calls ?? []).reduce((n, c) => n + (c.web_searches ?? 0), 0),
    dossier: null,
    competitors: {},
    counts: { ...((run.counts ?? {}) as Rec) },
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return null
  }
}

const client = (ctx: Ctx) =>
  P.clientBlock({
    name: ctx.name,
    website: ctx.website,
    brief: ctx.brief,
    dossier: ctx.dossier,
    services: ctx.services,
    industry: ctx.industry,
  })

const callCtx = (ctx: Ctx, stage: number, taskId: string | null) => ({
  feature: `ai_search.${STAGE_NAMES[stage] ?? "step"}`,
  clientId: ctx.clientId,
  ref: ctx.run.id,
  stage: STAGE_NAMES[stage] ?? null,
  taskId,
  searchPrice: ctx.caps.searchPrice,
})

// ---------------------------------------------------------------------------
// Tasks: create once, run what's left, record usage
// ---------------------------------------------------------------------------

type TaskResult = { output: Json; usage?: CallUsage[]; status?: "done" | "skipped" }

async function ensureTasks(ctx: Ctx, tasks: { stage: number; kind: string; key: string; input?: Json }[]) {
  if (!tasks.length) return
  for (let i = 0; i < tasks.length; i += 200) {
    const { error } = await ctx.db.from("ai_search_tasks").upsert(
      tasks.slice(i, i + 200).map((t) => ({
        run_id: ctx.run.id,
        client_id: ctx.clientId,
        stage: t.stage,
        kind: t.kind,
        key: t.key.slice(0, 300),
        input: t.input ?? {},
      })),
      { onConflict: "run_id,key", ignoreDuplicates: true },
    )
    if (error) throw new Error(`Could not save the plan of work: ${error.message}`)
  }
}

async function tasksOf(ctx: Ctx, stage: number) {
  const { data, error } = await ctx.db
    .from("ai_search_tasks")
    .select("*")
    .eq("run_id", ctx.run.id)
    .eq("stage", stage)
    .order("created_at")
  if (error) throw new Error(error.message)
  return data ?? []
}

function sumUsage(list: CallUsage[] = []) {
  return list.reduce(
    (a, u) => ({
      tokensIn: a.tokensIn + u.inputTokens + u.cacheRead + u.cacheWrite,
      tokensOut: a.tokensOut + u.outputTokens,
      searches: a.searches + u.webSearches,
      cost: a.cost + u.cost,
      model: u.model || a.model,
    }),
    { tokensIn: 0, tokensOut: 0, searches: 0, cost: 0, model: "" },
  )
}

let lastProgress = 0
async function progress(ctx: Ctx, force = false) {
  if (!force && Date.now() - lastProgress < 3000) return
  lastProgress = Date.now()
  await ctx.db
    .from("ai_search_runs")
    .update({
      counts: ctx.counts as Json,
      cost_usd: Math.round(ctx.spent * 10000) / 10000,
      web_searches: ctx.searches,
      heartbeat_at: new Date().toISOString(),
    })
    .eq("id", ctx.run.id)
}

/**
 * Run a stage's queued tasks with limited concurrency. Over the cost or search cap, the rest are
 * skipped (the run finishes with what it has). A failed task is tried once more.
 */
async function runStage(
  ctx: Ctx,
  stage: number,
  handler: (task: Task) => Promise<TaskResult>,
  opts: { concurrency?: number; searchesPerTask?: (t: Task) => number } = {},
) {
  await ctx.db.from("ai_search_runs").update({ stage }).eq("id", ctx.run.id)
  const queue = (await tasksOf(ctx, stage)).filter((t) => t.status === "queued")
  let i = 0
  const worker = async () => {
    while (i < queue.length) {
      if (stopping) throw new Released()
      const task = queue[i++]
      const wantSearches = opts.searchesPerTask?.(task) ?? 0
      if (ctx.spent >= ctx.caps.maxUsd || (wantSearches > 0 && ctx.searches + wantSearches > ctx.caps.maxSearches)) {
        await ctx.db
          .from("ai_search_tasks")
          .update({ status: "skipped", error: "Stopped at the run's cost or search limit.", finished_at: new Date().toISOString() })
          .eq("id", task.id)
        ctx.counts.capped = true
        continue
      }
      await ctx.db
        .from("ai_search_tasks")
        .update({ status: "running", started_at: new Date().toISOString(), attempts: task.attempts + 1 })
        .eq("id", task.id)
      try {
        const r = await handler(task)
        const u = sumUsage(r.usage)
        ctx.spent += u.cost
        ctx.searches += u.searches
        await ctx.db
          .from("ai_search_tasks")
          .update({
            status: r.status ?? "done",
            output: r.output,
            error: null,
            tokens_in: u.tokensIn,
            tokens_out: u.tokensOut,
            web_searches: u.searches,
            cost_usd: Math.round(u.cost * 100000) / 100000,
            model: u.model || null,
            prompt_version: (P.PROMPT_VERSIONS as Record<string, string>)[task.kind] ?? null,
            finished_at: new Date().toISOString(),
          })
          .eq("id", task.id)
      } catch (e) {
        if (e instanceof Released || e instanceof StopRun) throw e
        const message = e instanceof Error ? e.message : String(e)
        console.error("[ai-search] task failed", ctx.run.id, task.key, message)
        const retry = task.attempts + 1 < 2 && !(e instanceof ClaudeError && e.kind === "not_configured")
        await ctx.db
          .from("ai_search_tasks")
          .update({
            status: retry ? "queued" : "failed",
            error: message.slice(0, 500),
            finished_at: retry ? null : new Date().toISOString(),
          })
          .eq("id", task.id)
        if (e instanceof ClaudeError && e.kind === "not_configured") throw new StopRun(e.message)
        if (retry) queue.push({ ...task, attempts: task.attempts + 1 })
      }
      await progress(ctx)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 1, queue.length || 1)) }, worker))
  await progress(ctx, true)
}

const outputsOf = async <T>(ctx: Ctx, kind: string) =>
  (await ctx.db.from("ai_search_tasks").select("key, input, output").eq("run_id", ctx.run.id).eq("kind", kind).eq("status", "done"))
    .data?.map((t) => ({ key: t.key, input: t.input as Rec, output: t.output as T })) ?? []

/** Research answers are text: parse, or run a cheap repair call without tools. */
async function parseResearch<S extends typeof RankingSchema | typeof CandidatesSchema>(
  ctx: Ctx,
  stage: number,
  taskId: string,
  schema: S,
  shape: string,
  text: string,
  usage: CallUsage[],
) {
  const direct = parseWith(schema, text)
  if (direct) return direct
  if (!text.trim()) return null
  const r = await claudeJsonWithUsage(ctx.db, {
    schema,
    system: { stable: "You convert text into the requested JSON. Only data, no commentary." },
    prompt: P.repairPrompt(text, shape),
    feature: `ai_search.repair`,
    clientId: ctx.clientId,
    ref: ctx.run.id,
    stage: STAGE_NAMES[stage],
    taskId,
    maxTokens: 6000,
  })
  usage.push(r.usage)
  return r.data
}

/** Keep only URLs Claude actually saw in its search results (same host), so invented ones drop. */
function fromSources(url: string, sources: { url: string }[]) {
  let host: string
  try {
    host = new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return false
  }
  return sources.some((s) => {
    try {
      return new URL(s.url).hostname.replace(/^www\./, "") === host
    } catch {
      return false
    }
  })
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export async function runAiSearch(db: Db, run: Run): Promise<void> {
  let ctx: Ctx | null = null
  const beat = setInterval(() => {
    void db.from("ai_search_runs").update({ heartbeat_at: new Date().toISOString() }).eq("id", run.id)
  }, HEARTBEAT_MS)
  try {
    if (!hasAnthropicKey()) throw new StopRun("ANTHROPIC_API_KEY isn't set on the server.")
    // A resumed run: whatever was running when the worker stopped goes back to the queue.
    await db.from("ai_search_tasks").update({ status: "queued", started_at: null }).eq("run_id", run.id).eq("status", "running")
    ctx = await loadContext(db, run)
    ctx.counts.markets = ctx.markets.length

    await stageDossier(ctx)
    await stageRanking(ctx)
    await stageCompetitors(ctx)
    await stageResearch(ctx)
    await stageMerge(ctx)
    await stageVerify(ctx)
    await stageJudge(ctx)
    const result = await stagePick(ctx)

    const { data: calls } = await db.from("ai_calls").select("cost_usd, web_searches").eq("ref", run.id)
    const cost = (calls ?? []).reduce((n, c) => n + Number(c.cost_usd), 0)
    const searches = (calls ?? []).reduce((n, c) => n + (c.web_searches ?? 0), 0)
    await db
      .from("ai_search_runs")
      .update({
        status: "done",
        stage: 10,
        counts: { ...ctx.counts, shortlist: result } as Json,
        cost_usd: Math.round(cost * 10000) / 10000,
        web_searches: searches,
        error: null,
        finished_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
      })
      .eq("id", run.id)
    await db.from("activity_log").insert({
      actor_id: run.created_by,
      client_id: run.client_id,
      action: "backlink.ai_search_finished",
      meta: { review: result.review, more: result.more, hidden: result.hidden, cost: Math.round(cost * 100) / 100 } as Json,
    })
    await notify(db, run, "backlinks_found")
  } catch (e) {
    if (e instanceof Released) {
      await db.rpc("dfs_release_ai_search_run", { p_run_id: run.id })
      console.warn("[ai-search] released on shutdown", run.id)
      return
    }
    const message = e instanceof StopRun || e instanceof ClaudeError ? e.message : e instanceof Error ? e.message : "The AI search failed."
    if (!(e instanceof StopRun)) console.error("[ai-search] run failed", run.id, e)
    await db
      .from("ai_search_runs")
      .update({
        status: "failed",
        error: message.slice(0, 500),
        counts: (ctx?.counts ?? run.counts) as Json,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id)
    await notify(db, run, "backlinks_failed")
  } finally {
    clearInterval(beat)
  }
}

async function notify(db: Db, run: Run, kind: "backlinks_found" | "backlinks_failed") {
  if (!run.created_by) return
  const { error } = await db.from("notifications").insert({ recipient_id: run.created_by, kind, client_id: run.client_id })
  if (error) console.error("[ai-search] notification failed", error.message)
}

// ---------------------------------------------------------------------------
// Step 1 · understand the client
// ---------------------------------------------------------------------------

const ABOUT = /\b(about|services?|what-we-do|company|who-we-are|solutions|our-work|team|practice-areas|menu|products?)\b/i

async function stageDossier(ctx: Ctx) {
  await ensureTasks(ctx, [{ stage: 1, kind: "dossier", key: "dossier" }])
  await runStage(ctx, 1, async (task) => {
    const pages: { url: string; title: string | null; text: string }[] = []
    if (ctx.website) {
      const home = await fetchPage(/^https?:\/\//i.test(ctx.website) ? ctx.website : `https://${ctx.website}`)
      if (home.status === "ok" || home.status === "js_only") {
        pages.push({ url: home.finalUrl ?? ctx.website, title: home.title, text: home.text.slice(0, 9000) })
        const more = [...new Map(home.internalLinks.filter((l) => ABOUT.test(`${l.label} ${l.url}`)).map((l) => [l.url.split("#")[0], l])).values()].slice(0, 2)
        for (const l of more) {
          const p = await fetchPage(l.url)
          if (p.status === "ok") pages.push({ url: p.finalUrl ?? l.url, title: p.title, text: p.text.slice(0, 7000) })
        }
      }
    }
    const usage: CallUsage[] = []
    let dossier: Dossier
    try {
      const r = await claudeJsonWithUsage(ctx.db, {
        schema: DossierSchema,
        system: P.system(["CLIENT_DISCOVERY"], client(ctx)),
        prompt: P.dossierPrompt({ pages, profile: ctx.profileText }),
        ...callCtx(ctx, 1, task.id),
        maxTokens: 4000,
      })
      usage.push(r.usage)
      dossier = r.data
    } catch (e) {
      if (e instanceof ClaudeError && e.kind === "not_configured") throw e
      // Without Claude's read, the brief and profile stand in.
      dossier = {
        summary: `${ctx.name}: ${ctx.services.slice(0, 3).join(", ") || ctx.brief.core_topics.join(", ")}.`,
        business_type: ctx.brief.reach.includes("local") ? "service_area" : "online",
        vertical: "other",
        services: ctx.services.length ? ctx.services : ctx.brief.core_topics,
        differentiators: [],
        brand_names: [ctx.name],
        ideal_buyer: { who: ctx.brief.audience || "unknown", triggers: "unknown", researches_on: [] },
        facts: [],
        doubts: [`Claude couldn't read the client: ${e instanceof Error ? e.message : "unknown error"}`],
      }
    }
    // Keep only facts whose quote is really on the pages or in the profile.
    const corpus = `${pages.map((p) => p.text).join(" ")} ${ctx.profileText}`
    dossier = {
      ...dossier,
      services: dossier.services.slice(0, 10),
      differentiators: dossier.differentiators.slice(0, 5),
      brand_names: [...new Set([ctx.name, ...dossier.brand_names])].filter(Boolean).slice(0, 6),
      facts: dossier.facts.filter((f) => quoteOnPage(f.quote, corpus)).slice(0, 10),
      doubts: [...dossier.doubts.slice(0, 4), ...(pages.length ? [] : ["The client's website couldn't be read."])],
    }
    await ctx.db.from("ai_client_dossiers").upsert(
      {
        client_id: ctx.clientId,
        run_id: ctx.run.id,
        brief_version: ctx.brief.version,
        dossier: dossier as unknown as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" },
    )
    return { output: { dossier, pages: pages.map((p) => p.url) } as unknown as Json, usage }
  })
  const [d] = await outputsOf<{ dossier: Dossier }>(ctx, "dossier")
  ctx.dossier = d?.output?.dossier ?? null
  if (!ctx.dossier) throw new StopRun("Couldn't build the client dossier.")
}

// ---------------------------------------------------------------------------
// Step 2 · where the client needs to rank (web search)
// ---------------------------------------------------------------------------

const blocked = (ctx: Ctx) => [ctx.domain, ...Object.values(ctx.competitors).flat().map((c) => c.domain)].filter((d): d is string => Boolean(d))

async function stageRanking(ctx: Ctx) {
  await ensureTasks(
    ctx,
    ctx.markets.map((m) => ({ stage: 2, kind: "ranking", key: `ranking:${m.id}`, input: { market: m.id } })),
  )
  await runStage(
    ctx,
    2,
    async (task) => {
      const m = ctx.markets.find((x) => x.id === (task.input as Rec).market)
      if (!m) return { output: {}, status: "skipped" }
      const usage: CallUsage[] = []
      const r = await claudeResearch(ctx.db, {
        system: P.system(["SEARCH_INTENT"], client(ctx)),
        prompt: P.rankingPrompt(m),
        ctx: callCtx(ctx, 2, task.id),
        maxSearches: SEARCHES.ranking,
        location: { country: m.countryIso, city: m.city, region: m.kind === "region" ? m.region : null },
        maxTokens: 6000,
      })
      usage.push(r.usage)
      const parsed = (await parseResearch(ctx, 2, task.id, RankingSchema, P.SHAPES.ranking, r.text, usage)) as Ranking | null
      const results = (parsed?.results ?? []).filter((x) => fromSources(x.url, r.sources)).slice(0, 40)
      return { output: { queries: (parsed?.queries ?? []).slice(0, 6), results } as unknown as Json, usage }
    },
    { concurrency: LIMITS.concurrency, searchesPerTask: () => SEARCHES.ranking },
  )
}

// ---------------------------------------------------------------------------
// Step 3 · competitors per market
// ---------------------------------------------------------------------------

async function stageCompetitors(ctx: Ctx) {
  const rankings = await outputsOf<Ranking>(ctx, "ranking")
  await ensureTasks(
    ctx,
    ctx.markets.map((m) => ({ stage: 3, kind: "competitors", key: `competitors:${m.id}`, input: { market: m.id } })),
  )
  await runStage(
    ctx,
    3,
    async (task) => {
      const m = ctx.markets.find((x) => x.id === (task.input as Rec).market)
      const ranking = rankings.find((r) => r.key === `ranking:${m?.id}`)?.output
      if (!m || !ranking) return { output: { competitors: [] }, status: "skipped" }
      const rows = ranking.results
        .filter((x) => x.kind === "direct_competitor" || x.kind === "other")
        .map((x, i) => ({ id: `r${i + 1}`, domain: domainOf(x.url) ?? "", title: x.title, query: x.query, kind: x.kind }))
        .filter((x) => x.domain && x.domain !== ctx.domain)
        .slice(0, 30)
      if (rows.length === 0) return { output: { competitors: [] } }
      const r = await claudeJsonWithUsage(ctx.db, {
        schema: CompetitorsSchema,
        system: P.system(["SEARCH_INTENT"], client(ctx)),
        prompt: P.competitorsPrompt(m, rows),
        ...callCtx(ctx, 3, task.id),
        maxTokens: 2000,
      })
      const known = new Set(rows.map((x) => x.domain))
      const competitors = r.data.competitors
        .map((c) => ({ domain: registrableDomain(c.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]), name: c.name.slice(0, 80), why: c.why.slice(0, 160) }))
        .filter((c) => known.has(c.domain) && c.domain !== ctx.domain)
        .slice(0, 5)
      return { output: { competitors } as unknown as Json, usage: [r.usage] }
    },
    { concurrency: LIMITS.concurrency },
  )
  const outs = await outputsOf<{ competitors: { domain: string; name: string }[] }>(ctx, "competitors")
  for (const o of outs) ctx.competitors[String(o.input.market)] = o.output?.competitors ?? []
  ctx.counts.competitors = Object.values(ctx.competitors).flat().length
  await ctx.db
    .from("ai_client_dossiers")
    .update({
      ranking_map: ctx.markets.map((m) => {
        const r = rankings.find((x) => x.key === `ranking:${m.id}`)?.output
        return {
          market: m.id,
          label: m.label,
          queries: r?.queries ?? [],
          lists: (r?.results ?? []).filter((x) => x.can_get_listed && x.kind !== "direct_competitor").slice(0, 8),
        }
      }) as unknown as Json,
      competitors: ctx.markets.map((m) => ({ market: m.id, label: m.label, competitors: ctx.competitors[m.id] ?? [] })) as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", ctx.clientId)
}

function domainOf(url: string) {
  const h = safeHost(url)
  return h ? registrableDomain(h) : null
}

// ---------------------------------------------------------------------------
// Step 4 · research link sources (web search)
// ---------------------------------------------------------------------------

async function stageResearch(ctx: Ctx) {
  const plan = planAiSearch({
    markets: ctx.markets,
    brief: ctx.brief,
    disabled: ctx.disabled,
    maxSearches: ctx.caps.maxSearches,
    searchPrice: ctx.caps.searchPrice,
  })
  ctx.counts.dropped_categories = plan.dropped.length
  const stage4 = plan.tasks.filter((t) => t.stage === 4)
  await ensureTasks(
    ctx,
    stage4.map((t) => ({ stage: 4, kind: t.kind, key: t.key, input: { market: t.marketId, category: t.category, searches: t.searches } })),
  )
  const brandNames = ctx.dossier?.brand_names?.length ? ctx.dossier.brand_names : [ctx.name]
  await runStage(
    ctx,
    4,
    async (task) => {
      const input = task.input as { market: string | null; category: CategoryKey | null; searches: number }
      const m = input.market ? ctx.markets.find((x) => x.id === input.market) : null
      let prompt: string
      let knowledge: (keyof typeof import("./knowledge").KNOWLEDGE)[] = ["LINK_TACTICS", "TOXIC_SIGNALS"]
      if (task.kind === "research" && m && input.category) {
        prompt = P.researchPrompt(input.category, m, input.searches)
        if (input.category === "local_citations") knowledge = ["LINK_TACTICS", "LOCAL_CITATIONS"]
        if (input.category === "industry_directories" || input.category === "reviews_marketplaces")
          knowledge = ["LINK_TACTICS", "DIRECTORY_TIERS", "LOCAL_CITATIONS"]
        if (input.category === "communities") knowledge = ["LINK_TACTICS", "AI_CITATION_SURFACES"]
      } else if (task.kind === "footprint" && m) {
        const comps = ctx.competitors[m.id] ?? []
        if (!comps.length) return { output: { items: [] }, status: "skipped" }
        prompt = P.footprintPrompt(m, comps, input.searches)
      } else if (task.kind === "buyer_questions" && m) {
        prompt = P.buyerQuestionsPrompt(m, input.searches)
        knowledge = ["LINK_TACTICS", "AI_CITATION_SURFACES"]
      } else if (task.kind === "mentions") {
        prompt = P.mentionsPrompt(brandNames, ctx.domain, input.searches)
      } else {
        return { output: { items: [] }, status: "skipped" }
      }
      const usage: CallUsage[] = []
      const r = await claudeResearch(ctx.db, {
        system: P.system(knowledge, client(ctx)),
        prompt,
        ctx: callCtx(ctx, 4, task.id),
        maxSearches: input.searches,
        location: m ? { country: m.countryIso, city: m.city, region: m.kind === "region" ? m.region : null } : null,
        // The client's own site is blocked for every task except mentions (which must exclude it by itself).
        blockedDomains: task.kind === "mentions" ? [] : blocked(ctx),
        maxTokens: 5000,
      })
      usage.push(r.usage)
      const parsed = (await parseResearch(ctx, 4, task.id, CandidatesSchema, P.SHAPES.candidates, r.text, usage)) as Candidates | null
      const items = (parsed?.items ?? []).filter((x) => fromSources(x.url, r.sources)).slice(0, LIMITS.candidatesPerTask)
      return { output: { items, queries: r.queries } as unknown as Json, usage }
    },
    { concurrency: LIMITS.concurrency, searchesPerTask: (t) => num((t.input as Rec).searches, SEARCHES.research) },
  )
}

// ---------------------------------------------------------------------------
// Step 5 · merge and clean (code only)
// ---------------------------------------------------------------------------

const SOCIAL_PROFILE = /(^|\.)((instagram|tiktok|pinterest)\.com)$|^(x|twitter)\.com$/i
const KIND_CATEGORY: Partial<Record<string, CategoryKey>> = {
  best_of_list: "best_of_lists",
  directory: "industry_directories",
  review_site: "reviews_marketplaces",
  marketplace: "reviews_marketplaces",
  publisher: "niche_publications",
  association: "associations",
  forum: "communities",
  government: "local_citations",
}
const FINDER_CATEGORY: Partial<Record<string, CategoryKey>> = {
  footprint: "best_of_lists",
  buyer_questions: "best_of_lists",
  mentions: "niche_publications",
}

type Merged = {
  siteKey: string
  domain: string
  name: string
  url: string
  title: string
  category: CategoryKey
  type: DirectoryType
  markets: Set<string>
  foundBy: Set<string>
  evidence: { quote: string; url: string; query: string; finder: string; why?: string; action?: string }[]
  status: "reserve" | "filtered"
  filterReason: string | null
}

async function stageMerge(ctx: Ctx) {
  await ensureTasks(ctx, [{ stage: 5, kind: "merge", key: "merge" }])
  await runStage(ctx, 5, async () => {
    const competitorDomains = new Set(Object.values(ctx.competitors).flat().map((c) => c.domain))
    const exclude = ctx.brief.exclude_terms.map((t) => t.toLowerCase()).filter(Boolean)
    const merged = new Map<string, Merged>()
    const priority = (c: CategoryKey) => CATEGORIES.findIndex((x) => x.key === c)

    const add = (raw: {
      url: string
      title: string
      category: CategoryKey
      market: string | null
      finder: FinderKey | CategoryKey
      quote: string
      query: string
      why?: string
      action?: string
    }) => {
      const sk = siteKeyOf(raw.url)
      if (!sk) return
      const existing = merged.get(sk.siteKey)
      const evidence = { quote: raw.quote.slice(0, 300), url: raw.url.slice(0, 500), query: raw.query.slice(0, 200), finder: raw.finder, why: raw.why?.slice(0, 200), action: raw.action }
      if (existing) {
        if (raw.market) existing.markets.add(raw.market)
        existing.foundBy.add(raw.finder)
        if (existing.evidence.length < 8) existing.evidence.push(evidence)
        if (priority(raw.category) < priority(existing.category)) {
          existing.category = raw.category
          existing.type = CATEGORY[raw.category].type
        }
        // Prefer a specific page over a homepage.
        if (/^https?:\/\/[^/]+\/?$/.test(existing.url) && !/^https?:\/\/[^/]+\/?$/.test(raw.url)) {
          existing.url = raw.url
          existing.title = raw.title
        }
        return
      }
      let status: Merged["status"] = "reserve"
      let filterReason: string | null = null
      const text = `${raw.title} ${raw.why ?? ""}`.toLowerCase()
      if (ctx.domain && (sk.domain === ctx.domain || sk.domain.endsWith(`.${ctx.domain}`))) {
        status = "filtered"
        filterReason = "own_site"
      } else if (competitorDomains.has(sk.domain)) {
        status = "filtered"
        filterReason = "competitor"
      } else if (SOCIAL_PROFILE.test(sk.host) || /linkedin\.com\/in\//i.test(raw.url)) {
        status = "filtered"
        filterReason = "social_profile"
      } else if (exclude.some((t) => text.includes(t))) {
        status = "filtered"
        filterReason = "excluded_term"
      }
      merged.set(sk.siteKey, {
        siteKey: sk.siteKey,
        domain: sk.domain,
        name: (raw.title || sk.host).slice(0, 200),
        url: raw.url,
        title: raw.title.slice(0, 300),
        category: raw.category,
        type: CATEGORY[raw.category].type,
        markets: new Set(raw.market ? [raw.market] : []),
        foundBy: new Set([raw.finder]),
        evidence: [evidence],
        status,
        filterReason,
      })
    }

    for (const r of await outputsOf<Ranking>(ctx, "ranking")) {
      for (const x of r.output?.results ?? []) {
        const category = KIND_CATEGORY[x.kind]
        if (!x.can_get_listed || !category) continue
        add({ url: x.url, title: x.title, category, market: String(r.input.market), finder: "ranking", quote: x.title, query: x.query })
      }
    }
    for (const kind of ["research", "footprint", "buyer_questions", "mentions"] as const) {
      for (const r of await outputsOf<Candidates>(ctx, kind)) {
        const category = (r.input.category as CategoryKey | null) ?? FINDER_CATEGORY[kind] ?? "best_of_lists"
        const finder = kind === "research" ? category : kind === "footprint" ? "competitor_footprint" : kind
        for (const x of r.output?.items ?? []) {
          add({
            url: x.url,
            title: x.title,
            category,
            market: (r.input.market as string | null) ?? null,
            finder,
            quote: x.quote,
            query: x.query,
            why: x.why,
            action: x.action,
          })
        }
      }
    }

    // Cap per category and market, then overall, by how many angles found the site.
    const all = [...merged.values()].sort((a, b) => b.foundBy.size - a.foundBy.size || priority(a.category) - priority(b.category))
    const perBucket = new Map<string, number>()
    const kept: Merged[] = []
    for (const m of all) {
      if (m.status === "filtered") {
        kept.push(m)
        continue
      }
      const bucket = `${m.category}:${[...m.markets][0] ?? "any"}`
      const n = perBucket.get(bucket) ?? 0
      if (n >= LIMITS.perCategoryMarket) continue
      perBucket.set(bucket, n + 1)
      kept.push(m)
    }
    const live = kept.filter((m) => m.status !== "filtered").slice(0, LIMITS.maxCandidates)
    const hidden = kept.filter((m) => m.status === "filtered").slice(0, 100)
    const items = [...live, ...hidden].map((m) => ({
      site_key: m.siteKey,
      domain: m.domain,
      rank_target: m.domain,
      name: m.name,
      type: m.type,
      category: m.category,
      found_by: [...m.foundBy],
      target_ids: [...m.markets],
      page_url: m.url,
      page_title: m.title,
      evidence: m.evidence,
      status: m.status,
      filter_reason: m.filterReason,
    }))
    let stored = 0
    let fresh = 0
    for (let i = 0; i < items.length; i += 100) {
      const { data, error } = await ctx.db.rpc("dfs_store_ai_prospects", { p_run_id: ctx.run.id, p_items: items.slice(i, i + 100) as unknown as Json })
      if (error) throw new Error(`Could not save the places found: ${error.message}`)
      stored += items.slice(i, i + 100).length
      fresh += num((data as Rec | null)?.new)
    }
    ctx.counts.candidates = live.length
    ctx.counts.filtered_early = hidden.length
    ctx.counts.new = fresh
    return { output: { stored, live: live.length, hidden: hidden.length } }
  })
}

// ---------------------------------------------------------------------------
// Step 6 · verify the pages (our fetcher + Haiku reads them in batches)
// ---------------------------------------------------------------------------

type ProspectRow = Tables<"ai_link_prospects"> & { directory: { site_key: string; domain: string } | null }

async function runProspects(ctx: Ctx, opts: { verifiedOnly?: boolean } = {}) {
  const { data, error } = await ctx.db
    .from("ai_link_prospects")
    .select("*, directory:directories(site_key, domain)")
    .eq("client_id", ctx.clientId)
    .eq("last_run_id", ctx.run.id)
    .is("decided_by", null)
    .neq("status", "filtered")
    .order("created_at")
    .limit(400)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as ProspectRow[]
  return opts.verifiedOnly ? rows.filter((r) => (r.verification as Rec)?.checked_at) : rows
}

const filteredFor = (status: string, flags: RedFlag[], definite: boolean): string | null => {
  if (status === "unresolvable" || status === "unsafe") return "ai_invented"
  if (status === "gone") return "gone"
  if (definite) return "spam"
  return null
}

async function stageVerify(ctx: Ctx) {
  const prospects = await runProspects(ctx)
  const ids = prospects.map((p) => p.id)
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += LIMITS.pageReadBatch) batches.push(ids.slice(i, i + LIMITS.pageReadBatch))
  await ensureTasks(
    ctx,
    batches.map((b, i) => ({ stage: 6, kind: "page_read", key: `verify:${i + 1}`, input: { ids: b } })),
  )
  const languageFor = (p: ProspectRow) => {
    const m = ctx.markets.find((x) => p.target_ids.includes(x.id)) ?? ctx.markets[0]
    return m?.language.code ?? null
  }
  await runStage(
    ctx,
    6,
    async (task) => {
      const batchIds = ((task.input as Rec).ids as string[]) ?? []
      const rows = prospects.filter((p) => batchIds.includes(p.id) && p.page_url)
      const pages = await fetchMany(rows, (r) => r.page_url!, LIMITS.fetchConcurrency)
      const readable = rows.filter((r) => {
        const s = pages.get(r)!.status
        return s === "ok" || s === "js_only"
      })
      const usage: CallUsage[] = []
      let reads: PageRead["items"] = []
      if (readable.length) {
        const idOf = new Map(readable.map((r, i) => [`p${i + 1}`, r]))
        try {
          const r = await claudeJsonWithUsage(ctx.db, {
            schema: PageReadSchema,
            system: P.system(["LINK_TACTICS", "TOXIC_SIGNALS"], client(ctx)),
            prompt: P.pageReadPrompt(
              readable.map((row, i) => {
                const pg = pages.get(row)!
                return {
                  id: `p${i + 1}`,
                  url: pg.finalUrl ?? row.page_url!,
                  title: pg.title,
                  lang: pg.lang,
                  text: pg.text.slice(0, 3500),
                  actions: pg.actionLinks.map((a) => `${a.label} → ${a.url}`).join("; ").slice(0, 600),
                  outbound: `${pg.outbound.total} (${pg.outbound.dofollow} followed, ${pg.outbound.nofollow} nofollow/sponsored)${pg.pageNofollow ? ", page is nofollow" : ""}`,
                }
              }),
            ),
            ...callCtx(ctx, 6, task.id),
            maxTokens: 6000,
          })
          usage.push(r.usage)
          reads = r.data.items.filter((x) => idOf.has(x.id))
          for (const x of reads) (x as PageRead["items"][number] & { row?: ProspectRow }).row = idOf.get(x.id)
        } catch (e) {
          if (e instanceof ClaudeError && e.kind === "not_configured") throw e
          console.warn("[ai-search] page read failed", task.key, e instanceof Error ? e.message : e)
        }
      }
      let hidden = 0
      for (const row of rows) {
        const pg = pages.get(row)!
        const market = languageFor(row)
        const checks = checkPage(pg, market)
        const read = reads.find((x) => (x as { row?: ProspectRow }).row === row)
        const allowed = new Set([...pg.actionLinks.map((a) => a.url), ...pg.internalLinks.map((a) => a.url)])
        const quoteOk = read ? quoteOnPage(read.quote, pg.text) : false
        const verification = {
          checked_at: new Date().toISOString(),
          status: pg.status,
          http: pg.httpStatus,
          final_url: pg.finalUrl,
          title: pg.title,
          lang: pg.lang,
          words: pg.words,
          outbound: pg.outbound,
          page_nofollow: pg.pageNofollow,
          has_form: pg.hasForm,
          flags: checks.flags,
          link_type: linkTypeOf(pg),
          page_kind: read?.page_kind ?? null,
          lists_businesses: read?.lists_businesses ?? null,
          action: read?.action?.slice(0, 200) ?? null,
          // Only links that are really on the page.
          submit_url: read?.submit_url && allowed.has(read.submit_url) ? read.submit_url : pg.actionLinks.find((a) => /submit|add|list|claim|join|apply|suggest|nominate/i.test(a.label))?.url ?? null,
          contact_url: read?.contact_url && (allowed.has(read.contact_url) || /^mailto:/i.test(read.contact_url)) ? read.contact_url : pg.actionLinks.find((a) => /contact|email/i.test(a.label))?.url ?? null,
          updated: read?.updated ?? null,
          quote: read?.quote && quoteOk ? read.quote.slice(0, 300) : null,
          authority: read?.authority ?? null,
          ai_flags: (read?.red_flags ?? []).slice(0, 6),
        }
        const reason = filteredFor(pg.status, checks.flags, checks.definite)
        const update: Database["public"]["Tables"]["ai_link_prospects"]["Update"] = {
          verification: verification as unknown as Json,
          link_type: verification.link_type,
          authority: read?.authority ?? null,
          updated_at: new Date().toISOString(),
        }
        if (reason) {
          update.status = "filtered"
          update.filter_reason = reason
          hidden++
        } else if (checks.flags.includes("language_mismatch") && !ctx.brief.reach.includes("global")) {
          update.status = "filtered"
          update.filter_reason = "language_mismatch"
          hidden++
        }
        await ctx.db.from("ai_link_prospects").update(update).eq("id", row.id).is("decided_by", null)
      }
      ctx.counts.verified = num(ctx.counts.verified) + rows.length
      ctx.counts.hidden_by_checks = num(ctx.counts.hidden_by_checks) + hidden
      return { output: { checked: rows.length, read: reads.length, hidden }, usage }
    },
    { concurrency: 2 },
  )
}

// ---------------------------------------------------------------------------
// Step 8 · judge each candidate
// ---------------------------------------------------------------------------

function compactRow(id: string, p: ProspectRow, ctx: Ctx) {
  const v = (p.verification ?? {}) as Rec
  const ev = (p.evidence as { quote?: string; query?: string; why?: string }[] | null) ?? []
  const markets = ctx.markets.filter((m) => p.target_ids.includes(m.id)).map((m) => m.label).join(", ")
  return [
    `${id} · ${p.directory?.site_key ?? ""} · ${p.page_title ?? ""}`,
    `category: ${p.category}; markets: ${markets || "any"}; found by: ${p.found_by.join(", ")}`,
    `why found: ${ev.map((e) => e.why).filter(Boolean).slice(0, 2).join(" | ") || "—"}`,
    `evidence: ${ev.map((e) => e.quote).filter(Boolean).slice(0, 2).join(" | ").slice(0, 300) || "—"}`,
    `page: ${v.status ?? "unchecked"}; kind ${v.page_kind ?? "?"}; lists businesses ${v.lists_businesses ?? "?"}; way in: ${v.submit_url ? "submission link" : v.contact_url ? "contact" : v.has_form ? "a form" : "none seen"}; link type ${p.link_type ?? "unknown"}; authority ${p.authority ?? "?"}/5`,
    `flags: ${[...((v.flags as string[]) ?? []), ...((v.ai_flags as string[]) ?? [])].join(", ") || "none"}`,
    v.action ? `to get on it: ${String(v.action).slice(0, 160)}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function fitOf(j: Judgement["items"][number], p: ProspectRow) {
  const v = (p.verification ?? {}) as Rec
  const flags = (v.flags as string[]) ?? []
  let fit = (100 * (0.35 * j.relevant + 0.2 * j.real + 0.15 * j.reachable + 0.15 * j.worth_it)) / 5
  if (p.found_by.length >= 2) fit += 10
  if (p.found_by.includes("competitor_footprint") || p.found_by.includes("ranking")) fit += 5
  if (p.authority) fit += (p.authority - 3) * 3
  if (flags.includes("link_farm") || flags.includes("sells_posts")) fit -= 25
  if (j.cost_type === "paid_only" || flags.includes("paid_only")) fit -= 15
  if (flags.includes("thin")) fit -= 5
  if (v.status && v.status !== "ok") fit -= 5
  return Math.max(0, Math.min(100, Math.round(fit)))
}

async function stageJudge(ctx: Ctx) {
  const prospects = await runProspects(ctx)
  const ids = prospects.map((p) => p.id)
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += LIMITS.judgeBatch) batches.push(ids.slice(i, i + LIMITS.judgeBatch))
  await ensureTasks(
    ctx,
    batches.map((b, i) => ({ stage: 8, kind: "judge", key: `judge:${i + 1}`, input: { ids: b } })),
  )
  await runStage(
    ctx,
    8,
    async (task) => {
      const batchIds = ((task.input as Rec).ids as string[]) ?? []
      const rows = prospects.filter((p) => batchIds.includes(p.id))
      if (!rows.length) return { output: { judged: 0 }, status: "skipped" }
      const idOf = new Map(rows.map((r, i) => [`c${i + 1}`, r]))
      const r = await claudeJsonWithUsage(ctx.db, {
        schema: JudgementSchema,
        system: P.system(["LINK_TACTICS", "TOXIC_SIGNALS"], client(ctx)),
        prompt: P.judgePrompt(rows.map((p, i) => compactRow(`c${i + 1}`, p, ctx))),
        ...callCtx(ctx, 8, task.id),
        effort: "medium",
        maxTokens: 8000,
      })
      let judged = 0
      for (const j of r.data.items) {
        const p = idOf.get(j.id)
        if (!p) continue
        judged++
        await ctx.db
          .from("ai_link_prospects")
          .update({
            scores: { relevant: j.relevant, real: j.real, reachable: j.reachable, worth_it: j.worth_it, notes: j.notes.slice(0, 400) },
            verdict: j.verdict,
            reason: j.reason.slice(0, 200),
            action: j.action.slice(0, 200),
            effort: j.effort,
            cost_type: j.cost_type,
            fit: fitOf(j, p),
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.id)
          .is("decided_by", null)
      }
      return { output: { judged }, usage: [r.usage] }
    },
    { concurrency: LIMITS.concurrency },
  )
}

// ---------------------------------------------------------------------------
// Step 9 · pick the top 30
// ---------------------------------------------------------------------------

const REJECT_VERDICT: Record<string, string> = {
  competitor: "competitor",
  irrelevant: "ai_rejected",
  paid_link_seller: "spam",
  spam: "spam",
  not_a_link_opportunity: "not_reachable",
}

async function stagePick(ctx: Ctx): Promise<{ review: number; more: number; hidden: number; ai: string }> {
  await ensureTasks(ctx, [{ stage: 9, kind: "editor", key: "pick" }])
  let summary = { review: 0, more: 0, hidden: 0, ai: "used" }
  await runStage(ctx, 9, async (task) => {
    const prospects = await runProspects(ctx)
    const keeps = prospects
      .filter((p) => p.verdict === "keep" || (!p.verdict && p.fit === null))
      .sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0))
    // Rules first: a varied pool of the best 60.
    const pool: ProspectRow[] = []
    const perCat = new Map<string, number>()
    let paid = 0
    for (const p of keeps) {
      if (pool.length >= LIMITS.editorPool) break
      const n = perCat.get(p.category) ?? 0
      if (n >= LIMITS.maxPerCategoryInTop * 2) continue
      if (p.cost_type === "paid_only") {
        if (paid >= LIMITS.maxPaidInTop * 2) continue
        paid++
      }
      perCat.set(p.category, n + 1)
      pool.push(p)
    }
    const usage: CallUsage[] = []
    let ranked: { p: ProspectRow; rank: number; reason: string | null }[] = []
    if (pool.length) {
      const idOf = new Map(pool.map((p, i) => [`c${i + 1}`, p]))
      try {
        const r = await claudeJsonWithUsage(ctx.db, {
          schema: PicksSchema,
          system: P.system(["LINK_TACTICS"], client(ctx)),
          prompt: P.editorPrompt(
            pool.map((p, i) => `c${i + 1} · ${p.directory?.site_key} · ${p.category} · fit ${p.fit ?? "?"} · ${p.effort ?? "?"} · ${p.cost_type ?? "?"} · ${p.link_type ?? "?"} · ${p.reason ?? p.page_title ?? ""}`),
            AI_REVIEW_CAP,
          ),
          ...callCtx(ctx, 9, task.id),
          effort: "medium",
          maxTokens: 4000,
        })
        usage.push(r.usage)
        const seen = new Set<string>()
        ranked = r.data.picks
          .filter((x) => idOf.has(x.id) && !seen.has(x.id) && seen.add(x.id))
          .sort((a, b) => a.pick_rank - b.pick_rank)
          .slice(0, AI_REVIEW_CAP)
          .map((x, i) => ({ p: idOf.get(x.id)!, rank: i + 1, reason: x.reason.slice(0, 200) }))
      } catch (e) {
        if (e instanceof ClaudeError && e.kind === "not_configured") throw e
        summary.ai = "rules"
      }
      // Rules fill in (or pick everything) when the editor returned fewer.
      if (ranked.length < Math.min(AI_REVIEW_CAP, pool.length)) {
        const picked = new Set(ranked.map((x) => x.p.id))
        const cat = new Map<string, number>()
        for (const x of ranked) cat.set(x.p.category, (cat.get(x.p.category) ?? 0) + 1)
        for (const p of pool) {
          if (ranked.length >= AI_REVIEW_CAP) break
          if (picked.has(p.id) || (cat.get(p.category) ?? 0) >= LIMITS.maxPerCategoryInTop) continue
          cat.set(p.category, (cat.get(p.category) ?? 0) + 1)
          ranked.push({ p, rank: ranked.length + 1, reason: null })
        }
      }
    }
    const pickedIds = new Map(ranked.map((x) => [x.p.id, x]))
    const items = prospects.map((p) => {
      const pick = pickedIds.get(p.id)
      const rejected = p.verdict ? REJECT_VERDICT[p.verdict] : undefined
      return {
        id: p.id,
        status: pick ? "pending_review" : rejected ? "filtered" : "reserve",
        shortlist_rank: pick?.rank ?? null,
        filter_reason: rejected ?? null,
        fit: p.fit ?? 0,
        authority: p.authority,
        verdict: p.verdict,
        reason: pick?.reason ?? p.reason,
        action: p.action,
        effort: p.effort,
        cost_type: p.cost_type,
        link_type: p.link_type,
        scores: p.scores,
      }
    })
    const { data, error } = await ctx.db.rpc("dfs_apply_ai_shortlist", { p_run_id: ctx.run.id, p_items: items as unknown as Json })
    if (error) throw new Error(`Couldn't save the top 30: ${error.message}`)
    const d = (data ?? {}) as Rec
    summary = { review: num(d.review), more: num(d.more), hidden: num(d.hidden), ai: summary.ai }
    return { output: summary as unknown as Json, usage }
  })
  const [o] = await outputsOf<typeof summary>(ctx, "editor")
  return o?.output ?? summary
}

/** For the dialog: the plan and estimate (no side effects). */
export { planAiSearch, type PlannedTask }

/** Used in quote checks elsewhere. */
export const _internal = { norm }
