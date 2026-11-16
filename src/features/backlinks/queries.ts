import "server-only"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Tables } from "@/lib/supabase/database.types"
import type { DirectoryType, FilterReason, OpportunityStatus, RejectReason } from "./constants"
import { scoreOf } from "./scoring"
import { displayHost } from "./site-key"

/** Reads for the Backlinks page. Everything goes through RLS (VAs see only their clients). */

export type PlaceHit = { query: string; position: number | null; url: string | null }

export type Place = {
  id: string
  status: OpportunityStatus
  filterReason: FilterReason | null
  isCore: boolean
  isLocal: boolean
  name: string
  site: string
  type: DirectoryType
  foundUrl: string | null
  foundTitle: string | null
  foundSnippet: string | null
  bestPosition: number | null
  relevance: number
  score: number
  authority: number | null
  authorityStatus: string | null
  spam: number | null
  checkedAt: string | null
  hits: PlaceHit[]
  searches: number
  rejectReason: RejectReason | null
  rejectNote: string | null
  decidedAt: string | null
  notes: string | null
  createdAt: string
  directory: {
    id: string
    status: "active" | "blocked"
    blockedReason: string | null
    submitUrl: string | null
    costType: string
    notes: string | null
    typeSource: string
  }
}

export type RunInfo = {
  id: string
  status: Tables<"backlink_runs">["status"]
  createdAt: string
  finishedAt: string | null
  queriesDone: number
  queriesTotal: number
  cost: number
  error: string | null
  counts: Record<string, unknown>
  params: {
    location_name?: string | null
    city?: string
    state_code?: string | null
    services?: string[]
  }
}

export type Quota = {
  used: number
  limit: number
  nextSearchAt: string | null
  budgetProblem: string | null
  access: "unknown" | "ok" | "denied"
  openRun: { id: string; status: string; queries_done: number; queries_total: number } | null
  strengthRunning: boolean
}

export type BacklinksData = {
  places: Place[]
  lastRun: RunInfo | null
  quota: Quota | null
  /** Listings a month in the client's plan (clients.backlinks_target). */
  target: number
}

const PAGE = 1000

async function all<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const out: T[] = []
  for (let from = 0; from < 20_000; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

export async function getBacklinksData(clientId: string): Promise<BacklinksData> {
  const supabase = await createSupabaseServerClient()

  const [opps, hits, { data: runs }, { data: quota }, { data: client }] = await Promise.all([
    all((from, to) =>
      supabase
        .from("backlink_opportunities")
        .select(
          "id, status, filter_reason, is_core, is_local, found_url, found_title, found_snippet, best_position, relevance, reject_reason, reject_note, decided_at, notes, created_at, directory:directories!inner(id, site_key, name, type, type_source, status, blocked_reason, submit_url, cost_type, notes, authority, authority_status, spam_score, authority_checked_at)",
        )
        .eq("client_id", clientId)
        .order("created_at")
        .range(from, to),
    ),
    all((from, to) =>
      supabase
        .from("backlink_opportunity_hits")
        .select("opportunity_id, footprint_id, query, position, url")
        .eq("client_id", clientId)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("backlink_runs")
      .select(
        "id, status, created_at, finished_at, queries_done, queries_total, cost_usd, error, counts, params",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.rpc("backlink_quota", { p_client_id: clientId }),
    supabase.from("clients").select("backlinks_target").eq("id", clientId).maybeSingle(),
  ])

  const hitsBy = new Map<string, { list: PlaceHit[]; footprints: Set<string> }>()
  for (const h of hits) {
    const entry = hitsBy.get(h.opportunity_id) ?? { list: [], footprints: new Set<string>() }
    entry.list.push({ query: h.query, position: h.position, url: h.url })
    entry.footprints.add(h.footprint_id ?? h.query)
    hitsBy.set(h.opportunity_id, entry)
  }

  const places: Place[] = opps.map((o) => {
    const d = o.directory as unknown as {
      id: string
      site_key: string
      name: string
      type: DirectoryType
      type_source: string
      status: "active" | "blocked"
      blocked_reason: string | null
      submit_url: string | null
      cost_type: string
      notes: string | null
      authority: number | null
      authority_status: string | null
      spam_score: number | null
      authority_checked_at: string | null
    }
    const h = hitsBy.get(o.id)
    const list = (h?.list ?? []).sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    const relevance = Number(o.relevance)
    return {
      id: o.id,
      status: o.status,
      filterReason: o.filter_reason as FilterReason | null,
      isCore: o.is_core,
      isLocal: o.is_local,
      name: d.name,
      site: displayHost(d.site_key),
      type: d.type,
      foundUrl: o.found_url,
      foundTitle: o.found_title,
      foundSnippet: o.found_snippet,
      bestPosition: o.best_position,
      relevance,
      score: scoreOf(relevance, d.authority, d.spam_score),
      authority: d.authority,
      authorityStatus: d.authority_status,
      spam: d.spam_score,
      checkedAt: d.authority_checked_at,
      hits: list,
      searches: h?.footprints.size ?? 0,
      rejectReason: o.reject_reason,
      rejectNote: o.reject_note,
      decidedAt: o.decided_at,
      notes: o.notes,
      createdAt: o.created_at,
      directory: {
        id: d.id,
        status: d.status,
        blockedReason: d.blocked_reason,
        submitUrl: d.submit_url,
        costType: d.cost_type,
        notes: d.notes,
        typeSource: d.type_source,
      },
    }
  })
  places.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  const r = runs?.[0]
  const q = quota as Record<string, unknown> | null
  return {
    places,
    target: client?.backlinks_target ?? 20,
    lastRun: r
      ? {
          id: r.id,
          status: r.status,
          createdAt: r.created_at,
          finishedAt: r.finished_at,
          queriesDone: r.queries_done,
          queriesTotal: r.queries_total,
          cost: Number(r.cost_usd),
          error: r.error,
          counts: (r.counts ?? {}) as Record<string, unknown>,
          params: (r.params ?? {}) as RunInfo["params"],
        }
      : null,
    quota: q
      ? {
          used: Number(q.used ?? 0),
          limit: Number(q.limit ?? 0),
          nextSearchAt: (q.next_search_at as string | null) ?? null,
          budgetProblem: (q.budget_problem as string | null) ?? null,
          access: (q.access as Quota["access"]) ?? "unknown",
          openRun: (q.open_run as Quota["openRun"]) ?? null,
          strengthRunning: Boolean(q.strength_running),
        }
      : null,
  }
}
