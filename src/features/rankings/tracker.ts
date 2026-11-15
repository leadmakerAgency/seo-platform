import "server-only"

import {
  getSerpTask,
  postSerpTasks,
  serpTasksReady,
  type Engine,
  type SerpTaskSpec,
} from "@/lib/dataforseo/api"
import { DfsError, type Db } from "@/lib/dataforseo/client"
import { matchesDomain, normalizeHost } from "@/lib/dataforseo/domains"
import type { Json, Tables } from "@/lib/supabase/database.types"
import { ENGINES } from "./constants"
import { ensureRankSettings } from "./setup"

/**
 * Weekly rank tracking (docs/plans/rankings/02-rank-tracking.md).
 * Runs are queued by the database (schedule, "Check now", new keywords), started here,
 * filled by DataForSEO postbacks (or recovered from tasks_ready / task_get), and finished
 * by public.dfs_finalize_runs() in one transaction.
 */

type Run = Tables<"rank_runs">
type Rec = Record<string, unknown>

const str = (v: unknown) => (typeof v === "string" && v ? v : null)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Rec[]) : [])

// ---------------------------------------------------------------------------
// Starting runs
// ---------------------------------------------------------------------------

/** Claims and starts queued runs (oldest first). Returns how many were started. */
export async function startQueuedRuns(db: Db, max = 10): Promise<number> {
  let started = 0
  for (let i = 0; i < max; i++) {
    const { data, error } = await db.rpc("dfs_claim_rank_run")
    if (error) throw new Error(`Could not claim a rank run: ${error.message}`)
    const run = (data as Run[] | null)?.[0]
    if (!run) break
    await startRun(db, run)
    started++
  }
  return started
}

async function failRun(db: Db, runId: string, message: string) {
  await db
    .from("rank_runs")
    .update({ status: "failed", error: message.slice(0, 500), finished_at: new Date().toISOString() })
    .eq("id", runId)
}

async function postbackUrl(db: Db): Promise<string | null> {
  const { data } = await db.rpc("dfs_postback_config")
  const cfg = (data ?? {}) as { base_url?: string | null; token?: string | null }
  if (!cfg.base_url || !cfg.token) return null
  return `${cfg.base_url.replace(/\/+$/, "")}/api/webhooks/dataforseo?t=${encodeURIComponent(cfg.token)}&id=$id`
}

/** Posts one run's tasks (one check per engine, one task per keyword). */
export async function startRun(db: Db, run: Run): Promise<void> {
  try {
    const ctx = await ensureRankSettings(db, run.client_id)
    const s = ctx.settings
    if (s.location_code === null) {
      await failRun(db, run.id, "The client's location isn't set. Pick it in Rankings settings.")
      return
    }

    let query = db
      .from("keywords")
      .select("id, phrase")
      .eq("client_id", run.client_id)
      .is("archived_at", null)
      .eq("tracked", true)
    if (run.scope === "partial") query = query.in("id", run.keyword_ids ?? [])
    const { data: keywords } = await query
    if (!keywords?.length) {
      await failRun(db, run.id, "No keywords to check.")
      return
    }
    await db.from("rank_runs").update({ keywords_count: keywords.length }).eq("id", run.id)

    const postback = await postbackUrl(db)
    const engines = ENGINES.filter(
      (e) => s.engines.includes(e) && (e !== "bing" || s.bing_location_code !== null),
    )

    for (const engine of engines) {
      const { data: check, error } = await db
        .from("rank_checks")
        .insert({
          client_id: run.client_id,
          engine,
          status: "running",
          source: "dataforseo",
          location: engine === "bing" ? null : s.location_name,
          device: s.device,
          run_id: run.id,
          scope: run.scope,
          tasks_total: keywords.length,
        })
        .select("id")
        .single()
      if (error || !check) throw new Error(`Could not create the ${engine} check: ${error?.message}`)

      const specs: SerpTaskSpec[] = keywords.map((k) => ({
        keyword: k.phrase,
        tag: `${check.id}:${k.id}`,
        locationCode: engine === "bing" ? s.bing_location_code! : s.location_code!,
        languageCode: s.language_code,
        device: s.device as "mobile" | "desktop",
        depth: engine === "google_maps" ? 20 : s.depth,
        postbackUrl: postback,
      }))

      let posted: Awaited<ReturnType<typeof postSerpTasks>> = []
      try {
        posted = await postSerpTasks(db, engine, specs, { clientId: run.client_id, ref: run.id })
      } catch (e) {
        // Nothing was created for this engine: count every keyword as failed.
        await db.from("rank_checks").update({ tasks_failed: keywords.length }).eq("id", check.id)
        await db
          .from("rank_runs")
          .update({ error: (e instanceof Error ? e.message : String(e)).slice(0, 500) })
          .eq("id", run.id)
        if (e instanceof DfsError && (e.kind === "funds" || e.kind === "auth")) break
        continue
      }

      const created = posted
        .filter((p) => p.id)
        .map((p) => ({
          id: p.id!,
          check_id: check.id,
          keyword_id: p.tag.split(":")[1],
          client_id: run.client_id,
          engine,
        }))
      if (created.length) {
        const { error: tasksError } = await db.from("serp_tasks").insert(created)
        if (tasksError) console.error("[rankings] could not record tasks", tasksError.message)
      }
      const notCreated = posted.length - created.length
      if (notCreated > 0) {
        await db.from("rank_checks").update({ tasks_failed: notCreated }).eq("id", check.id)
      }
    }
  } catch (e) {
    console.error("[rankings] run failed to start", run.id, e)
    await failRun(db, run.id, e instanceof Error ? e.message : String(e))
  } finally {
    // A run whose every task failed to post finishes straight away.
    await db.rpc("dfs_finalize_runs")
  }
}

// ---------------------------------------------------------------------------
// Reading results
// ---------------------------------------------------------------------------

type MapsMatch = { placeId: string | null; cid: string | null }

export type ParsedRank = {
  position: number | null
  rank_absolute: number | null
  url: string | null
  title: string | null
  matched_domain: string | null
  local_pack_position: number | null
  serp_features: string[]
  in_ai_overview: boolean
  check_url: string | null
  maps_rating: number | null
  maps_reviews: number | null
  /** Maps only: the listing we matched, to remember it for next time. */
  maps_found?: { placeId: string | null; cid: string | null; name: string | null }
}

/** Does any url/domain inside this object point at the client's site? */
function mentionsDomain(value: unknown, domain: string, depth = 0): boolean {
  if (depth > 6 || !value || typeof value !== "object") return false
  for (const [key, v] of Object.entries(value as Rec)) {
    if ((key === "url" || key === "domain" || key === "source") && typeof v === "string" && matchesDomain(v, domain)) {
      return true
    }
    if (typeof v === "object" && mentionsDomain(v, domain, depth + 1)) return true
  }
  return false
}

/** Turns a task's advanced result into what we store, for one engine. */
export function parseResult(
  engine: Engine,
  result: Rec | null,
  domain: string | null,
  maps: MapsMatch,
): ParsedRank {
  const items = arr(result?.items)
  const base: ParsedRank = {
    position: null,
    rank_absolute: null,
    url: null,
    title: null,
    matched_domain: null,
    local_pack_position: null,
    serp_features: [],
    in_ai_overview: false,
    check_url: str(result?.check_url),
    maps_rating: null,
    maps_reviews: null,
  }

  if (engine === "google_maps") {
    const listings = items.filter((i) => i.type === "maps_search")
    const match =
      (maps.placeId && listings.find((i) => i.place_id === maps.placeId)) ||
      (maps.cid && listings.find((i) => String(i.cid ?? "") === maps.cid)) ||
      (domain && listings.find((i) => matchesDomain(str(i.domain) ?? str(i.url), domain))) ||
      null
    if (!match) return base
    const rating = (match.rating ?? {}) as Rec
    return {
      ...base,
      position: num(match.rank_group),
      rank_absolute: num(match.rank_absolute),
      url: str(match.url),
      title: str(match.title),
      matched_domain: normalizeHost(str(match.domain) ?? str(match.url)),
      maps_rating: num(rating.value),
      maps_reviews: num(rating.votes_count),
      maps_found: {
        placeId: str(match.place_id),
        cid: match.cid !== undefined && match.cid !== null ? String(match.cid) : null,
        name: str(match.title),
      },
    }
  }

  const features = Array.isArray(result?.item_types)
    ? (result!.item_types as unknown[]).filter((t): t is string => typeof t === "string")
    : [...new Set(items.map((i) => str(i.type)).filter((t): t is string => !!t))]

  const organic = items
    .filter((i) => i.type === "organic" && domain && matchesDomain(str(i.domain) ?? str(i.url), domain))
    .sort((a, b) => (num(a.rank_group) ?? 999) - (num(b.rank_group) ?? 999))
  const best = organic[0]

  let localPack: number | null = null
  if (engine === "google") {
    const pack = items.filter((i) => i.type === "local_pack")
    const hit = pack.find(
      (i) =>
        (domain && matchesDomain(str(i.domain) ?? str(i.url), domain)) ||
        (maps.cid && String(i.cid ?? "") === maps.cid),
    )
    localPack = hit ? (num(hit.rank_group) ?? pack.indexOf(hit) + 1) : null
  }

  const aiOverview =
    engine === "google" && !!domain && items.some((i) => i.type === "ai_overview" && mentionsDomain(i, domain))

  return {
    ...base,
    position: best ? num(best.rank_group) : null,
    rank_absolute: best ? num(best.rank_absolute) : null,
    url: best ? str(best.url) : null,
    title: best ? str(best.title) : null,
    matched_domain: best ? normalizeHost(str(best.domain) ?? str(best.url)) : null,
    local_pack_position: localPack !== null && localPack >= 1 && localPack <= 20 ? localPack : null,
    serp_features: features.slice(0, 40),
    in_ai_overview: aiOverview,
  }
}

type TaskRow = { id: string; client_id: string; engine: Engine }

const clientCache = new Map<string, { domain: string | null; maps: MapsMatch; at: number }>()

async function clientTarget(db: Db, clientId: string) {
  const cached = clientCache.get(clientId)
  if (cached && Date.now() - cached.at < 60_000) return cached
  const [{ data: client }, { data: s }] = await Promise.all([
    db.from("clients").select("website").eq("id", clientId).maybeSingle(),
    db.from("rank_settings").select("maps_place_id, maps_cid").eq("client_id", clientId).maybeSingle(),
  ])
  const value = {
    domain: normalizeHost(client?.website ?? null),
    maps: { placeId: s?.maps_place_id ?? null, cid: s?.maps_cid ?? null },
    at: Date.now(),
  }
  clientCache.set(clientId, value)
  return value
}

/** Stores one task's result exactly once (the database ignores duplicates). */
export async function applyTaskResult(
  db: Db,
  task: TaskRow,
  result: Rec | null,
  cost: number | null,
): Promise<"stored" | "duplicate" | "unknown"> {
  const target = await clientTarget(db, task.client_id)
  const parsed = parseResult(task.engine, result, target.domain, target.maps)
  const { maps_found, ...rank } = parsed
  const { data, error } = await db.rpc("dfs_store_rank", {
    p_task_id: task.id,
    p_rank: rank as unknown as Json,
    p_cost: cost ?? undefined,
  })
  if (error) throw new Error(`Could not store the result: ${error.message}`)

  // Remember the Maps listing the first time we find it by its website.
  if (data === "stored" && maps_found && !target.maps.placeId && (maps_found.placeId || maps_found.cid)) {
    await db
      .from("rank_settings")
      .update({ maps_place_id: maps_found.placeId, maps_cid: maps_found.cid, maps_name: maps_found.name })
      .eq("client_id", task.client_id)
      .is("maps_place_id", null)
    clientCache.delete(task.client_id)
  }
  return data as "stored" | "duplicate" | "unknown"
}

/** Handles one finished task by id: fetches its result if not given, stores or fails it. */
export async function settleTask(db: Db, task: TaskRow): Promise<string> {
  const r = await getSerpTask(db, task.engine, task.id, { clientId: task.client_id })
  if (r.code === 20000) return applyTaskResult(db, task, r.result, r.cost)
  if (r.code === 40102) return applyTaskResult(db, task, { items: [] }, r.cost) // no results at all
  if (r.code === 40601 || r.code === 40602) return "queued"
  const { data } = await db.rpc("dfs_fail_task", {
    p_task_id: task.id,
    p_status: r.code === 40403 ? "expired" : "failed",
    p_code: r.code,
    p_message: r.message,
  })
  return String(data)
}

// ---------------------------------------------------------------------------
// Recovery (cron): missed postbacks, slow tasks, expiry
// ---------------------------------------------------------------------------

export async function recoverTasks(db: Db): Promise<{ ready: number; swept: number; expired: number }> {
  let ready = 0
  let swept = 0

  // 1. Tasks DataForSEO couldn't deliver by postback.
  for (const engine of ENGINES) {
    let list: { id: string }[] = []
    try {
      list = await serpTasksReady(db, engine)
    } catch (e) {
      console.error("[rankings] tasks_ready failed", engine, e)
      continue
    }
    const ids = list.map((t) => t.id)
    for (let i = 0; i < ids.length; i += 200) {
      const { data: open } = await db
        .from("serp_tasks")
        .select("id, client_id, engine")
        .in("id", ids.slice(i, i + 200))
        .eq("status", "posted")
      for (const t of open ?? []) {
        await settleTask(db, t).catch((e) => console.error("[rankings] settle failed", t.id, e))
        ready++
      }
    }
  }

  // 2. Anything still open after 2 hours: ask for it directly.
  const { data: slow } = await db
    .from("serp_tasks")
    .select("id, client_id, engine")
    .eq("status", "posted")
    .lt("posted_at", new Date(Date.now() - 2 * 3_600_000).toISOString())
    .order("posted_at")
    .limit(200)
  for (const t of slow ?? []) {
    await settleTask(db, t).catch((e) => console.error("[rankings] sweep failed", t.id, e))
    swept++
  }

  // 3. Give up on tasks older than 24 hours.
  const { data: stale } = await db
    .from("serp_tasks")
    .select("id")
    .eq("status", "posted")
    .lt("posted_at", new Date(Date.now() - 24 * 3_600_000).toISOString())
    .limit(500)
  for (const t of stale ?? []) {
    await db.rpc("dfs_fail_task", {
      p_task_id: t.id,
      p_status: "expired",
      p_code: 0,
      p_message: "No result after 24 hours.",
    })
  }
  return { ready, swept, expired: stale?.length ?? 0 }
}
