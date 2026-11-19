import "server-only"

import { DfsError, type Db } from "@/lib/dataforseo/client"
import { normalizeHost } from "@/lib/dataforseo/domains"
import { googleMapsLive, googleOrganicLive, type OrganicRow } from "@/lib/dataforseo/serp-live"
import type { Json, Tables } from "@/lib/supabase/database.types"
import { countryName } from "@/lib/countries"
import { regionCode, regionList, regionName } from "@/lib/regions"
import { classify, type ClassifyContext, type LibraryEntry } from "./classify"
import {
  CACHE_DAYS,
  MAX_NEW_PLACES,
  MAX_SERVICES,
  SEARCH_CONCURRENCY,
  SEARCH_DEPTH,
  type DirectoryType,
  type FilterReason,
} from "./constants"
import { onlyLocal, snapshotOf } from "./brief"
import { cleanTerm, normQuery } from "./footprints"
import { ruleScore, topicMatch } from "./scoring"
import { applyShortlist } from "./shortlist"
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

/** One place the team chose (backlink_targets), as the search job needs it. */
type Place = {
  id: string
  label: string
  searchName: string
  kind: "city" | "region" | "country"
  locationCode: number
  countryIso: string
  city: string | null
  regionName: string | null
  regionCode: string | null
}

type Context = {
  clientId: string
  name: string
  places: Place[]
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
  // US, Canada and Australia: "AZ" / "Arizona", "ON" / "Ontario", "NSW" / "New South Wales".
  const country = countryIso.toUpperCase()
  if (regionList(country)) {
    const code = regionCode(country, r)
    const name = regionName(country, code)
    if (code && name && name !== code) return { state: name, code }
  }
  return { state: r, code: r.length <= 3 ? r.toUpperCase() : null }
}

async function loadContext(db: Db, run: Run): Promise<Context> {
  const [{ data: client, error }, { data: profile }, { data: targets }] = await Promise.all([
    db.from("clients").select("id, name, industry, website, stage").eq("id", run.client_id).single(),
    db
      .from("client_business_profiles")
      .select("services, primary_category, other_categories, website")
      .eq("client_id", run.client_id)
      .maybeSingle(),
    run.kind === "rerank"
      ? db
          .from("backlink_targets")
          .select("id, label, search_name, kind, location_code, country_iso, city, region_name, region_code")
          .eq("client_id", run.client_id)
          .eq("active", true)
          .order("created_at")
      : db
          .from("backlink_targets")
          .select("id, label, search_name, kind, location_code, country_iso, city, region_name, region_code")
          .eq("client_id", run.client_id)
          .in("id", run.target_ids.length ? run.target_ids : ["00000000-0000-0000-0000-000000000000"]),
  ])
  if (error || !client) throw new StopRun("Client not found.")
  if (client.stage === "paused" || client.stage === "churned") {
    throw new StopRun("This client is paused or has left. Searches are off.")
  }
  // Keep the run's order, skipping places removed since.
  const byId = new Map((targets ?? []).map((t) => [t.id, t]))
  const order = run.kind === "rerank" ? (targets ?? []).map((t) => t.id) : run.target_ids
  const places: Place[] = order
    .map((id) => byId.get(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => ({
      id: t.id,
      label: t.label,
      searchName: t.search_name,
      kind: t.kind as Place["kind"],
      locationCode: t.location_code,
      countryIso: t.country_iso,
      city: t.city,
      regionName: t.region_name,
      regionCode: t.region_code,
    }))
  if (places.length === 0 && run.kind !== "rerank") {
    throw new StopRun("The places for this search were removed. Add places and search again.")
  }

  const services = [
    ...(profile?.services ?? []),
    ...(profile?.services?.length ? [] : [profile?.primary_category ?? "", client.industry ?? ""]),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SERVICES)
  const industry = profile?.primary_category ?? client.industry ?? null
  return {
    clientId: client.id,
    name: client.name,
    places,
    languageCode: "en",
    domain: normalizeHost(client.website ?? profile?.website ?? null),
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

/** The place a search belongs to; industry searches run from the first place. */
function placeOf(ctx: Context, targetId: string | null): Place {
  return ctx.places.find((p) => p.id === targetId) ?? ctx.places[0]
}

/** How results are judged local, or "another area", for one place. */
function placeLocality(place: Place, all: Place[]) {
  const country = place.countryIso.toUpperCase()
  const local =
    place.kind === "city"
      ? (place.city ?? place.searchName)
      : place.kind === "region"
        ? (place.regionName ?? place.searchName)
        : countryName(country)
  const regionFull = place.kind === "country" ? null : place.regionName
  const code =
    place.kind === "country" ? null : regionCode(country, place.regionCode ?? place.regionName)
  // Other states or provinces of the same country, except ones the client also targets.
  const targeted = new Set(
    all
      .filter((p) => p.countryIso.toUpperCase() === country && p.kind !== "country")
      .map((p) => regionCode(country, p.regionCode ?? p.regionName)?.toUpperCase())
      .filter(Boolean),
  )
  const list = place.kind === "country" ? null : regionList(country)
  const otherStates = (list ?? [])
    .filter((r) => !targeted.has(r.code.toUpperCase()))
    .map((r) => ({ code: r.code, name: r.name }))
  return {
    city: local.toLowerCase(),
    state: regionFull ? regionFull.toLowerCase() : null,
    stateCode: code && code.length <= 3 ? code.toLowerCase() : null,
    otherStates,
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
  locationCode: number,
  ctx: Context,
) {
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString()
  const { data } = await db
    .from("serp_result_cache")
    .select("id, items_count")
    .eq("engine", engine)
    .eq("query_norm", queryNorm)
    .eq("location_code", locationCode)
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
  locationCode: number,
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
        location_code: locationCode,
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

/** One search, run from its place: from the cache when anyone ran it there lately, else Live. */
async function runQuery(db: Db, run: Run, q: QueryRow, ctx: Context): Promise<void> {
  const locationCode = placeOf(ctx, q.target_id).locationCode
  const hit = await cached(db, "google_organic", q.query_norm, locationCode, ctx)
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
        locationCode,
        languageCode: ctx.languageCode,
        depth: SEARCH_DEPTH,
      },
      { clientId: run.client_id, ref: run.id },
    )
    const cacheId = await saveCache(
      db,
      "google_organic",
      q.query_norm,
      locationCode,
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

/** Business domains from Google Maps for the main service in one place (cached per place). */
async function mapsCompetitors(db: Db, run: Run, ctx: Context, place: Place): Promise<string[]> {
  const service = cleanTerm(ctx.services[0])
  if (!service) return []
  const queryNorm = normQuery(`${service} ${place.searchName}`)
  const hit = await cached(db, "google_maps", queryNorm, place.locationCode, ctx)
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
        locationCode: place.locationCode,
        languageCode: ctx.languageCode,
        depth: SEARCH_DEPTH,
      },
      { clientId: run.client_id, ref: run.id },
    )
    await saveCache(db, "google_maps", queryNorm, place.locationCode, ctx, [], res.competitors, res.cost)
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

type Found = {
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
  /** The places whose searches found it. */
  targets: Set<string>
  /** The first city place it was local for (fills the directory's city). */
  localPlace: Place | null
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
    ctx = await loadContext(db, run)

    const brief = snapshotOf((run.params as Rec | null)?.brief)
    if (!brief) {
      throw new StopRun("This search was started before the strategy brief. Fill in the brief and run Find places again.")
    }
    const shortlistCtx = {
      clientId: run.client_id,
      clientName: ctx.name,
      domain: ctx.domain,
      services: ctx.services,
      industry: ctx.industry,
      places: ctx.places.map((p) => ({ label: p.label, countryIso: p.countryIso })),
      matchText: ctx.matchText,
    }

    // Re-rank: no searches, just the top 30 again with the current brief.
    if (run.kind === "rerank") {
      await step(4)
      const sl = await applyShortlist(db, run, brief, shortlistCtx)
      counts.shortlist = sl
      const cost = await runCost(db, run.id)
      await db
        .from("backlink_runs")
        .update({
          status: "done",
          step: 6,
          counts: counts as Json,
          cost_usd: cost,
          error: null,
          finished_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
        })
        .eq("id", run.id)
      await db.from("activity_log").insert({
        actor_id: run.created_by,
        client_id: run.client_id,
        action: "backlink.reranked",
        meta: { review: sl.review, more: sl.more, hidden: sl.hidden, ai: sl.ai } as Json,
      })
      return
    }

    // 2. The searches were planned from the brief and saved with the run.
    let { data: queries } = await db.from("backlink_run_queries").select("*").eq("run_id", run.id)
    if (!queries?.length) throw new StopRun("This search has no planned searches. Run Find places again.")
    counts.no_services = ctx.services.length === 0
    if (run.step < 2) {
      await step(2, {
        queries_total: queries.length,
        params: {
          ...((run.params as Rec | null) ?? {}),
          places: ctx.places.map((p) => ({
            id: p.id,
            label: p.label,
            search_name: p.searchName,
            location_code: p.locationCode,
          })),
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

    // Searches DataForSEO couldn't answer are tried once more (failed ones aren't charged).
    if (!counts.retried) {
      const { data: failedRows } = await db
        .from("backlink_run_queries")
        .select("*")
        .eq("run_id", run.id)
        .eq("status", "failed")
      counts.retried = failedRows?.length ?? 0
      if (failedRows?.length) {
        await db
          .from("backlink_run_queries")
          .update({ status: "queued", error: null, done_at: null })
          .in("id", failedRows.map((q) => q.id))
        const again = failedRows.map((q) => ({ ...q, status: "queued" as const }))
        for (let i = 0; i < again.length; i += SEARCH_CONCURRENCY) {
          const problem = await budgetProblem(db)
          if (problem) throw new StopRun(problem)
          await Promise.all(again.slice(i, i + SEARCH_CONCURRENCY).map((q) => runQuery(db, run, q, ctx!)))
        }
        await step(3)
      }
    }
    queries = (await db.from("backlink_run_queries").select("*").eq("run_id", run.id)).data ?? queries

    // 4. Competitors from Google Maps, in each place.
    const competitors = new Set<string>()
    for (const place of ctx.places) {
      for (const d of await mapsCompetitors(db, run, ctx, place)) competitors.add(registrableDomain(d))
    }

    // 5. Parse every finished search.
    const { data: finished } = await db
      .from("backlink_run_queries")
      .select("id, footprint_id, target_id, query, status, cache:serp_result_cache(items, competitors)")
      .eq("run_id", run.id)
      .in("status", ["done", "cached"])
    const all = queries.length
    const failed = all - (finished?.length ?? 0)
    counts.searches = all
    counts.cached = (finished ?? []).filter((q) => q.status === "cached").length
    counts.failed = failed

    const rows: {
      q: { id: string; footprint_id: string | null; target_id: string | null; query: string }
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

    const serviceTerms = [
      ...new Set(
        [...ctx.services, ctx.industry ?? ""].map(cleanTerm).filter((x): x is string => Boolean(x)),
      ),
    ]
    const clientDomain = ctx.domain ? registrableDomain(ctx.domain) : null
    const contexts = new Map<string, ClassifyContext>(
      ctx.places.map((place) => [
        place.id,
        {
          ...placeLocality(place, ctx!.places),
          clientDomain,
          agencyDomains,
          competitorDomains: competitors,
          serviceTerms,
          library,
          blockedRoots,
          // Hide articles with nothing local only when every customer is local.
          local: onlyLocal(brief),
          excludeTerms: brief.exclude_terms,
        },
      ]),
    )

    const places = new Map<string, Found>()
    for (const { q, item, sk } of rows) {
      const place = placeOf(ctx, q.target_id)
      const c = classify(item, sk, contexts.get(place.id)!)
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
          targets: new Set(),
          localPlace: null,
        } satisfies Found)
      if (TYPE_PRIORITY.indexOf(c.type) < TYPE_PRIORITY.indexOf(p.type)) p.type = c.type
      if (!c.filterReason) {
        p.visible = true
        p.filterReason = null
      } else if (!p.visible) p.filterReason ??= c.filterReason
      p.isLocal ||= c.isLocal
      if (q.target_id) p.targets.add(q.target_id)
      if (c.isLocal && !p.localPlace && place.kind === "city") p.localPlace = place
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

    const scored = [...places.values()].map((p) => {
      const tm = topicMatch(`${p.foundTitle ?? ""} ${p.foundSnippet ?? ""} ${p.foundUrl} ${p.sk.siteKey}`, brief, ctx!.services)
      const relevance = ruleScore({
        type: p.type,
        brief,
        topicFit: tm.fit,
        isLocal: p.isLocal,
        searches: p.footprints.size || p.hits.size,
        bestPosition: p.bestPosition,
      })
      return { p, relevance, tm }
    })
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

    const items = kept.map(({ p, relevance, tm }) => ({
      site_key: p.sk.siteKey,
      domain: p.sk.domain,
      rank_target: p.sk.rankTarget,
      name: (p.foundTitle ?? p.sk.siteKey).split(/\s[|\-–—:]\s/)[0]?.slice(0, 120) || p.sk.siteKey,
      type: p.type,
      geo_scope: p.localPlace ? "city" : "unknown",
      country_code: p.localPlace?.countryIso ?? null,
      region: p.localPlace?.regionCode ?? null,
      city: p.localPlace?.city ?? null,
      industries:
        ctx!.industry && p.type === "industry_directory"
          ? [cleanTerm(ctx!.industry)].filter(Boolean)
          : [],
      status: p.visible ? "reserve" : "filtered",
      filter_reason: p.visible ? null : p.filterReason,
      is_core: false,
      source: "search",
      found_url: p.foundUrl,
      found_title: p.foundTitle,
      found_snippet: p.foundSnippet,
      best_position: p.bestPosition,
      is_local: p.isLocal,
      relevance,
      rule_score: relevance,
      topic_fit: tm.fit,
      matched_topic: tm.topic,
      target_ids: [...p.targets],
      hits: [...p.hits.values()],
    }))

    let fresh = 0
    let known = 0
    const payload = items
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

    // 5b. The top 30 (rules, site strength, Claude's review) and the Basics.
    await step(5, { counts: counts as Json })
    counts.shortlist = await applyShortlist(db, run, brief, shortlistCtx)

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
