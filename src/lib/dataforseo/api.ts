import "server-only"

import type { Database } from "@/lib/supabase/database.types"
import { dfsCall, DfsError, firstResult, type Db, type DfsApi } from "./client"

/** Typed wrappers for the DataForSEO endpoints Rankings uses (docs: docs/plans/rankings). */

export type Engine = Database["public"]["Enums"]["rank_engine"]
type Ctx = { clientId?: string | null; ref?: string | null }

const SERP: Record<Engine, { path: string; api: DfsApi }> = {
  google: { path: "serp/google/organic", api: "serp_google" },
  google_maps: { path: "serp/google/maps", api: "serp_maps" },
  bing: { path: "serp/bing/organic", api: "serp_bing" },
}

export type SerpTaskSpec = {
  keyword: string
  /** Comes back with the result: "<check_id>:<keyword_id>". */
  tag: string
  locationCode: number
  languageCode: string
  device: "mobile" | "desktop"
  depth: number
  postbackUrl?: string | null
}

function serpBody(engine: Engine, s: SerpTaskSpec) {
  const body: Record<string, unknown> = {
    keyword: s.keyword,
    location_code: s.locationCode,
    language_code: s.languageCode,
    device: s.device,
    depth: engine === "google_maps" ? Math.min(s.depth, 20) : s.depth,
    tag: s.tag.slice(0, 255),
  }
  if (engine === "google") {
    body.os = s.device === "mobile" ? "android" : "windows"
    body.priority = 1
    // Every result from the client's domain as its own item (not folded under the first).
    body.group_organic_results = false
  }
  if (s.postbackUrl) {
    body.postback_url = s.postbackUrl
    body.postback_data = "advanced"
  }
  return body
}

export type PostedTask = { tag: string; id: string | null; code: number; message: string }

/** Posts tasks to the standard queue in batches of 100. One entry per spec, by tag. */
export async function postSerpTasks(
  db: Db,
  engine: Engine,
  specs: SerpTaskSpec[],
  ctx: Ctx,
): Promise<PostedTask[]> {
  const out: PostedTask[] = []
  for (let i = 0; i < specs.length; i += 100) {
    const batch = specs.slice(i, i + 100)
    const env = await dfsCall(db, "POST", `v3/${SERP[engine].path}/task_post`, {
      api: SERP[engine].api,
      body: batch.map((s) => serpBody(engine, s)),
      clientId: ctx.clientId,
      ref: ctx.ref,
      idempotent: false,
    })
    const byTag = new Map((env.tasks ?? []).map((t) => [String(t.data?.tag ?? ""), t]))
    for (const spec of batch) {
      const t = byTag.get(spec.tag.slice(0, 255))
      out.push(
        t
          ? { tag: spec.tag, id: t.status_code === 20100 ? t.id : null, code: t.status_code, message: t.status_message }
          : { tag: spec.tag, id: null, code: 0, message: "No task came back for this keyword." },
      )
    }
  }
  return out
}

export type SerpTaskResult = {
  code: number
  message: string
  cost: number | null
  result: Record<string, unknown> | null
}

/** Advanced results of one task (free to fetch for 30 days). 40601/40602 = still queued. */
export async function getSerpTask(db: Db, engine: Engine, id: string, ctx: Ctx): Promise<SerpTaskResult> {
  const env = await dfsCall(db, "GET", `v3/${SERP[engine].path}/task_get/advanced/${id}`, {
    api: SERP[engine].api,
    clientId: ctx.clientId,
    ref: ctx.ref,
  })
  const task = env.tasks?.[0]
  if (!task) return { code: 0, message: "No task in the response.", cost: null, result: null }
  return {
    code: task.status_code,
    message: task.status_message,
    cost: typeof task.cost === "number" ? task.cost : null,
    result: (task.result?.[0] as Record<string, unknown> | undefined) ?? null,
  }
}

/** Tasks finished in the last 3 days that weren't collected yet (free; 20 calls a minute). */
export async function serpTasksReady(db: Db, engine: Engine): Promise<{ id: string; tag: string }[]> {
  const env = await dfsCall<{ id?: string; tag?: string }>(db, "GET", `v3/${SERP[engine].path}/tasks_ready`, {
    api: SERP[engine].api,
  })
  return (env.tasks?.[0]?.result ?? [])
    .filter((r): r is { id: string; tag?: string } => typeof r?.id === "string")
    .map((r) => ({ id: r.id, tag: r.tag ?? "" }))
}

/** A DataForSEO Labs Live call (Google). Returns every item across the task's results. */
export async function labsItems(
  db: Db,
  fn: "ranked_keywords" | "keyword_ideas" | "keyword_suggestions" | "related_keywords" | "competitors_domain",
  body: Record<string, unknown>,
  ctx: Ctx,
): Promise<Record<string, unknown>[]> {
  const env = await dfsCall<{ items?: Record<string, unknown>[] | null }>(
    db,
    "POST",
    `v3/dataforseo_labs/google/${fn}/live`,
    { api: "labs", body: [body], clientId: ctx.clientId, ref: ctx.ref, idempotent: true },
  )
  const task = env.tasks?.[0]
  if (!task) return []
  // 40102 = "no results": a fine answer for a small site.
  if (task.status_code === 40102) return []
  if (task.status_code !== 20000) throw new DfsError(task.status_message, task.status_code, null, "input")
  return (task.result ?? []).flatMap((r) => r?.items ?? [])
}

/** A DataForSEO Labs Live call (Google). Returns the task's first result. */
export async function labs<R = Record<string, unknown>>(
  db: Db,
  fn:
    | "ranked_keywords"
    | "keyword_ideas"
    | "keyword_suggestions"
    | "related_keywords"
    | "competitors_domain"
    | "bulk_keyword_difficulty"
    | "search_intent",
  body: Record<string, unknown>,
  ctx: Ctx,
): Promise<R | null> {
  const env = await dfsCall<R>(db, "POST", `v3/dataforseo_labs/google/${fn}/live`, {
    api: "labs",
    body: [body],
    clientId: ctx.clientId,
    ref: ctx.ref,
    idempotent: true,
  })
  return firstResult(env)
}

export type AdsVolumeRow = {
  keyword: string
  search_volume: number | null
  competition: string | null
  competition_index: number | null
  cpc: number | null
  monthly_searches: { year: number; month: number; search_volume: number | null }[] | null
}

/** Google Ads search volume for up to 1,000 keywords in one place (a city works). */
export async function adsSearchVolume(
  db: Db,
  keywords: string[],
  locationCode: number,
  languageCode: string,
  ctx: Ctx,
): Promise<AdsVolumeRow[]> {
  if (keywords.length === 0) return []
  if (keywords.length > 1000) throw new DfsError("At most 1,000 keywords per call.", null, null, "input")
  const env = await dfsCall<AdsVolumeRow>(db, "POST", "v3/keywords_data/google_ads/search_volume/live", {
    api: "google_ads",
    body: [{ keywords, location_code: locationCode, language_code: languageCode }],
    clientId: ctx.clientId,
    ref: ctx.ref,
    idempotent: true,
  })
  const task = env.tasks?.[0]
  if (!task) return []
  if (task.status_code !== 20000) throw new DfsError(task.status_message, task.status_code, null, "input")
  return (task.result ?? []).filter((r) => typeof r?.keyword === "string")
}

/** Account balance in USD (free). */
export async function accountBalance(db: Db): Promise<number | null> {
  const env = await dfsCall<{ money?: { balance?: number } }>(db, "GET", "v3/appendix/user_data", {
    api: "appendix",
  })
  const balance = firstResult(env)?.money?.balance
  return typeof balance === "number" ? balance : null
}

export type DfsLocation = {
  code: number
  name: string
  type: string | null
  parentCode: number | null
  countryIso: string | null
}

/** Google or Bing SERP locations for one country (free). */
export async function serpLocations(
  db: Db,
  source: "google" | "bing",
  countryIso: string,
): Promise<DfsLocation[]> {
  const env = await dfsCall<{
    location_code?: number
    location_name?: string
    location_type?: string
    location_code_parent?: number | null
    country_iso_code?: string
  }>(db, "GET", `v3/serp/${source}/locations/${countryIso.toLowerCase()}`, {
    api: source === "google" ? "serp_google" : "serp_bing",
  })
  return (env.tasks?.[0]?.result ?? [])
    .filter((r) => typeof r.location_code === "number" && typeof r.location_name === "string")
    .map((r) => ({
      code: r.location_code!,
      name: r.location_name!,
      type: r.location_type ?? null,
      parentCode: r.location_code_parent ?? null,
      countryIso: r.country_iso_code ?? null,
    }))
}
