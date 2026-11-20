import "server-only"

import { ClaudeError, claudeJsonWithUsage, claudeResearch, type CallUsage } from "@/lib/ai/claude"
import { BacklinksAccessError } from "@/lib/dataforseo/backlinks"
import type { Db } from "@/lib/dataforseo/client"
import { hasAnthropicKey, hasDataForSeo } from "@/lib/env.server"
import type { Database, Json, Tables } from "@/lib/supabase/database.types"
import { snapshotOf, type BriefSnapshot } from "../brief"
import type { DirectoryType } from "../constants"
import { registrableDomain, siteKeyOf } from "../site-key"
import { checkPage, linkTypeOf, type RedFlag } from "./checks"
import { cleanDomain, MIN_COMPETITORS, pickCompetitors, type CompetitorOption } from "./competitors"
import {
  AI_REVIEW_CAP,
  CATEGORIES,
  CATEGORY,
  GAP_CATEGORY,
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
import { competitorGap, GAP_SPAM_LIMIT, labsCompetitors, type GapLink, type GapSite } from "./gap"
import { norm, parseWith, quoteOnPage } from "./parse"
import * as P from "./prompts"
import {
  CandidatesSchema,
  CompetitorsSchema,
  DossierSchema,
  InsightsSchema,
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
 *
 * Competitor backlinks (docs/plans/backlinks/11-competitor-backlinks.md): a "competitors" run
 * reuses the dossier, picks the top 5 competitors (step 3) and pulls the sites that link to them
 * from DataForSEO (step 4, or AI searches of their names when DataForSEO can't be used). A full
 * run does the same when its switch is on. Insights come after judging (step 8).
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
  kind: "full" | "competitors"
  /** Competitor backlinks: on for "competitors" runs, and for full runs with the switch on. */
  gap: GapOptions | null
  gapCompetitors: { domain: string; name: string }[]
}

type GapOptions = {
  requested: string[]
  minShared: number
  includeSingle: boolean
  maxSites: number
  refresh: boolean
  useDfs: boolean
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
    kind: run.kind === "competitors" ? "competitors" : "full",
    gap:
      run.kind === "competitors" || options.gap === true
        ? {
            requested: (run.competitors ?? []).map((d) => cleanDomain(d)).filter((d): d is string => Boolean(d)),
            minShared: Math.min(5, Math.max(1, num(options.min_shared, num(caps.gap_min_shared, 2)))),
            includeSingle: options.include_single === true,
            maxSites: Math.min(500, Math.max(20, num(options.max_sites, num(caps.gap_max_sites, 150)))),
            refresh: options.refresh === true,
            useDfs: options.use_dataforseo !== false,
          }
        : null,
    gapCompetitors: [],
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
  opts: { concurrency?: number; searchesPerTask?: (t: Task) => number; kinds?: string[] } = {},
) {
  await ctx.db.from("ai_search_runs").update({ stage }).eq("id", ctx.run.id)
  // A stage can hold tasks of several steps (research and the link gap share step 4).
  const queue = (await tasksOf(ctx, stage)).filter((t) => t.status === "queued" && (!opts.kinds || opts.kinds.includes(t.kind)))
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
    if (ctx.kind === "full") {
      await stageRanking(ctx)
      await stageCompetitors(ctx)
    }
    if (ctx.gap) await stageGapCompetitors(ctx)
    if (ctx.kind === "full") await stageResearch(ctx)
    if (ctx.gap) await stageGap(ctx)
    await stageMerge(ctx)
    await stageVerify(ctx)
    await stageJudge(ctx)
    if (ctx.gap) await stageInsights(ctx)
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
      meta: {
        review: result.review,
        more: result.more,
        hidden: result.hidden,
        cost: Math.round(cost * 100) / 100,
        kind: ctx.kind,
        gap_sites: num(ctx.counts.gap_sites),
      } as Json,
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
    // A competitor backlinks run reuses a recent dossier made from the same brief.
    if (ctx.kind === "competitors") {
      const { data: saved } = await ctx.db
        .from("ai_client_dossiers")
        .select("dossier, brief_version, updated_at")
        .eq("client_id", ctx.clientId)
        .maybeSingle()
      if (saved?.dossier && saved.brief_version === ctx.brief.version && Date.now() - new Date(saved.updated_at).getTime() < 30 * 86_400_000) {
        return { output: { dossier: saved.dossier, pages: [], reused: true } as unknown as Json }
      }
    }
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

const blocked = (ctx: Ctx) =>
  [...new Set([ctx.domain, ...Object.values(ctx.competitors).flat().map((c) => c.domain), ...ctx.gapCompetitors.map((c) => c.domain)])].filter(
    (d): d is string => Boolean(d),
  )

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
    { concurrency: LIMITS.concurrency, kinds: ["competitors"] },
  )
  const outs = await outputsOf<{ competitors: { domain: string; name: string }[] }>(ctx, "competitors")
  for (const o of outs) ctx.competitors[String(o.input.market)] = o.output?.competitors ?? []
  ctx.counts.competitors = Object.values(ctx.competitors).flat().length
  // Saved as suggestions for the Competitors card (the first 5 become active if none are yet).
  if (!ctx.gap) {
    const seen = new Map<string, { domain: string; name: string; markets: number }>()
    for (const c of Object.values(ctx.competitors).flat()) {
      const e = seen.get(c.domain)
      if (e) e.markets++
      else seen.set(c.domain, { domain: c.domain, name: c.name, markets: 1 })
    }
    const ranked = [...seen.values()].sort((a, b) => b.markets - a.markets)
    if (ranked.length) {
      const { error } = await ctx.db.rpc("dfs_save_found_competitors", {
        p_client_id: ctx.clientId,
        p_items: ranked.map((f) => ({ domain: f.domain, name: f.name, evidence: { markets: f.markets, run: ctx.run.id } })) as unknown as Json,
        p_source: "ai",
      })
      if (error) console.warn("[ai-search] couldn't save competitors", error.message)
    }
  }
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
    {
      concurrency: LIMITS.concurrency,
      searchesPerTask: (t) => num((t.input as Rec).searches, SEARCHES.research),
      kinds: ["research", "footprint", "buyer_questions", "mentions"],
    },
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
  /** A CategoryKey, or "competitor_links" until the page check says what the page is. */
  category: string
  type: DirectoryType
  gap?: GapSite
  markets: Set<string>
  foundBy: Set<string>
  evidence: { quote: string; url: string; query: string; finder: string; why?: string; action?: string }[]
  status: "reserve" | "filtered"
  filterReason: string | null
}

async function stageMerge(ctx: Ctx) {
  await ensureTasks(ctx, [{ stage: 5, kind: "merge", key: "merge" }])
  await runStage(ctx, 5, async () => {
    const competitorDomains = new Set([...Object.values(ctx.competitors).flat(), ...ctx.gapCompetitors].map((c) => c.domain))
    const exclude = ctx.brief.exclude_terms.map((t) => t.toLowerCase()).filter(Boolean)
    const merged = new Map<string, Merged>()
    // Research categories win over "competitor_links" (it's refined from the page later).
    const priority = (c: string) => {
      const i = CATEGORIES.findIndex((x) => x.key === c)
      return i < 0 ? 99 : i
    }
    const typeOf = (c: string): DirectoryType => CATEGORY[c as CategoryKey]?.type ?? "other"

    const add = (raw: {
      url: string
      title: string
      category: string
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
          existing.type = typeOf(raw.category)
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
        type: typeOf(raw.category),
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

    // Competitor backlinks: DataForSEO's linking sites, each on the competitor's linking page.
    const [gapOut] = await outputsOf<{ mode: string; sites: GapSite[] }>(ctx, "gap")
    for (const site of gapOut?.output?.sites ?? []) {
      const best = [...site.links].sort((a, b) => linkScore(b) - linkScore(a))[0]
      const url = best?.url_from && /^https?:\/\//.test(best.url_from) ? best.url_from : `https://${site.domain}/`
      add({
        url,
        title: best?.title || site.domain,
        category: GAP_CATEGORY,
        market: null,
        finder: "competitor_links",
        quote: best?.text || best?.anchor || "",
        query: `links to ${site.competitors.join(", ")}`,
        why: `Links to ${site.shared} of ${ctx.gapCompetitors.length || site.shared} competitors`,
      })
      const sk = siteKeyOf(url)
      const m = sk ? merged.get(sk.siteKey) : undefined
      if (!m) continue
      m.gap = site
      m.url = url
      if (best?.title) m.title = best.title.slice(0, 300)
      if (m.status !== "filtered" && site.spam !== null && site.spam >= GAP_SPAM_LIMIT) {
        m.status = "filtered"
        m.filterReason = "spam"
      }
    }
    // AI-only estimate: pages that feature the competitors (mentions, not confirmed links).
    for (const r of await outputsOf<Candidates>(ctx, "gap_footprint")) {
      for (const x of r.output?.items ?? []) {
        add({
          url: x.url,
          title: x.title,
          category: GAP_CATEGORY,
          market: (r.input.market as string | null) ?? null,
          finder: "gap_footprint",
          quote: x.quote,
          query: x.query,
          why: x.why,
          action: x.action,
        })
      }
    }

    // Cap per category and market, then overall, by how many angles found the site.
    // Linking sites from DataForSEO are already capped (max sites per run), so they skip this.
    const all = [...merged.values()].sort(
      (a, b) => (b.gap?.shared ?? 0) - (a.gap?.shared ?? 0) || b.foundBy.size - a.foundBy.size || priority(a.category) - priority(b.category),
    )
    const perBucket = new Map<string, number>()
    const kept: Merged[] = []
    for (const m of all) {
      if (m.status === "filtered" || m.gap) {
        kept.push(m)
        continue
      }
      const bucket = `${m.category}:${[...m.markets][0] ?? "any"}`
      const n = perBucket.get(bucket) ?? 0
      if (n >= LIMITS.perCategoryMarket) continue
      perBucket.set(bucket, n + 1)
      kept.push(m)
    }
    const liveGap = kept.filter((m) => m.status !== "filtered" && m.gap)
    const live = [...liveGap, ...kept.filter((m) => m.status !== "filtered" && !m.gap).slice(0, LIMITS.maxCandidates)]
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
      shared_count: m.gap?.shared ?? null,
      competitor_links: m.gap?.links ?? [],
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
    ctx.counts.gap_candidates = liveGap.length
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

async function clientProspects(ctx: Ctx) {
  const { data, error } = await ctx.db
    .from("ai_link_prospects")
    .select("*, directory:directories(site_key, domain)")
    .eq("client_id", ctx.clientId)
    .is("decided_by", null)
    .in("status", ["pending_review", "reserve"])
    .order("fit", { ascending: false, nullsFirst: false })
    .limit(400)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ProspectRow[]
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
                  competitorLinks: competitorLinksLine(row),
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
          how_to_get: read?.how_to_get?.slice(0, 200) ?? null,
        }
        const reason = filteredFor(pg.status, checks.flags, checks.definite)
        const update: Database["public"]["Tables"]["ai_link_prospects"]["Update"] = {
          verification: verification as unknown as Json,
          link_type: verification.link_type,
          authority: read?.authority ?? null,
          updated_at: new Date().toISOString(),
        }
        // Competitor backlinks: is their link still on this page, and can the client copy it?
        const links = linksOf(row)
        const fromGap = links.length > 0 || row.found_by.includes("gap_footprint")
        if (links.length) {
          const samePage = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") === row.page_url!.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
          update.competitor_links = links.map((l) => ({
            ...l,
            still_there:
              pg.status === "ok" && samePage(l.url_from)
                ? pg.outboundHosts.some((h) => h === l.competitor || h.endsWith(`.${l.competitor}`))
                : (l.still_there ?? null),
          })) as unknown as Json
        }
        if (fromGap && read) {
          const replicability = read.link_kind === "client_credit" ? "no" : read.replicability
          update.link_kind = read.link_kind
          update.replicability = replicability
          const refined = KIND_CATEGORY[read.page_kind]
          if (row.category === GAP_CATEGORY && refined) update.category = refined
          if (!reason && replicability === "no") {
            update.status = "filtered"
            update.filter_reason = "not_replicable"
            hidden++
          }
        }
        if (reason) {
          update.status = "filtered"
          update.filter_reason = reason
          hidden++
        } else if (update.status === "filtered") {
          // Already hidden above (can't be copied).
        } else if (checks.flags.includes("language_mismatch") && !ctx.brief.reach.includes("global") && !links.length) {
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
    gapLine(p),
  ]
    .filter(Boolean)
    .join("\n")
}

/** "competitors linked: 3 of 5 (a.com, b.com, c.com); …" for the judge and the editor. */
function gapLine(p: ProspectRow) {
  const links = linksOf(p)
  if (!p.shared_count && !links.length) return ""
  const comps = [...new Set(links.map((l) => l.competitor))]
  const of = links.find((l) => l.of)?.of
  const still = links.some((l) => l.still_there === true) ? "yes" : links.length && links.every((l) => l.still_there === false) ? "no" : "unknown"
  return `competitors linked: ${p.shared_count ?? comps.length}${of ? ` of ${of}` : ""} (${comps.join(", ")}); link kind ${p.link_kind ?? "?"}; can copy: ${p.replicability ?? "?"}; their link still there: ${still}`
}

function linksOf(p: Pick<ProspectRow, "competitor_links">): GapLink[] {
  return Array.isArray(p.competitor_links) ? (p.competitor_links as unknown as GapLink[]) : []
}

function competitorLinksLine(p: ProspectRow): string | null {
  const links = linksOf(p)
  if (!links.length) return null
  return links
    .slice(0, 5)
    .map(
      (l) =>
        `${l.competitor}: "${(l.anchor ?? "").slice(0, 80)}" (${l.dofollow === false ? "nofollow" : "followed"}${l.location ? `, in ${l.location}` : ""}) on ${l.url_from}${l.text ? ` · "${l.text.slice(0, 200)}"` : ""}`,
    )
    .join("; ")
}

/** Which competitor link best shows how it was earned: in an article or listing over a footer. */
function linkScore(l: GapLink) {
  const loc = (l.location ?? "").toLowerCase()
  let n = 0
  if (/article|main|section|content|body/.test(loc)) n += 3
  if (/footer|aside|sidebar|nav|header|menu/.test(loc)) n -= 2
  if (l.dofollow) n += 1
  if (l.anchor) n += 0.5
  return n
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
  // Competitor backlinks: the more competitors a site links to, the more it matters.
  const shared = p.shared_count ?? 0
  if (shared >= 4) fit += 15
  else if (shared === 3) fit += 10
  else if (shared === 2) fit += 5
  const links = linksOf(p)
  if (links.some((l) => l.dofollow)) fit += 3
  if (p.replicability === "hard") fit -= 10
  if (links.length && links.every((l) => l.still_there === false)) fit -= 8
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
    { concurrency: LIMITS.concurrency, kinds: ["judge"] },
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
    // Every undecided place of the client (any run), so full and competitor runs share one top 30.
    const prospects = await clientProspects(ctx)
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
            pool.map(
              (p, i) =>
                `c${i + 1} · ${p.directory?.site_key} · ${p.category} · fit ${p.fit ?? "?"} · ${p.effort ?? "?"} · ${p.cost_type ?? "?"} · ${p.link_type ?? "?"}${p.shared_count ? ` · links to ${p.shared_count} competitors` : ""} · ${p.reason ?? p.page_title ?? ""}`,
            ),
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

// ---------------------------------------------------------------------------
// Competitor backlinks · step 3: the top 5 competitors
// ---------------------------------------------------------------------------

async function stageGapCompetitors(ctx: Ctx) {
  const g = ctx.gap!
  await ensureTasks(ctx, [{ stage: 3, kind: "gap_competitors", key: "gap_competitors" }])
  await runStage(
    ctx,
    3,
    async () => {
      const { data: saved } = await ctx.db
        .from("client_competitors")
        .select("domain, name, source, active, evidence")
        .eq("client_id", ctx.clientId)
      const savedList: CompetitorOption[] = (saved ?? []).map((c) => ({
        domain: c.domain,
        name: c.name,
        source: c.source as CompetitorOption["source"],
        active: c.active,
      }))
      const names = new Map(savedList.map((c) => [c.domain, c.name ?? c.domain]))

      // What this run's step 3 found per place (full runs), saved as suggestions for the team.
      const found = new Map<string, { domain: string; name: string; markets: number }>()
      for (const list of Object.values(ctx.competitors)) {
        for (const c of list) {
          const e = found.get(c.domain)
          if (e) e.markets++
          else found.set(c.domain, { domain: c.domain, name: c.name, markets: 1 })
        }
      }
      if (found.size) {
        await ctx.db.rpc("dfs_save_found_competitors", {
          p_client_id: ctx.clientId,
          p_items: [...found.values()]
            .sort((a, b) => b.markets - a.markets)
            .map((f) => ({ domain: f.domain, name: f.name, evidence: { markets: f.markets, run: ctx.run.id } })) as unknown as Json,
          p_source: "ai",
        })
        for (const f of found.values()) if (!names.has(f.domain)) names.set(f.domain, f.name)
      }

      let chosen = g.requested.slice(0, 5)
      if (chosen.length < MIN_COMPETITORS) {
        chosen = pickCompetitors({ saved: savedList, found: [...found.values()], clientDomain: ctx.domain })
      }
      // Still short: keyword-overlap competitors from DataForSEO Labs.
      let suggested = 0
      if (chosen.length < MIN_COMPETITORS && g.useDfs && hasDataForSeo() && ctx.domain) {
        try {
          const { data: countries } = await ctx.db
            .from("backlink_targets")
            .select("location_code, kind")
            .in("id", ctx.run.target_ids)
            .eq("kind", "country")
            .limit(1)
          const locationCode = countries?.[0]?.location_code ?? (ctx.markets.some((m) => m.countryIso === "US") ? 2840 : null)
          if (locationCode) {
            const labs = await labsCompetitors(
              ctx.db,
              { domain: ctx.domain, locationCode, languageCode: ctx.markets[0]?.language.code ?? null },
              { clientId: ctx.clientId, ref: ctx.run.id },
            )
            suggested = labs.length
            if (labs.length) {
              await ctx.db.rpc("dfs_save_found_competitors", {
                p_client_id: ctx.clientId,
                p_items: labs.map((l) => ({ domain: l.domain, evidence: { keywords_shared: l.intersections } })) as unknown as Json,
                p_source: "dataforseo",
              })
              chosen = pickCompetitors({
                saved: savedList,
                found: [...found.values(), ...labs.map((l) => ({ domain: l.domain, markets: 0 }))],
                clientDomain: ctx.domain,
              })
            }
          }
        } catch (e) {
          console.warn("[ai-search] Labs competitors failed", ctx.run.id, e instanceof Error ? e.message : e)
        }
      }
      const competitors = chosen.map((d) => ({ domain: d, name: names.get(d) ?? d }))
      return { output: { competitors, suggested } as unknown as Json }
    },
    { kinds: ["gap_competitors"] },
  )
  const [o] = await outputsOf<{ competitors: { domain: string; name: string }[] }>(ctx, "gap_competitors")
  ctx.gapCompetitors = o?.output?.competitors ?? []
  ctx.counts.gap_competitors = ctx.gapCompetitors.map((c) => c.domain)
}

// ---------------------------------------------------------------------------
// Competitor backlinks · step 4: where they get links (DataForSEO, or AI searches as a fallback)
// ---------------------------------------------------------------------------

type GapOutput = { mode: "dataforseo"; sites: GapSite[]; total: number; cached: boolean; fetchedAt: string; cost: number }

const GAP_FOOTPRINT_SEARCHES = 5

async function queueGapFootprint(ctx: Ctx, why: string) {
  ctx.counts.gap_mode = "ai_only"
  ctx.counts.gap_note = why
  await ensureTasks(
    ctx,
    ctx.gapCompetitors.map((c) => ({
      stage: 4,
      kind: "gap_footprint",
      key: `gap_footprint:${c.domain}`,
      input: { competitor: c.domain, name: c.name, market: ctx.markets[0]?.id ?? null, searches: GAP_FOOTPRINT_SEARCHES },
    })),
  )
}

async function stageGap(ctx: Ctx) {
  const g = ctx.gap!
  if (ctx.gapCompetitors.length < MIN_COMPETITORS) {
    ctx.counts.gap_mode = "none"
    ctx.counts.gap_note = "Fewer than 2 competitors: add them in the Competitors card."
    return
  }
  const existing = await tasksOf(ctx, 4)
  const started = existing.some((t) => t.kind === "gap" || t.kind === "gap_footprint")
  if (!started) {
    const { data: s } = await ctx.db
      .from("dfs_settings")
      .select("backlinks_access, last_balance_usd, low_balance_usd")
      .eq("id", true)
      .maybeSingle()
    const lowBalance = s?.last_balance_usd != null && s.low_balance_usd != null && Number(s.last_balance_usd) < Number(s.low_balance_usd)
    if (!g.useDfs) await queueGapFootprint(ctx, "DataForSEO was off for this run.")
    else if (!hasDataForSeo()) await queueGapFootprint(ctx, "DataForSEO isn't set up.")
    else if (s?.backlinks_access === "denied") await queueGapFootprint(ctx, "DataForSEO Backlinks access is off.")
    else if (lowBalance) await queueGapFootprint(ctx, "The DataForSEO balance is low.")
    else {
      await ensureTasks(ctx, [{ stage: 4, kind: "gap", key: "gap", input: { competitors: ctx.gapCompetitors.map((c) => c.domain) } }])
    }
  }

  const handler = async (task: Task): Promise<TaskResult> => {
    if (task.kind === "gap") {
      try {
        const r = await competitorGap(
          ctx.db,
          {
            competitors: ctx.gapCompetitors.map((c) => c.domain),
            clientDomain: ctx.domain,
            minShared: g.minShared,
            includeSingle: g.includeSingle,
            maxSites: g.maxSites,
            refresh: g.refresh,
          },
          { clientId: ctx.clientId, ref: ctx.run.id },
        )
        // DataForSEO $ counts toward the run's cap too.
        ctx.spent += r.cost
        ctx.counts.gap_mode = "dataforseo"
        ctx.counts.gap_sites = r.sites.length
        ctx.counts.gap_total = r.total
        ctx.counts.gap_cached = r.cached
        ctx.counts.gap_fetched_at = r.fetchedAt
        ctx.counts.gap_dfs_usd = Math.round(r.cost * 10000) / 10000
        const output: GapOutput = { mode: "dataforseo", ...r }
        return { output: output as unknown as Json }
      } catch (e) {
        if (!(e instanceof BacklinksAccessError)) throw e
        await ctx.db
          .from("dfs_settings")
          .update({ backlinks_access: "denied", backlinks_access_checked_at: new Date().toISOString() })
          .eq("id", true)
        await queueGapFootprint(ctx, "DataForSEO Backlinks access is off.")
        return { output: { mode: "ai_only" }, status: "skipped" }
      }
    }
    // AI only: search the competitor's name for places that feature it.
    const input = task.input as { competitor: string; name: string; market: string | null; searches: number }
    const m = input.market ? ctx.markets.find((x) => x.id === input.market) ?? null : null
    const usage: CallUsage[] = []
    const r = await claudeResearch(ctx.db, {
      system: P.system(["COMPETITOR_LINKS", "LINK_TACTICS"], client(ctx)),
      prompt: P.gapFootprintPrompt(m, { domain: input.competitor, name: input.name }, input.searches),
      ctx: callCtx(ctx, 4, task.id),
      maxSearches: input.searches,
      location: m ? { country: m.countryIso, city: m.city, region: m.kind === "region" ? m.region : null } : null,
      blockedDomains: blocked(ctx),
      maxTokens: 5000,
    })
    usage.push(r.usage)
    const parsed = (await parseResearch(ctx, 4, task.id, CandidatesSchema, P.SHAPES.candidates, r.text, usage)) as Candidates | null
    const items = (parsed?.items ?? []).filter((x) => fromSources(x.url, r.sources)).slice(0, LIMITS.candidatesPerTask)
    return { output: { items, queries: r.queries } as unknown as Json, usage }
  }
  const opts = {
    kinds: ["gap", "gap_footprint"],
    concurrency: LIMITS.concurrency,
    searchesPerTask: (t: Task) => (t.kind === "gap_footprint" ? num((t.input as Rec).searches, GAP_FOOTPRINT_SEARCHES) : 0),
  }
  await runStage(ctx, 4, handler, opts)

  // The DataForSEO step failed for good (not access): fall back to the AI estimate.
  const after = await tasksOf(ctx, 4)
  const gapTask = after.find((t) => t.kind === "gap")
  if (gapTask?.status === "failed" && !after.some((t) => t.kind === "gap_footprint")) {
    await queueGapFootprint(ctx, `DataForSEO didn't answer: ${(gapTask.error ?? "").slice(0, 120)}`)
  }
  if (after.some((t) => t.kind === "gap_footprint" && t.status === "queued") || (await tasksOf(ctx, 4)).some((t) => t.kind === "gap_footprint" && t.status === "queued")) {
    await runStage(ctx, 4, handler, opts)
  }
  if (ctx.counts.gap_mode === "ai_only") {
    const outs = await outputsOf<Candidates>(ctx, "gap_footprint")
    ctx.counts.gap_sites = outs.reduce((n, o) => n + (o.output?.items?.length ?? 0), 0)
  }
}

// ---------------------------------------------------------------------------
// Competitor backlinks · insights (after judging)
// ---------------------------------------------------------------------------

async function stageInsights(ctx: Ctx) {
  if (ctx.counts.gap_mode !== "dataforseo" && ctx.counts.gap_mode !== "ai_only") return
  await ensureTasks(ctx, [{ stage: 8, kind: "insights", key: "insights" }])
  await runStage(
    ctx,
    8,
    async (task) => {
      const { data } = await ctx.db
        .from("ai_link_prospects")
        .select("shared_count, competitor_links, link_kind, replicability, directory:directories(site_key)")
        .eq("client_id", ctx.clientId)
        .eq("last_run_id", ctx.run.id)
        .not("link_kind", "is", null)
        .limit(500)
      const rows = (data ?? []) as unknown as {
        shared_count: number | null
        competitor_links: Json
        link_kind: string | null
        replicability: string | null
        directory: { site_key: string } | null
      }[]
      if (rows.length < 3) return { output: { insights: [] }, status: "skipped" }
      const byKind: Record<string, Record<string, number>> = {}
      for (const r of rows) {
        const comps = linksOf(r).map((l) => l.competitor)
        for (const c of comps.length ? comps : ["(mentions)"]) {
          byKind[c] ??= {}
          byKind[c][r.link_kind ?? "other"] = (byKind[c][r.link_kind ?? "other"] ?? 0) + 1
        }
      }
      const top = [...rows]
        .sort((a, b) => (b.shared_count ?? 0) - (a.shared_count ?? 0))
        .slice(0, 12)
        .map((r) => `${r.directory?.site_key ?? "?"} (${r.shared_count ?? 1}, ${r.link_kind ?? "?"}, ${r.replicability ?? "?"})`)
      const r = await claudeJsonWithUsage(ctx.db, {
        schema: InsightsSchema,
        system: P.system(["COMPETITOR_LINKS"], client(ctx)),
        prompt: P.insightsPrompt({
          competitors: ctx.gapCompetitors.map((c) => c.domain),
          byKind,
          top,
          credits: rows.filter((x) => x.link_kind === "client_credit").length,
        }),
        ...callCtx(ctx, 8, task.id),
        feature: "ai_search.insights",
        stage: "insights",
        maxTokens: 1500,
      })
      const insights = r.data.insights
        .slice(0, 4)
        .map((x) => ({ title: x.title.slice(0, 80), detail: x.detail.slice(0, 240), kind: x.kind }))
      return { output: { insights, by_kind: byKind } as unknown as Json, usage: [r.usage] }
    },
    { kinds: ["insights"] },
  )
  const [o] = await outputsOf<{ insights: unknown[]; by_kind: unknown }>(ctx, "insights")
  if (o) {
    ctx.counts.insights = o.output?.insights ?? []
    ctx.counts.gap_by_kind = o.output?.by_kind ?? {}
  }
}

/** For the dialog: the plan and estimate (no side effects). */
export { planAiSearch, type PlannedTask }

/** Used in quote checks elsewhere. */
export const _internal = { norm }
