import "server-only"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { snapshotOf, type BriefSnapshot } from "../brief"
import type { OpportunityStatus, RejectReason } from "../constants"
import type { Target } from "../queries"
import { displayHost } from "../site-key"
import type { CategoryKey } from "./config"
import type { Dossier } from "./schemas"

/** What the Shockwave AI Search tab reads (plan §7). */

export type AiEvidence = { quote?: string; url?: string; query?: string; finder?: string; why?: string; action?: string }

export type AiVerification = {
  checked_at?: string
  status?: string
  http?: number | null
  final_url?: string | null
  lang?: string | null
  words?: number
  outbound?: { total: number; dofollow: number; nofollow: number; sponsored: number; ugc: number }
  page_nofollow?: boolean
  has_form?: boolean
  flags?: string[]
  ai_flags?: string[]
  page_kind?: string | null
  lists_businesses?: boolean | null
  action?: string | null
  submit_url?: string | null
  contact_url?: string | null
  updated?: string | null
  quote?: string | null
}

export type AiProspect = {
  id: string
  status: OpportunityStatus
  filterReason: string | null
  category: CategoryKey | string
  foundBy: string[]
  site: string
  siteKey: string
  pageUrl: string | null
  pageTitle: string | null
  evidence: AiEvidence[]
  verification: AiVerification
  scores: { relevant?: number; real?: number; reachable?: number; worth_it?: number; notes?: string } | null
  fit: number | null
  authority: number | null
  verdict: string | null
  reason: string | null
  action: string | null
  effort: string | null
  costType: string | null
  linkType: string | null
  shortlistRank: number | null
  targetIds: string[]
  rejectReason: RejectReason | null
  rejectNote: string | null
  decidedAt: string | null
  createdAt: string
  alsoInStandard: boolean
}

export type AiOpenRun = {
  id: string
  status: string
  stage: number
  counts: Record<string, unknown>
  createdAt: string
  targetIds: string[]
  costUsd: number
  webSearches: number
  tasks: Record<string, { total: number; done: number }>
}

export type AiQuota = {
  used: number
  limit: number
  maxRunUsd: number
  maxWebSearches: number
  webSearchPrice: number
  budgetProblem: string | null
  standardRunning: boolean
  openRun: AiOpenRun | null
  lastRun: { id: string; status: string; error: string | null; counts: Record<string, unknown>; createdAt: string; finishedAt: string | null } | null
}

export type AiDossier = {
  dossier: Dossier | null
  rankingMap: {
    market: string
    label: string
    queries: { q: string; intent: string; why: string }[]
    lists: { url: string; title: string; kind: string }[]
  }[]
  competitors: { market: string; label: string; competitors: { domain: string; name: string; why?: string }[] }[]
  updatedAt: string
  briefVersion: number | null
}

export type AiSearchData = {
  brief: BriefSnapshot | null
  briefMissing: string[]
  targets: Target[]
  quota: AiQuota | null
  dossier: AiDossier | null
  prospects: AiProspect[]
  /** The latest places found by the open run (the live feed). */
  feed: { id: string; site: string; title: string | null; category: string; at: string }[]
}

type Rec = Record<string, unknown>
const num = (v: unknown) => Number(v ?? 0) || 0

export async function getAiSearchData(clientId: string): Promise<AiSearchData> {
  const supabase = await createSupabaseServerClient()
  const [{ data: quotaRaw }, { data: backlinkQuota }, { data: briefRow }, { data: dossierRow }, { data: rows }, { data: standard }] =
    await Promise.all([
      supabase.rpc("ai_search_quota", { p_client_id: clientId }),
      supabase.rpc("backlink_quota", { p_client_id: clientId }),
      supabase.from("backlink_briefs").select("*").eq("client_id", clientId).maybeSingle(),
      supabase.from("ai_client_dossiers").select("*").eq("client_id", clientId).maybeSingle(),
      supabase
        .from("ai_link_prospects")
        .select("*, directory:directories!inner(site_key)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("backlink_opportunities")
        .select("directory_id")
        .eq("client_id", clientId)
        .neq("source", "ai")
        .neq("status", "filtered"),
    ])

  const q = quotaRaw as Rec | null
  const bq = backlinkQuota as Rec | null
  const open = q?.open_run as Rec | null
  const last = q?.last_run as Rec | null
  const quota: AiQuota | null = q
    ? {
        used: num(q.used),
        limit: num(q.limit),
        maxRunUsd: num(q.max_run_usd),
        maxWebSearches: num(q.max_web_searches),
        webSearchPrice: num(q.web_search_price),
        budgetProblem: (q.budget_problem as string | null) ?? null,
        standardRunning: Boolean(q.standard_running),
        openRun: open
          ? {
              id: String(open.id),
              status: String(open.status),
              stage: num(open.stage),
              counts: (open.counts ?? {}) as Record<string, unknown>,
              createdAt: String(open.created_at),
              targetIds: (open.target_ids as string[] | null) ?? [],
              costUsd: num(open.cost_usd),
              webSearches: num(open.web_searches),
              tasks: (open.tasks ?? {}) as Record<string, { total: number; done: number }>,
            }
          : null,
        lastRun: last
          ? {
              id: String(last.id),
              status: String(last.status),
              error: (last.error as string | null) ?? null,
              counts: (last.counts ?? {}) as Record<string, unknown>,
              createdAt: String(last.created_at),
              finishedAt: (last.finished_at as string | null) ?? null,
            }
          : null,
      }
    : null

  const targets: Target[] = ((bq?.targets as Rec[] | null) ?? []).map((t) => ({
    id: String(t.id),
    label: String(t.label),
    kind: t.kind as Target["kind"],
    countryIso: String(t.country_iso),
    locationName: String(t.location_name),
    searchName: String(t.search_name),
    active: Boolean(t.active),
    lastSearchedAt: (t.last_searched_at as string | null) ?? null,
    searchableAt: (t.searchable_at as string | null) ?? null,
    places: Number(t.places ?? 0),
  }))

  const inStandard = new Set((standard ?? []).map((s) => s.directory_id))
  const prospects: AiProspect[] = (rows ?? []).map((r) => {
    const siteKey = (r.directory as unknown as { site_key: string } | null)?.site_key ?? ""
    return {
      id: r.id,
      status: r.status,
      filterReason: r.filter_reason,
      category: r.category,
      foundBy: r.found_by ?? [],
      site: displayHost(siteKey),
      siteKey,
      pageUrl: r.page_url,
      pageTitle: r.page_title,
      evidence: (Array.isArray(r.evidence) ? r.evidence : []) as AiEvidence[],
      verification: (r.verification ?? {}) as AiVerification,
      scores: (r.scores && typeof r.scores === "object" && Object.keys(r.scores).length ? r.scores : null) as AiProspect["scores"],
      fit: r.fit,
      authority: r.authority,
      verdict: r.verdict,
      reason: r.reason,
      action: r.action,
      effort: r.effort,
      costType: r.cost_type,
      linkType: r.link_type,
      shortlistRank: r.shortlist_rank,
      targetIds: r.target_ids ?? [],
      rejectReason: r.reject_reason,
      rejectNote: r.reject_note,
      decidedAt: r.decided_at,
      createdAt: r.created_at,
      alsoInStandard: inStandard.has(r.directory_id),
    }
  })
  prospects.sort(
    (a, b) => (a.shortlistRank ?? 999) - (b.shortlistRank ?? 999) || (b.fit ?? -1) - (a.fit ?? -1) || a.site.localeCompare(b.site),
  )

  const feed = quota?.openRun
    ? [...prospects]
        .filter((p) => p.status !== "filtered")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6)
        .map((p) => ({ id: p.id, site: p.site, title: p.pageTitle, category: p.category, at: p.createdAt }))
    : []

  const d = dossierRow as Rec | null
  return {
    brief: snapshotOf(briefRow),
    briefMissing: Array.isArray(bq?.brief_missing) ? (bq!.brief_missing as string[]) : [],
    targets,
    quota,
    dossier: d
      ? {
          dossier: d.dossier && typeof d.dossier === "object" && Object.keys(d.dossier as Rec).length ? (d.dossier as unknown as Dossier) : null,
          rankingMap: (Array.isArray(d.ranking_map) ? d.ranking_map : []) as AiDossier["rankingMap"],
          competitors: (Array.isArray(d.competitors) ? d.competitors : []) as AiDossier["competitors"],
          updatedAt: String(d.updated_at),
          briefVersion: d.brief_version === null || d.brief_version === undefined ? null : Number(d.brief_version),
        }
      : null,
    prospects,
    feed,
  }
}
