import "server-only"

import { ClaudeError, claudeJsonWithUsage } from "@/lib/ai/claude"
import { sourceRows, type NormalizedAnswer } from "@/lib/dataforseo/ai-normalize"
import {
  AiAccessError,
  aiKeywordVolume,
  getQueueTask,
  llmModels,
  llmResponseLive,
  PLATFORM,
  platformLocations,
  postQueueTasks,
  queueTasksReady,
} from "@/lib/dataforseo/ai-optimization"
import { DfsError, type Db } from "@/lib/dataforseo/client"
import { normalizeHost } from "@/lib/dataforseo/domains"
import { hasAnthropicKey, hasDataForSeo } from "@/lib/env.server"
import type { Json, Tables } from "@/lib/supabase/database.types"
import { fetchText } from "../backlinks/ai-search/fetcher"
import { blockedBots, matchBrands, mergeMentions, ruleType, type MentionRow, type TrackedBrand } from "./analysis"
import { PROMPT_CAP, UNIT_USD, ANALYSIS_USD, type AivModel } from "./config"
import * as P from "./prompts"
import { ActionsSchema, AnalysisSchema, ClassifySchema, DomainTypesSchema, SuggestSchema } from "./schemas"

/**
 * The AI Visibility run pipeline (docs/plans/ai-visibility/04-pipeline.md). One worker claims a
 * run, works for at most a few minutes, and hands it back while it waits for queued answers; the
 * cron tick (every 10 minutes) claims it again. Every task is checkpointed, so nothing is paid twice.
 */

type Run = Tables<"aiv_runs">
type Task = Tables<"aiv_tasks">

class StopRun extends Error {}
class Released extends Error {}

const HEARTBEAT_MS = 30_000
const WORK_MS = 4 * 60_000
const QUEUE_TIMEOUT_MS = 2 * 60 * 60_000
const LIVE_CONCURRENCY = 4
const ANALYSIS_CONCURRENCY = 4

let stopping = false
let hooked = false
function hookShutdown() {
  if (hooked || typeof process === "undefined" || typeof process.once !== "function") return
  hooked = true
  process.once("SIGTERM", () => {
    stopping = true
    if (process.listenerCount("SIGTERM") === 0) setTimeout(() => process.exit(0), 25_000).unref?.()
  })
}

type Brand = TrackedBrand & { displayName: string }

type Ctx = {
  db: Db
  run: Run
  clientId: string
  deadline: number
  spent: number
  maxUsd: number
  counts: Record<string, unknown>
  brands: Brand[]
  project: Tables<"aiv_projects">
  website: string | null
  topics: string[]
  locations: Map<string, number>
}

/** Claims and works queued or waiting runs. */
export async function processAiVisibility(db: Db, max = 2): Promise<number> {
  hookShutdown()
  let worked = 0
  for (let i = 0; i < max && !stopping; i++) {
    const { data, error } = await db.rpc("dfs_claim_aiv_run")
    if (error) throw new Error(`Could not claim an AI visibility run: ${error.message}`)
    const run = (data as Run[] | null)?.[0]
    if (!run) break
    await runOne(db, run)
    worked++
  }
  return worked
}

async function runOne(db: Db, run: Run) {
  const beat = setInterval(() => {
    void db.from("aiv_runs").update({ heartbeat_at: new Date().toISOString() }).eq("id", run.id).then(() => {})
  }, HEARTBEAT_MS)
  try {
    if (!hasDataForSeo()) throw new StopRun("DataForSEO isn't connected.")
    const ctx = await loadContext(db, run)
    if (run.stage <= 0) await stagePlan(ctx)
    if (ctx.run.stage <= 1) await stageDispatch(ctx)
    if (ctx.run.stage <= 2) await stageCollect(ctx)
    if (ctx.run.stage <= 3) await stageAnalyse(ctx)
    if (ctx.run.stage <= 4) await stageClassify(ctx)
    if (ctx.run.stage <= 5) await stageInsights(ctx)
    await finish(ctx)
  } catch (e) {
    if (e instanceof Released || (stopping && !(e instanceof StopRun))) {
      await db.rpc("dfs_release_aiv_run", { p_run_id: run.id })
      return
    }
    let message = e instanceof Error ? e.message : "The check stopped."
    if (e instanceof AiAccessError) {
      await db.from("dfs_settings").update({ aiv_access: "denied", aiv_access_checked_at: new Date().toISOString() }).eq("id", true)
      message = e.message
    } else if (e instanceof DfsError && e.kind === "funds") {
      message = "The DataForSEO balance is too low. Top it up and run the check again."
    }
    console.error("[ai-visibility] run failed", run.id, message)
    await db.from("aiv_runs").update({ status: "failed", error: message.slice(0, 1000), finished_at: new Date().toISOString() }).eq("id", run.id)
    await notify(db, run, "ai_visibility_failed")
  } finally {
    clearInterval(beat)
  }
}

async function loadContext(db: Db, run: Run): Promise<Ctx> {
  const [projectRes, brandsRes, clientRes, topicsRes, dfsRes, aiRes, locRes] = await Promise.all([
    db.from("aiv_projects").select("*").eq("client_id", run.client_id).single(),
    db.from("aiv_brands").select("*").eq("client_id", run.client_id).eq("active", true),
    db.from("clients").select("website").eq("id", run.client_id).single(),
    db.from("aiv_topics").select("name").eq("client_id", run.client_id),
    db.from("dfs_calls").select("cost_usd").eq("ref", run.id),
    db.from("ai_calls").select("cost_usd").eq("ref", run.id),
    db.from("aiv_locations").select("family, country_iso, location_code"),
  ])
  if (!projectRes.data) throw new StopRun("The AI visibility setup is missing.")
  const caps = ((run.params as Record<string, unknown>)?.caps ?? {}) as { max_usd?: number }
  const spent =
    (dfsRes.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0) + (aiRes.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)
  return {
    db,
    run,
    clientId: run.client_id,
    deadline: Date.now() + WORK_MS,
    spent,
    maxUsd: Number(caps.max_usd ?? 5),
    counts: (run.counts ?? {}) as Record<string, unknown>,
    brands: (brandsRes.data ?? []).map((b) => ({
      id: b.id, isOwn: b.is_own, names: b.tracked_names, pattern: b.pattern, domains: b.domains, displayName: b.display_name,
    })),
    project: projectRes.data,
    website: clientRes.data?.website ?? null,
    topics: (topicsRes.data ?? []).map((t) => t.name),
    locations: new Map((locRes.data ?? []).map((l) => [`${l.family}:${l.country_iso}`, l.location_code])),
  }
}

async function setStage(ctx: Ctx, stage: number) {
  ctx.run.stage = stage
  await ctx.db.from("aiv_runs").update({ stage, counts: ctx.counts as Json }).eq("id", ctx.run.id)
}

const outOfTime = (ctx: Ctx) => stopping || Date.now() > ctx.deadline
const callCtx = (ctx: Ctx) => ({ clientId: ctx.clientId, ref: ctx.run.id })

async function budgetOk(ctx: Ctx, next: number) {
  if (ctx.spent + next > ctx.maxUsd) {
    ctx.counts.capped = true
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Stage 0 · plan: questions × platforms → tasks
// ---------------------------------------------------------------------------

async function stagePlan(ctx: Ctx) {
  const params = (ctx.run.params ?? {}) as { prompt_ids?: string[]; models?: AivModel[] }
  const ids = params.prompt_ids ?? []
  const models = (params.models ?? ctx.project.models) as AivModel[]
  if (!ids.length) throw new StopRun("There are no questions to check.")
  const { data: prompts } = await ctx.db.from("aiv_prompts").select("id, country").in("id", ids)
  const rows = (prompts ?? []).flatMap((p) =>
    models.map((m) => ({ run_id: ctx.run.id, client_id: ctx.clientId, key: `${p.id}:${m}:${p.country}`, prompt_id: p.id, model: m, country: p.country })),
  )
  for (let i = 0; i < rows.length; i += 500) {
    await ctx.db.from("aiv_tasks").upsert(rows.slice(i, i + 500), { onConflict: "run_id,key", ignoreDuplicates: true })
  }
  ctx.counts.tasks = rows.length
  ctx.counts.prompts = (prompts ?? []).length
  await setStage(ctx, 1)
}

// ---------------------------------------------------------------------------
// Stage 1 · dispatch
// ---------------------------------------------------------------------------

const FAMILY: Record<"chatgpt" | "gemini" | "ai_overview" | "ai_mode", "chat_gpt" | "gemini" | "serp"> = {
  chatgpt: "chat_gpt", gemini: "gemini", ai_overview: "serp", ai_mode: "serp",
}

async function locationCode(ctx: Ctx, family: "chat_gpt" | "gemini" | "serp", iso: string): Promise<number | null> {
  const key = `${family}:${iso}`
  if (ctx.locations.has(key)) return ctx.locations.get(key)!
  if (ctx.locations.has(`${family}:__synced`)) return null
  const list = await platformLocations(ctx.db, family).catch((e) => {
    if (e instanceof AiAccessError) throw e
    return [] as { iso: string; code: number }[]
  })
  ctx.locations.set(`${family}:__synced`, 0)
  if (list.length) {
    const rows = [...new Map(list.map((l) => [l.iso, l])).values()].map((l) => ({ family, country_iso: l.iso, location_code: l.code }))
    await ctx.db.from("aiv_locations").upsert(rows, { onConflict: "family,country_iso" })
    for (const r of rows) ctx.locations.set(`${family}:${r.country_iso}`, r.location_code)
  }
  return ctx.locations.get(key) ?? null
}

async function storeAnswer(ctx: Ctx, task: Pick<Task, "id">, a: NormalizedAnswer, cost: number, countryFallback = false) {
  const { error } = await ctx.db.rpc("dfs_store_aiv_chat", {
    p_task_id: task.id,
    p: {
      status: a.status, answer: a.text, model_version: a.modelVersion, fan_out: a.fanOut, brand_hints: a.brandHints,
      check_url: a.checkUrl, country_fallback: countryFallback, error: a.error, cost_usd: cost,
      sources: sourceRows(a), ads: a.ads,
    } as unknown as Json,
  })
  if (error) throw new Error(`Could not save an answer: ${error.message}`)
}

async function pickModelName(ctx: Ctx, platform: "claude" | "perplexity"): Promise<string> {
  const params = (ctx.run.params ?? {}) as { claude_model?: string | null; perplexity_model?: string | null }
  const saved = platform === "claude" ? params.claude_model : params.perplexity_model
  if (saved) return saved
  const list = await llmModels(ctx.db, platform).catch(() => [])
  const web = list.filter((m) => m.webSearch)
  const pool = web.length ? web : list
  const pick =
    platform === "claude"
      ? (pool.filter((m) => /sonnet/i.test(m.name)).sort((a, b) => b.name.localeCompare(a.name))[0] ?? pool[0])
      : (pool.find((m) => m.name === "sonar") ?? pool.filter((m) => /^sonar/i.test(m.name)).sort((a, b) => a.name.length - b.name.length)[0] ?? pool[0])
  const name = pick?.name ?? (platform === "claude" ? "claude-sonnet-4-0" : "sonar")
  await ctx.db.from("dfs_settings").update(platform === "claude" ? { aiv_claude_model: name } : { aiv_perplexity_model: name }).eq("id", true)
  ;(ctx.run.params as Record<string, unknown>)[`${platform}_model`] = name
  return name
}

async function stageDispatch(ctx: Ctx) {
  const { data: queued } = await ctx.db.from("aiv_tasks").select("*").eq("run_id", ctx.run.id).eq("status", "queued")
  const tasks = queued ?? []
  const { data: prompts } = await ctx.db.from("aiv_prompts").select("id, text, language").in("id", [...new Set(tasks.map((t) => t.prompt_id))])
  const promptOf = new Map((prompts ?? []).map((p) => [p.id, p]))

  // Queue platforms: post in batches.
  for (const model of ["chatgpt", "gemini", "ai_overview", "ai_mode"] as const) {
    const mine = tasks.filter((t) => t.model === model)
    if (!mine.length) continue
    const specs: { task: Task; spec: { tag: string; keyword: string; locationCode: number; languageCode: string } }[] = []
    for (const t of mine) {
      const code = await locationCode(ctx, FAMILY[model], t.country)
      const prompt = promptOf.get(t.prompt_id)
      if (!code || !prompt) {
        await ctx.db.from("aiv_tasks").update({ status: "skipped", error: "This platform doesn't cover the question's country." }).eq("id", t.id)
        ctx.counts.unsupported = Number(ctx.counts.unsupported ?? 0) + 1
        continue
      }
      specs.push({ task: t, spec: { tag: t.key, keyword: prompt.text, locationCode: code, languageCode: prompt.language.slice(0, 2) } })
    }
    let allowed = specs.length
    while (allowed > 0 && !(await budgetOk(ctx, allowed * UNIT_USD[model]))) allowed = Math.floor(allowed / 2)
    const skipped = specs.slice(allowed)
    if (skipped.length) {
      await ctx.db.from("aiv_tasks").update({ status: "skipped", error: "Over this check's cost limit." }).in("id", skipped.map((s) => s.task.id))
    }
    const go = specs.slice(0, allowed)
    if (!go.length) continue
    const posted = await postQueueTasks(ctx.db, model, go.map((s) => s.spec), callCtx(ctx))
    const byTag = new Map(posted.map((p) => [p.tag, p]))
    for (const { task } of go) {
      const p = byTag.get(task.key)
      ctx.spent += p?.cost ?? UNIT_USD[model]
      if (p?.id) {
        await ctx.db.from("aiv_tasks").update({ status: "posted", dfs_task_id: p.id, posted_at: new Date().toISOString(), cost_usd: p.cost, attempts: task.attempts + 1 }).eq("id", task.id)
      } else {
        await storeAnswer(ctx, task, { ...emptyFailed(p?.message ?? "The platform refused this question.") }, 0)
      }
    }
    ctx.counts.posted = Number(ctx.counts.posted ?? 0) + go.length
  }

  // Live platforms: answer at once, a few at a time.
  const live = tasks.filter((t) => PLATFORM[t.model as AivModel].mode === "live")
  if (live.length) {
    const names: Partial<Record<"claude" | "perplexity", string>> = {}
    let i = 0
    const worker = async () => {
      while (i < live.length) {
        if (outOfTime(ctx)) throw new Released()
        const t = live[i++]
        const model = t.model as "claude" | "perplexity"
        const prompt = promptOf.get(t.prompt_id)
        if (!prompt) continue
        if (!(await budgetOk(ctx, UNIT_USD[model]))) {
          await ctx.db.from("aiv_tasks").update({ status: "skipped", error: "Over this check's cost limit." }).eq("id", t.id)
          continue
        }
        names[model] ??= await pickModelName(ctx, model)
        const { answer, cost, countryFallback } = await llmResponseLive(ctx.db, model, { prompt: prompt.text, modelName: names[model]!, country: t.country }, callCtx(ctx))
        ctx.spent += cost
        await storeAnswer(ctx, t, answer, cost, countryFallback)
      }
    }
    await Promise.all(Array.from({ length: Math.min(LIVE_CONCURRENCY, live.length) }, worker))
  }
  await setStage(ctx, 2)
}

const emptyFailed = (error: string): NormalizedAnswer => ({
  status: "failed", text: "", read: [], cited: [], fanOut: [], ads: [], brandHints: [], modelVersion: null, checkUrl: null, error,
})

// ---------------------------------------------------------------------------
// Stage 2 · collect queued answers
// ---------------------------------------------------------------------------

async function stageCollect(ctx: Ctx) {
  const { data: posted } = await ctx.db.from("aiv_tasks").select("*").eq("run_id", ctx.run.id).eq("status", "posted")
  const tasks = posted ?? []
  if (tasks.length) {
    for (const model of ["chatgpt", "gemini", "ai_overview", "ai_mode"] as const) {
      const mine = tasks.filter((t) => t.model === model)
      if (!mine.length) continue
      const ready = await queueTasksReady(ctx.db, model).catch((e) => {
        if (e instanceof AiAccessError) throw e
        return new Set<string>()
      })
      for (const t of mine) {
        if (outOfTime(ctx)) throw new Released()
        const age = Date.now() - new Date(t.posted_at ?? ctx.run.created_at).getTime()
        if (!t.dfs_task_id) continue
        // Ready, or old enough that the ready list may have dropped it: try to fetch.
        if (!ready.has(t.dfs_task_id) && age < 50 * 60_000) continue
        const got = await getQueueTask(ctx.db, model, t.dfs_task_id, callCtx(ctx))
        if (got.pending) {
          if (age > QUEUE_TIMEOUT_MS) await storeAnswer(ctx, t, emptyFailed("No answer from the platform within 2 hours."), 0)
          continue
        }
        await storeAnswer(ctx, t, got.answer, t.cost_usd)
      }
    }
    const { count } = await ctx.db.from("aiv_tasks").select("id", { count: "exact", head: true }).eq("run_id", ctx.run.id).eq("status", "posted")
    ctx.counts.waiting = count ?? 0
    if ((count ?? 0) > 0) {
      await ctx.db.from("aiv_runs").update({ counts: ctx.counts as Json }).eq("id", ctx.run.id)
      throw new Released()
    }
  }
  const { data: chats } = await ctx.db.from("aiv_chats").select("status").eq("run_id", ctx.run.id)
  ctx.counts.answers = (chats ?? []).filter((c) => c.status === "ok").length
  ctx.counts.failed = (chats ?? []).filter((c) => c.status === "failed").length
  ctx.counts.empty = (chats ?? []).filter((c) => c.status === "empty").length
  ctx.counts.waiting = 0
  await setStage(ctx, 3)
}

// ---------------------------------------------------------------------------
// Stage 3 · read every answer
// ---------------------------------------------------------------------------

async function stageAnalyse(ctx: Ctx) {
  const { data: chats } = await ctx.db
    .from("aiv_chats")
    .select("id, answer, prompt_id")
    .eq("run_id", ctx.run.id)
    .eq("status", "ok")
    .is("analyzed_at", null)
  const list = chats ?? []
  if (list.length) {
    const ids = list.map((c) => c.id)
    const [{ data: sources }, { data: prompts }] = await Promise.all([
      ctx.db.from("aiv_sources").select("chat_id, domain").in("chat_id", ids).eq("cited", true),
      ctx.db.from("aiv_prompts").select("id, text").in("id", [...new Set(list.map((c) => c.prompt_id))]),
    ])
    const citedOf = new Map<string, string[]>()
    for (const s of sources ?? []) citedOf.set(s.chat_id, [...(citedOf.get(s.chat_id) ?? []), s.domain])
    const questionOf = new Map((prompts ?? []).map((p) => [p.id, p.text]))
    const useClaude = hasAnthropicKey()
    let i = 0
    const worker = async () => {
      while (i < list.length) {
        if (outOfTime(ctx)) throw new Released()
        const c = list[i++]
        const text = c.answer ?? ""
        const matches = matchBrands(text, citedOf.get(c.id) ?? [], ctx.brands)
        let rows: MentionRow[] | null = null
        let version: string = P.PROMPT_VERSIONS.analyze
        if (useClaude && (await budgetOk(ctx, ANALYSIS_USD))) {
          for (let attempt = 0; attempt < 2 && !rows; attempt++) {
            try {
              const { data, usage } = await claudeJsonWithUsage(ctx.db, {
                schema: AnalysisSchema,
                system: { stable: `${P.RULES}\n\n${clientBlockOf(ctx)}` },
                prompt: P.analyzePrompt({
                  question: questionOf.get(c.prompt_id) ?? "",
                  answer: text,
                  brands: ctx.brands.map((b) => ({ id: b.id, name: b.displayName, names: b.names })),
                }),
                feature: "ai_visibility.analyze",
                clientId: ctx.clientId,
                ref: ctx.run.id,
                stage: "analyze",
                maxTokens: 3000,
                effort: "low",
              })
              ctx.spent += usage.cost
              rows = mergeMentions({ text, matches, brands: ctx.brands, extracted: data.brands, sentiment: data.sentiment })
            } catch (e) {
              if (e instanceof ClaudeError && e.kind === "not_configured") break
            }
          }
        }
        if (!rows) {
          version = `${P.PROMPT_VERSIONS.analyze}-fallback`
          rows = mergeMentions({ text, matches, brands: ctx.brands, extracted: [], sentiment: [] })
        }
        await ctx.db.rpc("dfs_store_aiv_analysis", { p_chat_id: c.id, p: { version, mentions: rows } as unknown as Json })
      }
    }
    await Promise.all(Array.from({ length: Math.min(ANALYSIS_CONCURRENCY, list.length) }, worker))
  }
  ctx.counts.analysed = Number(ctx.counts.answers ?? 0)
  await setStage(ctx, 4)
}

function clientBlockOf(ctx: Ctx) {
  return P.clientBlock({
    brandName: ctx.project.brand_name,
    description: ctx.project.description,
    industry: ctx.project.industry,
    personas: ctx.project.personas,
    brandIdentity: ctx.project.brand_identity,
    website: ctx.website,
    countries: ctx.project.countries,
    topics: ctx.topics,
  })
}

// ---------------------------------------------------------------------------
// Stage 4 · what kind of site each new source is
// ---------------------------------------------------------------------------

async function stageClassify(ctx: Ctx) {
  const { data: chatIds } = await ctx.db.from("aiv_chats").select("id").eq("run_id", ctx.run.id)
  const ids = (chatIds ?? []).map((c) => c.id)
  const titles = new Map<string, string[]>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await ctx.db.from("aiv_sources").select("domain, title").in("chat_id", ids.slice(i, i + 200))
    for (const s of data ?? []) {
      const list = titles.get(s.domain) ?? []
      if (s.title && list.length < 3 && !list.includes(s.title)) list.push(s.title)
      titles.set(s.domain, list)
    }
  }
  const domains = [...titles.keys()]
  if (domains.length) {
    const known = new Set<string>()
    for (let i = 0; i < domains.length; i += 300) {
      const { data } = await ctx.db.from("aiv_domains").select("domain").in("domain", domains.slice(i, i + 300))
      for (const d of data ?? []) known.add(d.domain)
    }
    const fresh = domains.filter((d) => !known.has(d))
    const dirHosts = new Set<string>()
    for (let i = 0; i < fresh.length; i += 300) {
      const { data } = await ctx.db.from("directories").select("domain").in("domain", fresh.slice(i, i + 300))
      for (const d of data ?? []) dirHosts.add(d.domain)
    }
    const ruled: { domain: string; type: string; by: "rule" | "ai" }[] = []
    const ask: string[] = []
    for (const d of fresh) {
      const t = ruleType(d, dirHosts)
      if (t) ruled.push({ domain: d, type: t, by: "rule" })
      else ask.push(d)
    }
    if (hasAnthropicKey()) {
      for (let i = 0; i < ask.length && i < 200; i += 50) {
        if (outOfTime(ctx)) throw new Released()
        if (!(await budgetOk(ctx, 0.002))) break
        const batch = ask.slice(i, i + 50)
        try {
          const { data, usage } = await claudeJsonWithUsage(ctx.db, {
            schema: DomainTypesSchema,
            system: P.RULES,
            prompt: P.domainsPrompt(batch.map((d) => ({ domain: d, titles: titles.get(d) ?? [] }))),
            feature: "ai_visibility.domains",
            clientId: ctx.clientId,
            ref: ctx.run.id,
            stage: "domains",
            maxTokens: 4000,
            effort: "low",
          })
          ctx.spent += usage.cost
          const allowed = new Set(batch)
          for (const it of data.items) if (allowed.has(it.domain)) ruled.push({ domain: it.domain, type: it.type, by: "ai" })
        } catch (e) {
          console.error("[ai-visibility] domain types failed", e instanceof Error ? e.message : e)
        }
      }
    }
    for (let i = 0; i < ruled.length; i += 500) {
      await ctx.db.from("aiv_domains").upsert(ruled.slice(i, i + 500).map((r) => ({ ...r, classified_at: new Date().toISOString() })), { onConflict: "domain" })
    }
    ctx.counts.new_domains = ruled.length
  }
  await setStage(ctx, 5)
}

// ---------------------------------------------------------------------------
// Stage 5 · suggestions, question volume, actions
// ---------------------------------------------------------------------------

async function stageInsights(ctx: Ctx) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const f = { from: since, to: new Date().toISOString().slice(0, 10) }

  // 1. Brands named in at least 2 answers that nobody tracks yet.
  const { data: untracked } = await ctx.db
    .from("aiv_mentions")
    .select("name, name_key")
    .eq("client_id", ctx.clientId)
    .is("brand_id", null)
    .gte("run_date", since)
    .limit(5000)
  const tally = new Map<string, { name: string; n: number }>()
  for (const m of untracked ?? []) {
    const t = tally.get(m.name_key) ?? { name: m.name, n: 0 }
    t.n++
    tally.set(m.name_key, t)
  }
  const brandSuggestions = [...tally.entries()]
    .filter(([, t]) => t.n >= 2)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 20)
    .map(([key, t]) => ({ kind: "brand", key, payload: { display_name: t.name, tracked_names: [t.name] }, reason: `Named in ${t.n} answers`, mentions: t.n }))
  if (brandSuggestions.length) await ctx.db.rpc("dfs_store_aiv_suggestions", { p_client_id: ctx.clientId, p: brandSuggestions as unknown as Json })

  if (hasAnthropicKey()) {
    await classifyPrompts(ctx).catch((e) => console.error("[ai-visibility] classify failed", e instanceof Error ? e.message : e))
    await suggestQuestions(ctx, 10).catch((e) => console.error("[ai-visibility] suggest failed", e instanceof Error ? e.message : e))
  }
  await refreshVolumes(ctx).catch((e) => {
    if (e instanceof AiAccessError) return
    console.error("[ai-visibility] volume failed", e instanceof Error ? e.message : e)
  })
  await makeActions(ctx, f).catch((e) => console.error("[ai-visibility] actions failed", e instanceof Error ? e.message : e))
  await setStage(ctx, 6)
}

/** Intent, head phrase and topic for questions that don't have them. */
async function classifyPrompts(ctx: Ctx) {
  const { data } = await ctx.db.from("aiv_prompts").select("id, text, intent, head_phrase, topic_id").eq("client_id", ctx.clientId).eq("status", "active")
  const todo = (data ?? []).filter((p) => !p.intent || !p.head_phrase).slice(0, 50)
  if (!todo.length || !(await budgetOk(ctx, 0.003))) return
  const { data: out, usage } = await claudeJsonWithUsage(ctx.db, {
    schema: ClassifySchema,
    system: { stable: `${P.RULES}\n\n${clientBlockOf(ctx)}` },
    prompt: P.classifyPrompt(todo.map((p) => p.text), ctx.topics),
    feature: "ai_visibility.classify",
    clientId: ctx.clientId,
    ref: ctx.run.id,
    stage: "classify",
    maxTokens: 4000,
    effort: "low",
  })
  ctx.spent += usage.cost
  const { data: topics } = await ctx.db.from("aiv_topics").select("id, name").eq("client_id", ctx.clientId)
  const topicId = new Map((topics ?? []).map((t) => [t.name.toLowerCase(), t.id]))
  for (const it of out.items) {
    const p = todo[it.index]
    if (!p) continue
    await ctx.db
      .from("aiv_prompts")
      .update({
        intent: p.intent ?? it.intent,
        head_phrase: (p.head_phrase ?? it.head_phrase).slice(0, 80),
        topic_id: p.topic_id ?? (it.topic ? (topicId.get(it.topic.toLowerCase()) ?? null) : null),
      })
      .eq("id", p.id)
  }
}

/** New question ideas, at most once a week, stored as suggestions. Also used by the setup ("Suggest questions"). */
export async function suggestQuestions(ctx: Pick<Ctx, "db" | "clientId" | "project" | "topics" | "website"> & { run?: Run; spent?: number }, count: number, force = false) {
  if (!force) {
    const { data: last } = await ctx.db
      .from("aiv_suggestions").select("created_at").eq("client_id", ctx.clientId).eq("kind", "prompt")
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (last && Date.now() - new Date(last.created_at).getTime() < 7 * 86_400_000) return 0
  }
  const [{ data: prompts }, { data: fan }, { data: brief }, { data: targets }] = await Promise.all([
    ctx.db.from("aiv_prompts").select("text, topic_id").eq("client_id", ctx.clientId),
    ctx.db.from("aiv_chats").select("fan_out").eq("client_id", ctx.clientId).order("created_at", { ascending: false }).limit(100),
    ctx.db.from("backlink_briefs").select("reach, buyer, audience, core_topics, adjacent_topics").eq("client_id", ctx.clientId).maybeSingle(),
    ctx.db.from("backlink_targets").select("label, kind").eq("client_id", ctx.clientId).eq("active", true),
  ])
  if ((prompts ?? []).length >= PROMPT_CAP + 20) return 0
  const fanTally = new Map<string, number>()
  for (const c of fan ?? []) for (const q of c.fan_out ?? []) fanTally.set(q, (fanTally.get(q) ?? 0) + 1)
  const fanOut = [...fanTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([q]) => q)
  const local = !brief || (brief.reach as string[]).includes("local")
  const places = (targets ?? []).filter((t) => t.kind !== "country").map((t) => t.label)
  const topics = [...new Set([...ctx.topics, ...((brief?.core_topics as string[] | null) ?? [])])]
  const { data, usage } = await claudeJsonWithUsage(ctx.db, {
    schema: SuggestSchema,
    system: {
      stable: `${P.RULES}\n\n${P.clientBlock({
        brandName: ctx.project.brand_name, description: ctx.project.description, industry: ctx.project.industry,
        personas: ctx.project.personas, brandIdentity: ctx.project.brand_identity, website: ctx.website,
        countries: ctx.project.countries, topics, audience: brief?.audience ?? null,
        reach: (brief?.reach as string[] | null) ?? undefined, buyer: (brief?.buyer as string[] | null) ?? undefined,
      })}`,
    },
    prompt: P.suggestPrompt({ existing: (prompts ?? []).map((p) => p.text), thinTopics: topics, fanOut, count, local, places }),
    feature: "ai_visibility.suggest",
    clientId: ctx.clientId,
    ref: ctx.run?.id ?? null,
    stage: "suggest",
    maxTokens: 6000,
    effort: "low",
  })
  if (ctx.spent !== undefined) ctx.spent += usage.cost
  const items = data.suggestions
    .map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ").trim() }))
    .filter((s) => s.text.length >= 8 && s.text.length <= 400)
    .slice(0, count)
    .map((s) => ({
      kind: "prompt",
      key: s.text.toLowerCase(),
      payload: { text: s.text, topic: s.topic, intent: s.intent, persona: s.persona },
      reason: s.reason.slice(0, 300),
      mentions: 0,
    }))
  if (!items.length) return 0
  const { data: n } = await ctx.db.rpc("dfs_store_aiv_suggestions", { p_client_id: ctx.clientId, p: items as unknown as Json })
  return Number(n ?? 0)
}

/** AI search volume for each question's head phrase, banded 1–5 within the client's own set. Monthly. */
async function refreshVolumes(ctx: Ctx) {
  const month = Date.now() - 30 * 86_400_000
  const { data } = await ctx.db
    .from("aiv_prompts")
    .select("id, head_phrase, volume_at, volume_raw, country")
    .eq("client_id", ctx.clientId)
    .eq("status", "active")
    .not("head_phrase", "is", null)
  const all = data ?? []
  const todo = all.filter((p) => !p.volume_at || new Date(p.volume_at).getTime() < month)
  if (!todo.length || !(await budgetOk(ctx, 0.02))) return
  const country = ctx.project.countries[0]
  const code = await locationCode(ctx, "serp", country)
  if (!code) return
  const phrases = [...new Set(todo.map((p) => p.head_phrase!.toLowerCase()))].slice(0, 200)
  const vol = await aiKeywordVolume(ctx.db, { keywords: phrases, locationCode: code, languageCode: ctx.project.language.slice(0, 2) }, callCtx(ctx))
  ctx.spent += 0.01 + phrases.length * 0.0001
  const now = new Date().toISOString()
  const raw = new Map<string, number | null>()
  for (const p of all) raw.set(p.id, todo.includes(p) ? (vol.get(p.head_phrase!.toLowerCase()) ?? null) : (p.volume_raw ?? null))
  const values = [...raw.values()].filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b)
  const band = (v: number | null) => {
    if (v === null || v <= 0 || !values.length) return null
    const rank = values.findIndex((x) => x >= v) / Math.max(1, values.length - 1)
    return Math.min(5, Math.max(1, 1 + Math.floor(rank * 5)))
  }
  for (const p of all) {
    const v = raw.get(p.id) ?? null
    await ctx.db.from("aiv_prompts").update({ volume_raw: v, volume: band(v), ...(todo.includes(p) ? { volume_at: now } : {}) }).eq("id", p.id)
  }
}

async function makeActions(ctx: Ctx, f: { from: string; to: string }) {
  const own = ctx.brands.find((b) => b.isOwn)
  const site: { group: string; title: string; detail: string; evidence: Json; impact: string; domain: string | null; url: string | null }[] = []

  // Fix how AI reads the site: AI crawlers blocked in robots.txt (no AI involved).
  const host = normalizeHost(ctx.website) ?? own?.domains[0] ?? null
  if (host) {
    const robots = await fetchText(`https://${host}/robots.txt`)
    if (robots.ok) {
      for (const b of blockedBots(robots.text)) {
        site.push({
          group: "site",
          title: `Allow ${b.agent} in robots.txt`,
          detail: `${b.label} (${b.agent}) is blocked for the whole site in robots.txt, so ${b.search ? "it can't read or cite the client's pages in its answers" : "the client's pages aren't available to that AI"}. Remove the "Disallow: /" rule for this crawler, or add "User-agent: ${b.agent}" with "Allow: /".`,
          evidence: { robots_url: `https://${host}/robots.txt`, bot: b.agent } as Json,
          impact: b.search ? "high" : "low",
          domain: null,
          url: `https://${host}/robots.txt`,
        })
      }
    }
  }

  const [{ data: gapRaw }, { data: ownRaw }, { data: open }] = await Promise.all([
    ctx.db.rpc("aiv_gap", { p_client_id: ctx.clientId, f: f as unknown as Json, p_limit: 15 }),
    ctx.db.rpc("aiv_sources_domains", { p_client_id: ctx.clientId, f: f as unknown as Json, p_type: "own", p_limit: 5, p_offset: 0 }),
    ctx.db.from("aiv_actions").select("title").eq("client_id", ctx.clientId).in("status", ["new", "in_progress"]).limit(50),
  ])
  type Gap = { domain: string; type: string; gap_answers: number; competitors: string[]; urls: string[]; prompts: string[]; models: string[]; gap_score: number }
  const gaps = ((gapRaw ?? []) as unknown as Gap[]).filter((g) => g.gap_answers > 0)
  const ownRows = (((ownRaw ?? {}) as { rows?: { domain: string; retrieved_pct: number | null; cited_pct: number | null }[] }).rows ?? [])
  const earned: typeof site = []
  if (hasAnthropicKey() && gaps.length && (await budgetOk(ctx, 0.01))) {
    const { data, usage } = await claudeJsonWithUsage(ctx.db, {
      schema: ActionsSchema,
      system: { stable: `${P.RULES}\n\n${clientBlockOf(ctx)}` },
      prompt: P.actionsPrompt({
        gaps: gaps.map((g) => ({ domain: g.domain, type: g.type, answers: g.gap_answers, competitors: g.competitors, urls: g.urls, prompts: g.prompts })),
        ownStats: ownRows.map((o) => ({ domain: o.domain, retrievedPct: o.retrieved_pct, citedPct: o.cited_pct })),
        open: (open ?? []).map((a) => a.title),
        knowledge: P.KNOWLEDGE,
      }),
      feature: "ai_visibility.actions",
      clientId: ctx.clientId,
      ref: ctx.run.id,
      stage: "actions",
      maxTokens: 6000,
      effort: "low",
    })
    ctx.spent += usage.cost
    const gapOf = new Map(gaps.map((g) => [g.domain, g]))
    const urls = new Set(gaps.flatMap((g) => g.urls))
    for (const a of data.actions.slice(0, 10)) {
      const g = a.domain ? gapOf.get(a.domain.toLowerCase()) : undefined
      let impact = a.impact
      if (g) {
        const floor = g.gap_score >= 20 || ((g.type === "editorial" || g.type === "directory") && g.gap_answers >= 5) ? "high" : g.gap_score >= 6 ? "medium" : "low"
        const rank = { low: 0, medium: 1, high: 2 } as const
        if (rank[impact] > rank[floor]) impact = floor
      }
      earned.push({
        group: a.group,
        title: a.title.slice(0, 140),
        detail: `${a.detail}\n\n${a.evidence_note}`.slice(0, 1200),
        evidence: (g ? { answers: g.gap_answers, competitors: g.competitors, models: g.models, prompts: g.prompts.slice(0, 5), urls: g.urls } : {}) as Json,
        impact,
        domain: g ? g.domain : null,
        url: a.url && urls.has(a.url) ? a.url : (g?.urls[0] ?? null),
      })
    }
  }
  const all = [...site, ...earned]
  if (all.length) {
    const { data: n } = await ctx.db.rpc("dfs_store_aiv_actions", { p_client_id: ctx.clientId, p_run_id: ctx.run.id, p: all as unknown as Json })
    ctx.counts.new_actions = Number(n ?? 0)
  }
  ctx.counts.gap_sites = gaps.length
}

// ---------------------------------------------------------------------------
// Finish
// ---------------------------------------------------------------------------

async function finish(ctx: Ctx) {
  const [{ data: dfs }, { data: ai }, { data: chats }] = await Promise.all([
    ctx.db.from("dfs_calls").select("cost_usd").eq("ref", ctx.run.id),
    ctx.db.from("ai_calls").select("cost_usd").eq("ref", ctx.run.id),
    ctx.db.from("aiv_chats").select("id").eq("run_id", ctx.run.id).eq("status", "ok"),
  ])
  const cost = (dfs ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0) + (ai ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)
  const own = ctx.brands.find((b) => b.isOwn)
  const answers = (chats ?? []).length
  let mentions = 0
  if (own && answers) {
    const { count } = await ctx.db.from("aiv_mentions").select("id", { count: "exact", head: true }).eq("brand_id", own.id)
      .in("chat_id", (chats ?? []).map((c) => c.id))
    mentions = count ?? 0
  }
  ctx.counts.answers = answers
  ctx.counts.mentions = mentions
  ctx.counts.visibility = answers ? Math.round((1000 * mentions) / answers) / 10 : null
  await ctx.db
    .from("aiv_runs")
    .update({ status: "done", stage: 6, counts: ctx.counts as Json, cost_usd: Math.round(cost * 10_000) / 10_000, finished_at: new Date().toISOString(), error: null })
    .eq("id", ctx.run.id)
  await ctx.db.from("activity_log").insert({
    actor_id: ctx.run.created_by,
    client_id: ctx.clientId,
    action: "ai.check_finished",
    meta: { answers, mentions, visibility: ctx.counts.visibility, cost_usd: Math.round(cost * 100) / 100 } as Json,
  })
  await ctx.db.from("dfs_settings").update({ aiv_access: "active", aiv_access_checked_at: new Date().toISOString() }).eq("id", true)
  await notify(ctx.db, ctx.run, "ai_visibility_ready")
}

async function notify(db: Db, run: Run, kind: "ai_visibility_ready" | "ai_visibility_failed") {
  const { data: client } = await db.from("clients").select("owner_id").eq("id", run.client_id).maybeSingle()
  const to = [...new Set([run.created_by, client?.owner_id].filter((x): x is string => Boolean(x)))]
  if (!to.length) return
  const { error } = await db.from("notifications").insert(to.map((recipient_id) => ({ recipient_id, kind, client_id: run.client_id })))
  if (error) console.error("[ai-visibility] notification failed", error.message)
}

