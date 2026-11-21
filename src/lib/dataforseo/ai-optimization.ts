import "server-only"

import { DfsError, dfsCall, firstResult, type Db } from "./client"
import {
  failedAnswer,
  normalizeLlmResponse,
  normalizeScraper,
  normalizeSerpAi,
  type AivModel,
  type NormalizedAnswer,
} from "./ai-normalize"

/**
 * DataForSEO calls for AI Visibility (docs/plans/ai-visibility/02-data-sources.md). The only
 * place these endpoints are called. Every call goes through dfsCall (ledger, retries) with the
 * run id as ref, so run costs join from dfs_calls.
 */

type Ctx = { clientId?: string | null; ref?: string | null }

/** How each platform is fetched. Queue platforms post tasks and collect later; live ones answer at once. */
export const PLATFORM: Record<AivModel, { mode: "queue" | "live"; family: "chat_gpt" | "gemini" | "serp" | "llm" }> = {
  chatgpt: { mode: "queue", family: "chat_gpt" },
  gemini: { mode: "queue", family: "gemini" },
  ai_overview: { mode: "queue", family: "serp" },
  ai_mode: { mode: "queue", family: "serp" },
  claude: { mode: "live", family: "llm" },
  perplexity: { mode: "live", family: "llm" },
}

const QUEUE_PATH: Record<"chatgpt" | "gemini" | "ai_overview" | "ai_mode", string> = {
  chatgpt: "v3/ai_optimization/chat_gpt/llm_scraper",
  gemini: "v3/ai_optimization/gemini/llm_scraper",
  ai_overview: "v3/serp/google/organic",
  ai_mode: "v3/serp/google/ai_mode",
}
const API_OF = (m: AivModel) => (m === "ai_overview" || m === "ai_mode" ? "serp_google" : "ai_optimization") as "serp_google" | "ai_optimization"

/** Countries LLM Responses can search the web from (web_search_country_iso_code). */
export const LLM_SEARCH_COUNTRIES = new Set([
  "AR", "AT", "AU", "BE", "BR", "CA", "CH", "CL", "CN", "DE", "DK", "ES", "FI", "FR", "GB", "HK", "ID", "IN", "IT", "JP",
  "KR", "MX", "MY", "NL", "NO", "NZ", "PH", "PL", "PT", "RU", "SA", "SE", "TR", "TW", "US", "ZA",
])

export class AiAccessError extends Error {
  constructor(message = "AI Optimization access isn't active on the DataForSEO account.") {
    super(message)
    this.name = "AiAccessError"
  }
}

/** Access refusals become AiAccessError; other errors pass through. */
function rethrow(e: unknown): never {
  if (e instanceof DfsError && (e.kind === "auth" || (e.code !== null && e.code >= 40204 && e.code <= 40206))) {
    throw new AiAccessError()
  }
  throw e
}

export type QueueSpec = { tag: string; keyword: string; locationCode: number; languageCode: string }
export type Posted = { tag: string; id: string | null; code: number; message: string; cost: number }

/** Post queue tasks (≤100 per request). The tag carries our task key. */
export async function postQueueTasks(
  db: Db,
  model: "chatgpt" | "gemini" | "ai_overview" | "ai_mode",
  specs: QueueSpec[],
  ctx: Ctx,
): Promise<Posted[]> {
  const out: Posted[] = []
  for (let i = 0; i < specs.length; i += 100) {
    const batch = specs.slice(i, i + 100)
    const body = batch.map((s) => ({
      keyword: s.keyword,
      location_code: s.locationCode,
      language_code: s.languageCode,
      tag: s.tag.slice(0, 255),
      ...(model === "ai_overview" ? { depth: 10, load_async_ai_overview: true } : {}),
    }))
    let env
    try {
      env = await dfsCall(db, "POST", `${QUEUE_PATH[model]}/task_post`, {
        api: API_OF(model),
        body,
        clientId: ctx.clientId,
        ref: ctx.ref,
        idempotent: false,
      })
    } catch (e) {
      rethrow(e)
    }
    const byTag = new Map((env.tasks ?? []).map((t) => [String(t.data?.tag ?? ""), t]))
    for (const s of batch) {
      const t = byTag.get(s.tag.slice(0, 255))
      out.push(
        t
          ? { tag: s.tag, id: t.status_code === 20100 ? t.id : null, code: t.status_code, message: t.status_message, cost: Number(t.cost ?? 0) }
          : { tag: s.tag, id: null, code: 0, message: "No task came back.", cost: 0 },
      )
    }
  }
  return out
}

/** Ids of finished queue tasks for one platform (free). */
export async function queueTasksReady(db: Db, model: "chatgpt" | "gemini" | "ai_overview" | "ai_mode"): Promise<Set<string>> {
  try {
    const env = await dfsCall<{ id?: string }>(db, "GET", `${QUEUE_PATH[model]}/tasks_ready`, { api: API_OF(model) })
    const ids = new Set<string>()
    for (const t of env.tasks ?? []) for (const r of t.result ?? []) if (r.id) ids.add(r.id)
    return ids
  } catch (e) {
    rethrow(e)
  }
}

/** Fetch one finished queue task and normalise it. */
export async function getQueueTask(
  db: Db,
  model: "chatgpt" | "gemini" | "ai_overview" | "ai_mode",
  id: string,
  ctx: Ctx,
): Promise<{ answer: NormalizedAnswer; cost: number; pending: boolean }> {
  let env
  try {
    env = await dfsCall(db, "GET", `${QUEUE_PATH[model]}/task_get/advanced/${encodeURIComponent(id)}`, {
      api: API_OF(model),
      clientId: ctx.clientId,
      ref: ctx.ref,
    })
  } catch (e) {
    rethrow(e)
  }
  const task = env.tasks?.[0]
  if (!task) return { answer: failedAnswer("No result from the platform."), cost: 0, pending: false }
  // 40601/40602: task in queue / in progress.
  if (task.status_code === 40601 || task.status_code === 40602) return { answer: failedAnswer("Not ready."), cost: 0, pending: true }
  if (task.status_code !== 20000) return { answer: failedAnswer(task.status_message || "The platform refused this question."), cost: Number(task.cost ?? 0), pending: false }
  const result = task.result?.[0]
  const answer = model === "ai_overview" || model === "ai_mode" ? normalizeSerpAi(result) : normalizeScraper(result)
  return { answer, cost: Number(task.cost ?? 0), pending: false }
}

/** Claude or Perplexity answer, live, with web search. */
export async function llmResponseLive(
  db: Db,
  model: "claude" | "perplexity",
  input: { prompt: string; modelName: string; country: string },
  ctx: Ctx,
): Promise<{ answer: NormalizedAnswer; cost: number; countryFallback: boolean }> {
  const country = input.country.toUpperCase()
  const countryFallback = !LLM_SEARCH_COUNTRIES.has(country)
  let env
  try {
    env = await dfsCall(db, "POST", `v3/ai_optimization/${model}/llm_responses/live`, {
      api: "ai_optimization",
      body: [
        {
          user_prompt: input.prompt.slice(0, 500),
          model_name: input.modelName,
          web_search: true,
          ...(countryFallback ? {} : { web_search_country_iso_code: country }),
          max_output_tokens: 2048,
        },
      ],
      clientId: ctx.clientId,
      ref: ctx.ref,
      idempotent: false,
      timeoutMs: 180_000,
    })
  } catch (e) {
    rethrow(e)
  }
  const task = env.tasks?.[0]
  const cost = Number(task?.cost ?? env.cost ?? 0)
  if (!task || task.status_code !== 20000) {
    return { answer: failedAnswer(task?.status_message || "The platform refused this question."), cost, countryFallback }
  }
  return { answer: normalizeLlmResponse(task.result?.[0]), cost, countryFallback }
}

/** Models available through LLM Responses for one platform (free). */
export async function llmModels(db: Db, platform: "claude" | "perplexity" | "chat_gpt" | "gemini") {
  try {
    const env = await dfsCall<{ model_name?: string; web_search_supported?: boolean; web_search?: boolean }>(
      db, "GET", `v3/ai_optimization/${platform}/llm_responses/models`, { api: "ai_optimization" },
    )
    return (env.tasks?.[0]?.result ?? [])
      .map((m) => ({ name: m.model_name ?? "", webSearch: Boolean(m.web_search_supported ?? m.web_search) }))
      .filter((m) => m.name)
  } catch (e) {
    rethrow(e)
  }
}

/** Country-level location codes for one platform family (free). */
export async function platformLocations(db: Db, family: "chat_gpt" | "gemini" | "serp"): Promise<{ iso: string; code: number }[]> {
  const path = family === "serp" ? "v3/serp/google/locations" : `v3/ai_optimization/${family}/llm_scraper/locations`
  try {
    const env = await dfsCall<{ location_code?: number; location_type?: string; country_iso_code?: string }>(db, "GET", path, {
      api: family === "serp" ? "serp_google" : "ai_optimization",
    })
    return (env.tasks?.[0]?.result ?? [])
      .filter((r) => typeof r.location_code === "number" && r.country_iso_code && (!r.location_type || r.location_type === "Country"))
      .map((r) => ({ iso: r.country_iso_code!.toUpperCase(), code: r.location_code! }))
  } catch (e) {
    rethrow(e)
  }
}

/** Search volume of phrases in AI tools (one task, ≤1,000 keywords). */
export async function aiKeywordVolume(
  db: Db,
  input: { keywords: string[]; locationCode: number; languageCode: string },
  ctx: Ctx,
): Promise<Map<string, number>> {
  const env = await dfsCall<{ items?: { keyword?: string; ai_search_volume?: number; search_volume?: number }[] }>(
    db, "POST", "v3/ai_optimization/ai_keyword_data/keywords_search_volume/live",
    {
      api: "ai_optimization",
      body: [{ keywords: input.keywords.slice(0, 1000), location_code: input.locationCode, language_code: input.languageCode }],
      clientId: ctx.clientId,
      ref: ctx.ref,
    },
  ).catch(rethrow)
  const out = new Map<string, number>()
  for (const item of firstResult(env)?.items ?? []) {
    const v = item.ai_search_volume ?? item.search_volume
    if (item.keyword && typeof v === "number") out.set(item.keyword.toLowerCase(), v)
  }
  return out
}
