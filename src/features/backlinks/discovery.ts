import "server-only"

import { DfsError, type Db } from "@/lib/dataforseo/client"
import { normalizeHost } from "@/lib/dataforseo/domains"
import { googleMapsLive, googleOrganicLive, type OrganicRow } from "@/lib/dataforseo/serp-live"
import type { Json, Tables } from "@/lib/supabase/database.types"
import { US_STATES } from "@/features/rankings/constants"
import { ensureRankSettings, syncAndResolve } from "@/features/rankings/setup"
import { classify, type ClassifyContext, type LibraryEntry } from "./classify"
import {
  CACHE_DAYS,
  MAX_NEW_PLACES,
  MAX_QUERIES,
  MAX_SERVICES,
  SEARCH_CONCURRENCY,
  SEARCH_DEPTH,
  type DirectoryType,
  type FilterReason,
} from "./constants"
import { buildQueries, cleanTerm, normQuery, type Footprint } from "./footprints"
import { relevanceOf } from "./scoring"
import { registrableDomain, siteKeyOf, type SiteKey } from "./site-key"

/**
 * "Find places" (docs/plans/backlinks/02-find-places.md). One run per client at a time,
 * claimed by public.dfs_claim_backlink_run(); every search is a row created up front, so a
 * resumed run only does what is left. A 60 s heartbeat keeps cron from starting a second
 * worker while a slow call is in flight.
 */

type Run = Tables<"backlink_runs">
type QueryRow = Tables<"backlink_run_queries">
type Rec = Record<string, unknown>

const DEVICE = "desktop"
const HEARTBEAT_MS = 60_000
const STORE_CHUNK = 100

class StopRun extends Error {}

/** Claims and runs queued searches (or resumes a stalled one). */
export async function processBacklinkRuns(db: Db, max = 1): Promise<number> {
  let done = 0
  for (let i = 0; i < max; i++) {
    const { data, error } = await db.rpc("dfs_claim_backlink_run")
    if (error) throw new Error(`Could not claim a backlink search: ${error.message}`)
    const run = (data as Run[] | null)?.[0]
    if (!run) break
    await runDiscovery(db, run)
    done++
  }
  return done
}

type Context = {
  clientId: string
  name: string
  city: string
  state: string | null
  stateCode: string | null
  countryIso: string
  locationCode: number
  locationName: string | null
  languageCode: string
  domain: string | null
  services: string[]
  industry: string | null
  matchText: string
}

/** Full state name and code from whatever the client record holds ("AZ" or "Arizona"). */
export function stateOf(
  region: string | null,
  countryIso: string,
): { state: string | null; code: string | null } {
  const r = region?.trim() ?? ""
  if (!r) return { state: null, code: null }
  if (countryIso.toUpperCase() === "US") {
    const code = r.toUpperCase()
    if (US_STATES[code]) return { state: US_STATES[code], code }
    const hit = Object.entries(US_STATES).find(([, name]) => name.toLowerCase() === r.toLowerCase())
    if (hit) return { state: hit[1], code: hit[0] }
  }
  return { state: r, code: r.length <= 3 ? r.toUpperCase() : null }
}

async function loadContext(db: Db, clientId: string): Promise<Context> {
  const [{ data: client, error }, { data: profile }] = await Promise.all([
    db
      .from("clients")
      .select("id, name, city, region, country_code, industry, website, stage")
      .eq("id", clientId)
      .single(),
    db
      .from("client_business_profiles")
      .select("services, primary_category, other_categories, website")
      .eq("client_id", clientId)
      .maybeSingle(),
  ])
  if (error || !client) throw new StopRun("Client not found.")
  if (client.stage === "paused" || client.stage === "churned") {
    throw new StopRun("This client is paused or has left. Searches are off.")
  }
  if (!client.city?.trim()) throw new StopRun("Add the client's city in Edit details first.")

  let rank = await ensureRankSettings(db, clientId)
  if (rank.needsLocationSync || rank.settings.location_code === null) {
    await syncAndResolve(db, clientId, rank.countryIso)
    rank = await ensureRankSettings(db, clientId)
  }
  if (rank.settings.location_code === null) {
    throw new StopRun(
      `DataForSEO doesn't know "${client.city}" as a place. Pick the client's location in Rankings → Settings.`,
    )
  }

  const { state, code } = stateOf(client.region, client.country_code)
  const services = [
    ...(profile?.services ?? []),
    ...(profile?.services?.length ? [] : [profile?.primary_category ?? "", client.industry ?? ""]),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SERVICES)
  const industry = profile?.primary_category ?? client.industry ?? null
  return {
    clientId,
    name: client.name,
    city: client.city.trim(),
    state,
    stateCode: code,
    countryIso: client.country_code,
    locationCode: rank.settings.location_code,
    locationName: rank.settings.location_name,
    languageCode: rank.settings.language_code || "en",
    domain: rank.domain,
    services,
    industry,
    matchText: [
      industry,
      client.industry,
      ...(profile?.other_categories ?? []),
      ...(profile?.services ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  }
}

async function budgetProblem(db: Db): Promise<string | null> {
  const { data } = await db.rpc("dfs_backlinks_budget_problem")
  return (data as string | null) ?? null
}

async function cached(
  db: Db,
  engine: "google_organic" | "google_maps",
  queryNorm: string,
  ctx: Context,
) {
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString()
  const { data } = await db
    .from("serp_result_cache")
    .select("id, items_count")
    .eq("engine", engine)
    .eq("query_norm", queryNorm)
    .eq("location_code", ctx.locationCode)
    .eq("language_code", ctx.languageCode)
    .eq("device", DEVICE)
    .gte("depth", SEARCH_DEPTH)
    .gte("fetched_at", since)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function saveCache(
  db: Db,
  engine: "google_organic" | "google_maps",
  queryNorm: string,
  ctx: Context,
  items: OrganicRow[],
  competitors: string[],
  cost: number,
): Promise<string> {
  const { data, error } = await db
    .from("serp_result_cache")
    .upsert(
      {
        engine,
        query_norm: queryNorm,
        location_code: ctx.locationCode,
        language_code: ctx.languageCode,
        device: DEVICE,
        depth: SEARCH_DEPTH,
        items: items as unknown as Json,
        competitors,
        items_count: items.length,
        cost_usd: cost,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "engine,query_norm,location_code,language_code,device,depth" },
    )
    .select("id")
    .single()
  if (error || !data) throw new Error(`Could not save search results: ${error?.message}`)
  return data.id
}

/** One search: from the cache when another client in the same city ran it lately, else Live. */
async function runQuery(db: Db, run: Run, q: QueryRow, ctx: Context): Promise<void> {
  const hit = await cached(db, "google_organic", q.query_norm, ctx)
  if (hit) {
    await db
      .from("backlink_run_queries")
      .update({
        status: "cached",
        cache_id: hit.id,
        items_count: hit.items_count,
        done_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", q.id)
    return
  }
  try {
    const res = await googleOrganicLive(
      db,
      {
        keyword: q.query,
        locationCode: ctx.locationCode,
        languageCode: ctx.languageCode,
        depth: SEARCH_DEPTH,
      },
      { clientId: run.client_id, ref: run.id },
    )
    const cacheId = await saveCache(
      db,
      "google_organic",
      q.query_norm,
      ctx,
      res.items,
      res.competitors,
      res.cost,
    )
    await db
      .from("backlink_run_queries")
      .update({
        status: "done",
        cache_id: cacheId,
        items_count: res.items.length,
        cost_usd: res.cost,
        done_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", q.id)
  } catch (e) {
    // No funds, bad login: stop the whole run. Anything else: this search failed, go on.
    if (e instanceof DfsError && (e.kind === "funds" || e.kind === "auth")) throw e
    const message = e instanceof Error ? e.message : String(e)
    await db
      .from("backlink_run_queries")
      .update({ status: "failed", error: message.slice(0, 500), done_at: new Date().toISOString() })
      .eq("id", q.id)
  }
}

/** Business domains from Google Maps for the main service (cached per city). */
async function mapsCompetitors(db: Db, run: Run, ctx: Context): Promise<string[]> {
  const service = cleanTerm(ctx.services[0])
  if (!service) return []
  const queryNorm = normQuery(`${service} ${ctx.city} ${ctx.stateCode ?? ctx.state ?? ""}`)
  const hit = await cached(db, "google_maps", queryNorm, ctx)
  if (hit) {
    const { data } = await db
      .from("serp_result_cache")
      .select("competitors")
      .eq("id", hit.id)
      .single()
    return data?.competitors ?? []
  }
  try {
    const res = await googleMapsLive(
      db,
      {
        keyword: queryNorm,
        locationCode: ctx.locationCode,
        languageCode: ctx.languageCode,
        depth: SEARCH_DEPTH,
      },
      { clientId: run.client_id, ref: run.id },
    )
    await saveCache(db, "google_maps", queryNorm, ctx, [], res.competitors, res.cost)
    return res.competitors
  } catch (e) {
    if (e instanceof DfsError && (e.kind === "funds" || e.kind === "auth")) throw e
    console.error("[backlinks] maps competitors failed", run.id, e)
    return []
  }
}

type Hit = {
  query_id: string
  footprint_id: string | null
  query: string
  position: number
  url: string
}

type Place = {
  sk: SiteKey
  name: string | null
  type: DirectoryType
  visible: boolean
  filterReason: FilterReason | null
  isLocal: boolean
  bestPosition: number
  foundUrl: string
  foundTitle: string | null
  foundSnippet: string | null
  hits: Map<string, Hit>
  footprints: Set<string>
}

const TYPE_PRIORITY: DirectoryType[] = [
  "chamber",
  "industry_directory",
  "business_directory",
  "association",
  "aggregator",
  "maps",
  "review_site",
  "guest_post",
  "news_blog",
  "social",
  "government",
  "other",
]

async function inChunks<T>(
  values: string[],
  size: number,
  fn: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < values.length; i += size) out.push(...(await fn(values.slice(i, i + size))))
  return out
}

export async function runDiscovery(db: Db, run: Run): Promise<void> {
  const counts: Rec = { ...(run.counts as Rec) }
  let ctx: Context | null = null
  const beat = setInterval(() => {
    void db
      .from("backlink_runs")
      .update({ heartbeat_at: new Date().toISOString() })
      .eq("id", run.id)
  }, HEARTBEAT_MS)

  const step = async (n: number, patch: Partial<Run> = {}) => {
    await db
      .from("backlink_runs")
      .update({ ...patch, step: n, counts: counts as Json, heartbeat_at: new Date().toISOString() })
      .eq("id", run.id)
  }

  try {
    // 1. Context.
    ctx = await loadContext(db, run.client_id)

    // 2. The searches (once per run).
    let { data: queries } = await db.from("backlink_run_queries").select("*").eq("run_id", run.id)
    if (!queries?.length) {
      const { data: fps } = await db
        .from("backlink_footprints")
        .select("id, template, scope, sort")
        .eq("active", true)
      const built = buildQueries(
        (fps ?? []) as Footprint[],
        {
          city: ctx.city,
          state: ctx.state,
          stateCode: ctx.stateCode,
          services: ctx.services,
          industry: ctx.industry,
        },
        MAX_QUERIES,
      )
      if (built.queries.length === 0)
        throw new StopRun("No searches could be built. Check the client's city.")
      const { error } = await db.from("backlink_run_queries").upsert(
        built.queries.map((b) => ({
          run_id: run.id,
          client_id: run.client_id,
          footprint_id: b.footprintId,
          scope: b.scope,
          query: b.query,
          query_norm: b.queryNorm,
        })),
        { onConflict: "run_id,query_norm", ignoreDuplicates: true },
      )
      if (error) throw new Error(`Could not save the searches: ${error.message}`)
      counts.skipped_footprints = built.skipped
      counts.no_services = ctx.services.length === 0
      queries = (await db.from("backlink_run_queries").select("*").eq("run_id", run.id)).data ?? []
      await step(2, {
        queries_total: queries.length,
        params: {
          city: ctx.city,
          state: ctx.state,
          state_code: ctx.stateCode,
          location_code: ctx.locationCode,
          location_name: ctx.locationName,
          language_code: ctx.languageCode,
          services: ctx.services,
          industry: ctx.industry,
        } as Json,
      })
    }

    // 3. Run what is left, a few at a time, re-checking the budget before each batch.
    const todo = queries.filter((q) => q.status === "queued")
    for (let i = 0; i < todo.length; i += SEARCH_CONCURRENCY) {
      const problem = await budgetProblem(db)
      if (problem) throw new StopRun(problem)
      await Promise.all(
        todo.slice(i, i + SEARCH_CONCURRENCY).map((q) => runQuery(db, run, q, ctx!)),
      )
      const { count } = await db
        .from("backlink_run_queries")
        .select("id", { count: "exact", head: true })
        .eq("run_id", run.id)
        .neq("status", "queued")
      await step(3, { queries_done: count ?? 0 })
    }

    // 4. Competitors from Google Maps.
    const competitors = new Set(
      (await mapsCompetitors(db, run, ctx)).map((d) => registrableDomain(d)),
    )

    // 5. Parse every finished search.
    const { data: finished } = await db
      .from("backlink_run_queries")
      .select("id, footprint_id, query, status, cache:serp_result_cache(items, competitors)")
      .eq("run_id", run.id)
      .in("status", ["done", "cached"])
    const all = queries.length
    const failed = all - (finished?.length ?? 0)
    counts.searches = all
    counts.cached = (finished ?? []).filter((q) => q.status === "cached").length
    counts.failed = failed

    const rows: {
      q: { id: string; footprint_id: string | null; query: string }
      item: OrganicRow
      sk: SiteKey
    }[] = []
    for (const q of finished ?? []) {
      const cache = q.cache as { items: Json; competitors: string[] } | null
      for (const d of cache?.competitors ?? []) competitors.add(registrableDomain(d))
      for (const item of (cache?.items ?? []) as unknown as OrganicRow[]) {
        if (!item?.url) continue
        const sk = siteKeyOf(item.url)
        if (sk) rows.push({ q, item, sk })
      }
    }
    counts.results = rows.length

    const keys = [...new Set(rows.flatMap((r) => [r.sk.siteKey, r.sk.domain]))]
    const library = new Map<string, LibraryEntry>()
    const blockedRoots = new Set<string>()
    const dirs = await inChunks(keys, 300, async (chunk) => {
      const { data } = await db
        .from("directories")
        .select("site_key, type, is_core, status")
        .in("site_key", chunk)
      return data ?? []
    })
    for (const d of dirs) {
      library.set(d.site_key, { type: d.type, isCore: d.is_core, blocked: d.status === "blocked" })
      if (d.status === "blocked") blockedRoots.add(d.site_key)
    }

    const { data: agency } = await db.from("clients").select("id, website").neq("id", run.client_id)
    const agencyDomains = new Set(
      (agency ?? [])
        .map((c) => normalizeHost(c.website))
        .filter((h): h is string => Boolean(h))
        .map(registrableDomain),
    )
    if (ctx.domain) agencyDomains.delete(registrableDomain(ctx.domain))

    const otherStates =
      ctx.countryIso.toUpperCase() === "US"
        ? Object.entries(US_STATES)
            .filter(([code]) => code !== ctx!.stateCode)
            .map(([code, name]) => ({ code, name }))
        : []
    const cctx: ClassifyContext = {
      city: ctx.city,
      state: ctx.state,
      stateCode: ctx.stateCode,
      otherStates,
      clientDomain: ctx.domain ? registrableDomain(ctx.domain) : null,
      agencyDomains,
      competitorDomains: competitors,
      serviceTerms: [
        ...new Set(
          [...ctx.services, ctx.industry ?? ""]
            .map(cleanTerm)
            .filter((s): s is string => Boolean(s)),
        ),
      ],
      library,
      blockedRoots,
    }

    const places = new Map<string, Place>()
    for (const { q, item, sk } of rows) {
      const c = classify(item, sk, cctx)
      const p =
        places.get(sk.siteKey) ??
        ({
          sk,
          name: null,
          type: c.type,
          visible: false,
          filterReason: c.filterReason,
          isLocal: false,
          bestPosition: item.p,
          foundUrl: item.url,
          foundTitle: item.title,
          foundSnippet: item.desc,
          hits: new Map(),
          footprints: new Set(),
        } satisfies Place)
      if (TYPE_PRIORITY.indexOf(c.type) < TYPE_PRIORITY.indexOf(p.type)) p.type = c.type
      if (!c.filterReason) {
        p.visible = true
        p.filterReason = null
      } else if (!p.visible) p.filterReason ??= c.filterReason
      p.isLocal ||= c.isLocal
      if (item.p < p.bestPosition) {
        p.bestPosition = item.p
        p.foundUrl = item.url
        p.foundTitle = item.title
        p.foundSnippet = item.desc
      }
      const prev = p.hits.get(q.id)
      if (!prev || item.p < prev.position) {
        p.hits.set(q.id, {
          query_id: q.id,
          footprint_id: q.footprint_id,
          query: q.query,
          position: item.p,
          url: item.url,
        })
      }
      if (q.footprint_id) p.footprints.add(q.footprint_id)
      places.set(sk.siteKey, p)
    }

    const scored = [...places.values()].map((p) => ({
      p,
      relevance: relevanceOf({
        type: p.type,
        isLocal: p.isLocal,
        searches: p.footprints.size || p.hits.size,
        bestPosition: p.bestPosition,
        isCore: library.get(p.sk.siteKey)?.isCore ?? false,
      }),
    }))
    scored.sort((a, b) => Number(b.p.visible) - Number(a.p.visible) || b.relevance - a.relevance)
    const kept = scored.slice(0, MAX_NEW_PLACES)
    counts.places = places.size
    counts.visible = scored.filter((s) => s.p.visible).length
    counts.over_cap = Math.max(0, scored.length - kept.length)
    const hidden: Record<string, number> = {}
    for (const s of kept)
      if (!s.p.visible && s.p.filterReason)
        hidden[s.p.filterReason] = (hidden[s.p.filterReason] ?? 0) + 1
    counts.hidden = hidden

    const items = kept.map(({ p, relevance }) => ({
      site_key: p.sk.siteKey,
      domain: p.sk.domain,
      rank_target: p.sk.rankTarget,
      name: (p.foundTitle ?? p.sk.siteKey).split(/\s[|\-–—:]\s/)[0]?.slice(0, 120) || p.sk.siteKey,
      type: p.type,
      geo_scope: p.isLocal ? "city" : "unknown",
      country_code: p.isLocal ? ctx!.countryIso : null,
      region: p.isLocal ? ctx!.stateCode : null,
      city: p.isLocal ? ctx!.city : null,
      industries:
        ctx!.industry && p.type === "industry_directory"
          ? [cleanTerm(ctx!.industry)].filter(Boolean)
          : [],
      status: p.visible ? "pending_review" : "filtered",
      filter_reason: p.visible ? null : p.filterReason,
      is_core: false,
      found_url: p.foundUrl,
      found_title: p.foundTitle,
      found_snippet: p.foundSnippet,
      best_position: p.bestPosition,
      is_local: p.isLocal,
      relevance,
      hits: [...p.hits.values()],
    }))

    // Core listings for the client's country (industry ones only when they match).
    const { data: core } = await db
      .from("directories")
      .select(
        "site_key, domain, rank_target, name, type, submit_url, core_countries, core_industries",
      )
      .eq("is_core", true)
      .eq("status", "active")
    const coreItems = (core ?? [])
      .filter((d) => d.core_countries.includes(ctx!.countryIso.toUpperCase()))
      .filter(
        (d) =>
          d.core_industries.length === 0 ||
          d.core_industries.some((t) => ctx!.matchText.includes(t)),
      )
      .map((d) => ({
        site_key: d.site_key,
        domain: d.domain,
        rank_target: d.rank_target,
        name: d.name,
        type: d.type,
        status: "pending_review",
        filter_reason: null,
        is_core: true,
        found_url: d.submit_url,
        found_title: d.name,
        found_snippet: null,
        best_position: null,
        is_local: false,
        relevance: relevanceOf({
          type: d.type,
          isLocal: false,
          searches: 0,
          bestPosition: null,
          isCore: true,
        }),
        hits: [],
      }))
    counts.core = coreItems.length

    let fresh = 0
    let known = 0
    const payload = [...coreItems, ...items]
    for (let i = 0; i < payload.length; i += STORE_CHUNK) {
      const { data, error } = await db.rpc("dfs_store_backlink_candidates", {
        p_run_id: run.id,
        p_items: payload.slice(i, i + STORE_CHUNK) as unknown as Json,
      })
      if (error) throw new Error(`Could not save the places: ${error.message}`)
      const r = data as { new?: number; known?: number } | null
      fresh += r?.new ?? 0
      known += r?.known ?? 0
    }
    counts.new = fresh
    counts.known = known

    // 6. Done.
    const cost = await runCost(db, run.id)
    const mostlyFailed = all > 0 && failed / all > 0.5
    await db
      .from("backlink_runs")
      .update({
        status: mostlyFailed ? "failed" : "done",
        step: 6,
        counts: counts as Json,
        queries_done: all,
        cost_usd: cost,
        error: mostlyFailed
          ? `${failed} of ${all} searches failed. The places found so far are saved.`
          : null,
        finished_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
      })
      .eq("id", run.id)
    await db.from("activity_log").insert({
      actor_id: run.created_by,
      client_id: run.client_id,
      action: "backlink.discovery_finished",
      meta: {
        searches: all,
        cached: counts.cached,
        new: fresh,
        known,
        failed,
        cost: Math.round(cost * 100) / 100,
      } as Json,
    })
    await notify(db, run, mostlyFailed ? "backlinks_failed" : "backlinks_found")
  } catch (e) {
    const message =
      e instanceof StopRun || e instanceof DfsError
        ? e.message
        : e instanceof Error
          ? e.message
          : "The search failed."
    if (!(e instanceof StopRun)) console.error("[backlinks] search failed", run.id, e)
    await db
      .from("backlink_runs")
      .update({
        status: "failed",
        error: message.slice(0, 500),
        counts: counts as Json,
        cost_usd: await runCost(db, run.id),
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id)
    await notify(db, run, "backlinks_failed")
  } finally {
    clearInterval(beat)
  }
}

async function runCost(db: Db, runId: string): Promise<number> {
  const { data } = await db.from("dfs_calls").select("cost_usd").eq("ref", runId)
  return Math.round((data ?? []).reduce((n, r) => n + Number(r.cost_usd), 0) * 10_000) / 10_000
}

async function notify(db: Db, run: Run, kind: "backlinks_found" | "backlinks_failed") {
  if (!run.created_by) return
  const { error } = await db
    .from("notifications")
    .insert({ recipient_id: run.created_by, kind, client_id: run.client_id })
  if (error) console.error("[backlinks] notification failed", error.message)
}
