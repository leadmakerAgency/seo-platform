"use server"

import { refresh } from "next/cache"
import { after } from "next/server"

import type { ActionResult } from "@/features/tasks/schemas"
import { PermissionError, requirePermission } from "@/lib/auth"
import type { Db } from "@/lib/dataforseo/client"
import { hasAnthropicKey, hasDataForSeo } from "@/lib/env.server"
import { can, type Permission } from "@/lib/roles"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { snapshotOf } from "../brief"
import { REJECT_REASONS, type RejectReason } from "../constants"
import { cleanDomain, MAX_COMPETITORS, MIN_COMPETITORS, PLATFORMS } from "./competitors"
import { CATEGORIES, languageOf, MAX_MARKETS, planAiSearch, planGap, type CategoryKey } from "./config"
import { processAiSearchRuns } from "./pipeline"

/** Shockwave AI Search: start a run, review what it found (plan §5.2, §7; competitors: plan 11). */

async function guard(permission: Permission): Promise<string | null> {
  try {
    await requirePermission(permission)
    return null
  } catch (error) {
    if (error instanceof PermissionError) return error.message
    throw error
  }
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)

function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  if (["P0001", "P0002", "42501", "22023"].includes(error?.code ?? "") && error?.message) return error.message
  return fallback
}

type Quota = Record<string, unknown>

/** Whether a competitor backlinks pass can use DataForSEO's link data, or falls back to AI only. */
function gapMode(q: Quota): { mode: "dataforseo" | "ai_only"; why: string | null } {
  if (!hasDataForSeo()) return { mode: "ai_only", why: "DataForSEO isn't set up" }
  if (q.backlinks_access === "denied") return { mode: "ai_only", why: "DataForSEO Backlinks access is off" }
  if (q.dfs_budget_problem) return { mode: "ai_only", why: String(q.dfs_budget_problem) }
  if (q.dfs_low_balance) return { mode: "ai_only", why: "The DataForSEO balance is low" }
  return { mode: "dataforseo", why: null }
}

const activeCompetitors = (q: Quota) =>
  ((q.competitors as { domain: string; active: boolean }[] | null) ?? [])
    .filter((c) => c.active)
    .map((c) => c.domain)
    .slice(0, MAX_COMPETITORS)

/** The run takes a few minutes: start it after the response. The cron resumes it if this stops. */
function kick() {
  const db = createSupabaseAdminClient() as unknown as Db
  after(async () => {
    try {
      await processAiSearchRuns(db, 1)
    } catch (e) {
      console.error("[ai-search] start failed", e)
    }
  })
}

function preflight(clientId: string): string | null {
  if (!isUuid(clientId)) return "Unknown client."
  if (!hasAnthropicKey()) return "Claude isn't connected yet. An admin adds ANTHROPIC_API_KEY on the server."
  if (!hasSupabaseSecretKey()) return "The server is missing its database key (SUPABASE_SECRET_KEY)."
  return null
}

export async function startAiSearch(
  clientId: string,
  targetIds: string[],
  disabled: string[] = [],
  opts: { gap?: boolean } = {},
): Promise<ActionResult<{ runId: string; estimate: number }>> {
  const denied = await guard("backlinks.discover")
  if (denied) return { ok: false, error: denied }
  const problem = preflight(clientId)
  if (problem) return { ok: false, error: problem }
  const ids = [...new Set(targetIds)].filter(isUuid)
  if (ids.length === 0) return { ok: false, error: "Pick at least one place." }
  if (ids.length > MAX_MARKETS) return { ok: false, error: `Pick ${MAX_MARKETS} places at most for one AI search.` }
  const known = new Set<string>(CATEGORIES.map((c) => c.key))
  const off = [...new Set(disabled)].filter((d): d is CategoryKey => known.has(d))

  const supabase = await createSupabaseServerClient()
  const [{ data: briefRow }, { data: targets }, { data: quota }] = await Promise.all([
    supabase.from("backlink_briefs").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("backlink_targets").select("id, kind, country_iso, active").eq("client_id", clientId).in("id", ids),
    supabase.rpc("ai_search_quota", { p_client_id: clientId }),
  ])
  const brief = snapshotOf(briefRow)
  if (!brief) return { ok: false, error: "Fill in the strategy brief first." }
  const markets = (targets ?? [])
    .filter((t) => t.active)
    .map((t) => ({ id: t.id, kind: t.kind as "city" | "region" | "country", language: languageOf(t.country_iso) }))
  if (markets.length !== ids.length) return { ok: false, error: "Some of these places were removed or turned off. Reload the page." }
  const q = (quota ?? {}) as Quota
  const plan = planAiSearch({
    markets,
    brief,
    disabled: off,
    maxSearches: Number(q.max_web_searches ?? 80),
    searchPrice: Number(q.web_search_price ?? 0.01),
  })
  const competitors = activeCompetitors(q)
  const gm = gapMode(q)
  const gap = opts.gap
    ? planGap({
        competitors: competitors.length || MAX_COMPETITORS,
        maxSites: Number(q.gap_max_sites ?? 150),
        mode: gm.mode,
        // Conservative: priced as a fresh pull even when cached data may be reused.
        cached: false,
        searchPrice: Number(q.web_search_price ?? 0.01),
      })
    : null
  const estimate = Math.round((plan.estimateUsd + (gap?.estimateUsd ?? 0)) * 1000) / 1000

  const { data, error } = await supabase.rpc("request_ai_search", {
    p_client_id: clientId,
    p_target_ids: ids,
    p_options: {
      disabled: off,
      planned_searches: plan.searches + (gap?.searches ?? 0),
      gap: Boolean(opts.gap),
      ...(opts.gap ? { use_dataforseo: gm.mode === "dataforseo" } : {}),
    },
    p_brief_version: brief.version,
    p_estimate: estimate,
    p_kind: "full",
    p_competitors: competitors.length >= MIN_COMPETITORS ? competitors : [],
  })
  if (error || !data) return { ok: false, error: dbError(error, "Couldn't start the AI search. Try again.") }
  kick()
  refresh()
  return { ok: true, data: { runId: String(data), estimate } }
}

/**
 * Competitor backlinks on its own: where the top competitors get links, for all the client's
 * places. Reuses the client dossier when it's recent (plan 11 §1.3).
 */
export async function startCompetitorBacklinks(
  clientId: string,
  competitors: string[],
  opts: { minShared?: number; includeSingle?: boolean; maxSites?: number; refresh?: boolean; aiOnly?: boolean } = {},
): Promise<ActionResult<{ runId: string; estimate: number }>> {
  let member
  try {
    member = await requirePermission("backlinks.discover")
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: error.message }
    throw error
  }
  const problem = preflight(clientId)
  if (problem) return { ok: false, error: problem }
  const comps = [...new Set(competitors.map((c) => cleanDomain(c)).filter((d): d is string => Boolean(d)))]
  if (comps.length < MIN_COMPETITORS) return { ok: false, error: `Pick at least ${MIN_COMPETITORS} competitors.` }
  if (comps.length > MAX_COMPETITORS) return { ok: false, error: `Pick ${MAX_COMPETITORS} competitors at most.` }

  const supabase = await createSupabaseServerClient()
  const [{ data: briefRow }, { data: targets }, { data: quota }] = await Promise.all([
    supabase.from("backlink_briefs").select("version").eq("client_id", clientId).maybeSingle(),
    supabase.from("backlink_targets").select("id").eq("client_id", clientId).eq("active", true).order("created_at").limit(MAX_MARKETS),
    supabase.rpc("ai_search_quota", { p_client_id: clientId }),
  ])
  if (!briefRow) return { ok: false, error: "Fill in the strategy brief first." }
  const ids = (targets ?? []).map((t) => t.id)
  if (ids.length === 0) return { ok: false, error: "Add at least one place first." }
  const q = (quota ?? {}) as Quota
  const gm = opts.aiOnly ? { mode: "ai_only" as const, why: "AI only was picked" } : gapMode(q)
  const cap = Number(q.gap_max_sites ?? 150)
  const maxSites = Math.min(cap, Math.max(20, Math.round(opts.maxSites ?? cap)))
  // A fresh pull (full price) is for admins and managers.
  const refreshData = Boolean(opts.refresh) && can(member.role, "backlinks.library")
  const gap = planGap({
    competitors: comps.length,
    maxSites,
    mode: gm.mode,
    cached: false,
    searchPrice: Number(q.web_search_price ?? 0.01),
  })

  const { data, error } = await supabase.rpc("request_ai_search", {
    p_client_id: clientId,
    p_target_ids: ids,
    p_options: {
      gap: true,
      use_dataforseo: gm.mode === "dataforseo",
      min_shared: Math.min(5, Math.max(1, Math.round(opts.minShared ?? Number(q.gap_min_shared ?? 2)))),
      include_single: Boolean(opts.includeSingle),
      max_sites: maxSites,
      refresh: refreshData,
      planned_searches: gap.searches,
    },
    p_brief_version: briefRow.version,
    p_estimate: gap.estimateUsd,
    p_kind: "competitors",
    p_competitors: comps,
  })
  if (error || !data) return { ok: false, error: dbError(error, "Couldn't start the competitor backlinks search. Try again.") }
  kick()
  refresh()
  return { ok: true, data: { runId: String(data), estimate: gap.estimateUsd } }
}

/** The client's competitors (≤ 5 active). Everyone who can find places can edit them. */
export async function saveCompetitors(
  clientId: string,
  items: { domain: string; name?: string | null }[],
): Promise<ActionResult<{ saved: number }>> {
  const denied = await guard("backlinks.discover")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const clean: { domain: string; name: string | null }[] = []
  for (const it of items.slice(0, 20)) {
    const d = cleanDomain(it.domain ?? "")
    if (!d) return { ok: false, error: `"${it.domain}" isn't a web address. Use a domain like competitor.com.` }
    if (PLATFORMS.has(d)) return { ok: false, error: `${d} is a big platform, not a competitor.` }
    if (!clean.some((c) => c.domain === d)) clean.push({ domain: d, name: it.name?.trim().slice(0, 120) || null })
  }
  if (clean.length > MAX_COMPETITORS) return { ok: false, error: `Keep ${MAX_COMPETITORS} competitors at most.` }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("save_client_competitors", { p_client_id: clientId, p_items: clean })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the competitors. Try again.") }
  refresh()
  return { ok: true, data: { saved: Number(data ?? clean.length) } }
}

export async function reviewAiProspects(
  ids: string[],
  decision: "approve" | "reject" | "restore" | "promote",
  reason?: RejectReason | null,
  note?: string | null,
): Promise<ActionResult<{ changed: number }>> {
  const denied = await guard("backlinks.review")
  if (denied) return { ok: false, error: denied }
  const clean = [...new Set(ids)].filter(isUuid)
  if (clean.length === 0) return { ok: false, error: "Pick at least one place." }
  if (!["approve", "reject", "restore", "promote"].includes(decision)) return { ok: false, error: "Unknown decision." }
  if (decision === "reject" && (!reason || !REJECT_REASONS.includes(reason))) {
    return { ok: false, error: "Pick a reason for rejecting." }
  }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("review_ai_prospects", {
    p_ids: clean,
    p_decision: decision,
    p_reason: decision === "reject" ? reason! : undefined,
    p_note: note?.trim() ? note.trim().slice(0, 500) : undefined,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save. Try again.") }
  refresh()
  return { ok: true, data: { changed: Number(data ?? 0) } }
}
