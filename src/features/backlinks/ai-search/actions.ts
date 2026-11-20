"use server"

import { refresh } from "next/cache"
import { after } from "next/server"

import type { ActionResult } from "@/features/tasks/schemas"
import { PermissionError, requirePermission } from "@/lib/auth"
import type { Db } from "@/lib/dataforseo/client"
import { hasAnthropicKey } from "@/lib/env.server"
import type { Permission } from "@/lib/roles"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { snapshotOf } from "../brief"
import { REJECT_REASONS, type RejectReason } from "../constants"
import { CATEGORIES, languageOf, MAX_MARKETS, planAiSearch, type CategoryKey } from "./config"
import { processAiSearchRuns } from "./pipeline"

/** Shockwave AI Search: start a run, review what it found (plan §5.2, §7). */

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

export async function startAiSearch(
  clientId: string,
  targetIds: string[],
  disabled: string[] = [],
): Promise<ActionResult<{ runId: string; estimate: number }>> {
  const denied = await guard("backlinks.discover")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (!hasAnthropicKey()) return { ok: false, error: "Claude isn't connected yet. An admin adds ANTHROPIC_API_KEY on the server." }
  if (!hasSupabaseSecretKey()) return { ok: false, error: "The server is missing its database key (SUPABASE_SECRET_KEY)." }
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
  const q = (quota ?? {}) as Record<string, unknown>
  const plan = planAiSearch({
    markets,
    brief,
    disabled: off,
    maxSearches: Number(q.max_web_searches ?? 80),
    searchPrice: Number(q.web_search_price ?? 0.01),
  })

  const { data, error } = await supabase.rpc("request_ai_search", {
    p_client_id: clientId,
    p_target_ids: ids,
    p_options: { disabled: off, planned_searches: plan.searches },
    p_brief_version: brief.version,
    p_estimate: plan.estimateUsd,
  })
  if (error || !data) return { ok: false, error: dbError(error, "Couldn't start the AI search. Try again.") }

  // The run takes a few minutes: start it after the response. The cron resumes it if this stops.
  const db = createSupabaseAdminClient() as unknown as Db
  after(async () => {
    try {
      await processAiSearchRuns(db, 1)
    } catch (e) {
      console.error("[ai-search] start failed", e)
    }
  })
  refresh()
  return { ok: true, data: { runId: String(data), estimate: plan.estimateUsd } }
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
