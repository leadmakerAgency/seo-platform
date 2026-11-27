"use server"

import { after } from "next/server"
import { refresh } from "next/cache"

import type { ActionResult } from "@/features/tasks/schemas"
import { PermissionError, requirePermission } from "@/lib/auth"
import type { Db } from "@/lib/dataforseo/client"
import { hasDataForSeo } from "@/lib/env.server"
import type { Json } from "@/lib/supabase/database.types"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { ENGINES } from "./constants"
import { processResearchRuns } from "./research"
import { processRankScans } from "./scan"
import { candidatesCsv, scanCsv } from "./csv"
import type { Candidate } from "./queries"
import { getScanHistory, type ScanFilter, type ScanPageRow } from "./scan-queries"
import type { ScanRow } from "./scan-sources"
import { VERDICT_META, type Verdict } from "./scan-verdicts"
import { startQueuedRuns } from "./tracker"

/**
 * Rankings actions. Each checks `rankings.manage` here; the database functions check the
 * role and the client again (security definer + private.require_rankings_manager).
 * Paid work (checks, research) is queued in the database and started right after the
 * response with `after()`; the 10-minute cron picks up anything that didn't start.
 */

async function guard(): Promise<string | null> {
  try {
    await requirePermission("rankings.manage")
    return null
  } catch (error) {
    if (error instanceof PermissionError) return error.message
    throw error
  }
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)

function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  if ((error?.code === "P0001" || error?.code === "42501") && error.message) return error.message
  return fallback
}

/** Start queued rank runs straight away (service role, after the response). */
function startRunsSoon() {
  if (!hasDataForSeo() || !hasSupabaseSecretKey()) return
  after(async () => {
    try {
      await startQueuedRuns(createSupabaseAdminClient() as Db, 5)
    } catch (e) {
      console.error("[rankings] could not start runs", e)
    }
  })
}

/** Splits pasted text into keywords: one per line, or separated by commas. */
function parseKeywords(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,;]+/)
        .map((k) => k.trim().toLowerCase().replace(/\s+/g, " "))
        .filter(Boolean),
    ),
  ]
}

export async function addKeywords(
  clientId: string,
  text: string,
): Promise<ActionResult<{ added: number; skipped: string[] }>> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const phrases = parseKeywords(text)
  if (phrases.length === 0) return { ok: false, error: "Type at least one keyword." }
  if (phrases.length > 100) return { ok: false, error: "Add 100 keywords or fewer at a time." }
  const tooLong = phrases.find((p) => p.length > 80 || p.split(" ").length > 10)
  if (tooLong) return { ok: false, error: `“${tooLong.slice(0, 40)}…” is too long (80 characters, 10 words at most).` }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("add_keywords", { p_client_id: clientId, p_phrases: phrases })
  if (error) return { ok: false, error: dbError(error, "Couldn't add the keywords. Try again.") }
  const r = data as { added?: string[]; skipped?: string[] }
  if ((r.added ?? []).length) startRunsSoon()
  refresh()
  return { ok: true, data: { added: r.added?.length ?? 0, skipped: r.skipped ?? [] } }
}

export async function stopTracking(keywordId: string, reason: string): Promise<ActionResult> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(keywordId)) return { ok: false, error: "Unknown keyword." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("archive_keyword", {
    p_keyword_id: keywordId,
    p_reason: reason.trim().slice(0, 300) || undefined,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't stop tracking it. Try again.") }
  refresh()
  return { ok: true }
}

export async function replaceKeyword(keywordId: string, phrase: string): Promise<ActionResult> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(keywordId)) return { ok: false, error: "Unknown keyword." }
  const clean = phrase.trim().toLowerCase().replace(/\s+/g, " ")
  if (!clean || clean.length > 80) return { ok: false, error: "Type the new keyword (80 characters at most)." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("replace_keyword", { p_keyword_id: keywordId, p_new_phrase: clean })
  if (error) return { ok: false, error: dbError(error, "Couldn't replace the keyword. Try again.") }
  startRunsSoon()
  refresh()
  return { ok: true }
}

export async function trackCandidate(clientId: string, keywordNorm: string): Promise<ActionResult> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("track_candidate", {
    p_client_id: clientId,
    p_keyword_norm: keywordNorm.slice(0, 200),
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't track it. Try again.") }
  startRunsSoon()
  refresh()
  return { ok: true }
}

export async function setCandidateDismissed(
  clientId: string,
  keywordNorm: string,
  dismiss: boolean,
  reason = "",
): Promise<ActionResult> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("set_candidate_status", {
    p_client_id: clientId,
    p_keyword_norm: keywordNorm.slice(0, 200),
    p_dismiss: dismiss,
    p_reason: reason.trim().slice(0, 300) || undefined,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't update it. Try again.") }
  refresh()
  return { ok: true }
}

export async function checkNow(clientId: string): Promise<ActionResult> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (!hasDataForSeo()) return { ok: false, error: "DataForSEO isn't connected yet. An admin adds the login on the server." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("request_rank_check", { p_client_id: clientId })
  if (error) return { ok: false, error: dbError(error, "Couldn't start the check. Try again.") }
  startRunsSoon()
  refresh()
  return { ok: true }
}

export async function runResearch(clientId: string): Promise<ActionResult> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (!hasDataForSeo()) return { ok: false, error: "DataForSEO isn't connected yet. An admin adds the login on the server." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("request_keyword_research", { p_client_id: clientId })
  if (error) return { ok: false, error: dbError(error, "Couldn't start the research. Try again.") }
  if (hasSupabaseSecretKey()) {
    after(async () => {
      try {
        await processResearchRuns(createSupabaseAdminClient() as Db, 1)
      } catch (e) {
        console.error("[rankings] research could not start", e)
      }
    })
  }
  refresh()
  return { ok: true }
}

export type SettingsInput = {
  location_code?: number
  engines?: string[]
  check_weekday?: number
  paused?: boolean
  topic_terms?: string[]
  negative_terms?: string[]
  maps_place_id?: string | null
}

export async function updateRankSettings(clientId: string, input: SettingsInput): Promise<ActionResult> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }

  const patch: Record<string, unknown> = {}
  if (input.location_code !== undefined) {
    if (!Number.isInteger(input.location_code)) return { ok: false, error: "Pick a location from the list." }
    patch.location_code = input.location_code
  }
  if (input.engines !== undefined) {
    const engines = input.engines.filter((e) => (ENGINES as string[]).includes(e))
    if (engines.length === 0) return { ok: false, error: "Check at least one search engine." }
    patch.engines = engines
  }
  if (input.check_weekday !== undefined) {
    if (!Number.isInteger(input.check_weekday) || input.check_weekday < 0 || input.check_weekday > 6)
      return { ok: false, error: "Pick a day." }
    patch.check_weekday = input.check_weekday
  }
  if (input.paused !== undefined) patch.paused = Boolean(input.paused)
  for (const key of ["topic_terms", "negative_terms"] as const) {
    const list = input[key]
    if (list === undefined) continue
    const clean = [...new Set(list.map((t) => t.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))]
    if (clean.length > 50) return { ok: false, error: "Use 50 terms or fewer." }
    if (clean.some((t) => t.length > 120)) return { ok: false, error: "Keep each term under 120 characters." }
    patch[key] = clean
  }
  if (input.maps_place_id === null) {
    patch.maps_place_id = ""
    patch.maps_cid = ""
    patch.maps_name = ""
  }
  if (Object.keys(patch).length === 0) return { ok: true }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("update_rank_settings", { p_client_id: clientId, p_data: patch as Json })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the settings. Try again.") }
  refresh()
  return { ok: true }
}

export type LocationOption = { code: number; name: string; type: string | null }

/** Location search for the Settings picker (from the cached DataForSEO list). */
export async function searchLocations(query: string, countryIso: string): Promise<LocationOption[]> {
  const denied = await guard()
  if (denied) return []
  const q = query.trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ")
  if (q.length < 2) return []
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("dfs_locations")
    .select("code, name, type")
    .eq("source", "google")
    .eq("country_iso", countryIso.toUpperCase().slice(0, 2))
    .ilike("name", `${q}%`)
    .order("name")
    .limit(20)
  return data ?? []
}

/** Admins: monthly budget, research runs per client, low-balance warning. */
export async function updateBudget(input: {
  monthly_budget_usd: number
  research_runs_per_client_month: number
  low_balance_usd: number
}): Promise<ActionResult> {
  try {
    await requirePermission("integrations.manage")
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: error.message }
    throw error
  }
  const budget = Number(input.monthly_budget_usd)
  const runs = Number(input.research_runs_per_client_month)
  const low = Number(input.low_balance_usd)
  if (!Number.isFinite(budget) || budget < 0 || budget > 100_000) return { ok: false, error: "Enter a budget between 0 and 100,000." }
  if (!Number.isInteger(runs) || runs < 0 || runs > 50) return { ok: false, error: "Research runs: 0 to 50." }
  if (!Number.isFinite(low) || low < 0 || low > 100_000) return { ok: false, error: "Enter a balance warning between 0 and 100,000." }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("dfs_settings")
    .update({
      monthly_budget_usd: budget,
      research_runs_per_client_month: runs,
      low_balance_usd: low,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id")
  if (error || !data?.length) return { ok: false, error: "Couldn't save. Only admins can change the budget." }
  refresh()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Ranking now (docs/plans/ranking-scan)
// ---------------------------------------------------------------------------

/** Scan what the client already ranks for, now (DataForSEO + Search Console + Business Profile). */
export async function requestRankScan(clientId: string): Promise<ActionResult> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("request_rank_scan", { p_client_id: clientId })
  if (error) return { ok: false, error: dbError(error, "Couldn't start the scan. Try again.") }
  if (hasSupabaseSecretKey()) {
    after(async () => {
      try {
        await processRankScans(createSupabaseAdminClient() as Db, 1)
      } catch (e) {
        console.error("[rankings] scan could not start", e)
      }
    })
  }
  refresh()
  return { ok: true }
}

/** Tracks keywords found by the scan (source "Already ranking for it"); respects the limit. */
export async function trackScanKeywords(
  clientId: string,
  phrases: string[],
): Promise<ActionResult<{ added: number; skipped: number }>> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const list = [...new Set(phrases.map((p) => p.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))]
    .filter((p) => p.length <= 80 && p.split(" ").length <= 10)
  if (!list.length) return { ok: false, error: "Pick at least one keyword." }
  if (list.length > 100) return { ok: false, error: "Track 100 keywords or fewer at a time." }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("add_keywords", { p_client_id: clientId, p_phrases: list, p_source: "ranked" })
  if (error) {
    const limit = /keyword|limit|more than/i.test(error.message ?? "")
    return {
      ok: false,
      error: limit && error.code === "P0001" ? error.message : dbError(error, "Couldn't track the keywords. Try again."),
    }
  }
  const r = (data ?? {}) as { added?: unknown[]; skipped?: unknown[] }
  startRunsSoon()
  refresh()
  return { ok: true, data: { added: r.added?.length ?? 0, skipped: r.skipped?.length ?? 0 } }
}

export async function saveScanSettings(
  clientId: string,
  input: { scanAuto?: boolean; gscAccountId?: string | null; gscCountryOnly?: boolean; brandTerms?: string[] },
): Promise<ActionResult> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const p: Record<string, unknown> = {}
  if (input.scanAuto !== undefined) p.scan_auto = input.scanAuto
  if (input.gscAccountId !== undefined) p.gsc_account_id = input.gscAccountId
  if (input.gscCountryOnly !== undefined) p.gsc_country_only = input.gscCountryOnly
  if (input.brandTerms !== undefined) p.brand_terms = input.brandTerms
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("save_rank_scan_settings", { p_client_id: clientId, p: p as Json })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the scan settings.") }
  refresh()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// CSV downloads (read-only, through RLS: anyone who can see the client's Rankings)
// ---------------------------------------------------------------------------

const MAX_EXPORT = 20_000
const cleanText = (v: unknown, max = 100) => (typeof v === "string" ? v.slice(0, max) : "")

async function clientCountry(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, clientId: string) {
  const { data } = await supabase.from("clients").select("country_code").eq("id", clientId).maybeSingle()
  return data?.country_code ?? null
}

/** A scan's keywords as CSV: all of them, or only those matching the Ranking now filters. */
export async function exportScanCsv(
  clientId: string,
  scanId: string,
  filter?: Partial<ScanFilter> | null,
): Promise<ActionResult<{ csv: string; count: number }>> {
  if (!isUuid(clientId) || !isUuid(scanId)) return { ok: false, error: "Unknown scan." }
  const supabase = await createSupabaseServerClient()
  const country = await clientCountry(supabase, clientId)
  const verdict = (Object.keys(VERDICT_META) as Verdict[]).find((v) => v === filter?.verdict) ?? null
  const source = (["dataforseo", "search_console", "google_business", "several"] as const).find((v) => v === filter?.source) ?? null
  const q = cleanText(filter?.q).trim() || null
  const untracked = filter?.untracked === true

  const rows: (ScanRow | ScanPageRow)[] = []
  if (verdict || source || q || untracked) {
    for (let offset = 0; offset < MAX_EXPORT; offset += 1000) {
      const { data, error } = await supabase.rpc("rank_scan_page", {
        p_client_id: clientId,
        p_scan_id: scanId,
        p_verdict: verdict ?? undefined,
        p_source: source ?? undefined,
        p_q: q ?? undefined,
        p_untracked: untracked,
        p_limit: 1000,
        p_offset: offset,
      })
      if (error) return { ok: false, error: "Couldn't read the scan." }
      const page = ((data ?? {}) as { rows?: ScanPageRow[] }).rows ?? []
      rows.push(...page)
      if (page.length < 1000) break
    }
  } else {
    for (let from = 0; from < MAX_EXPORT; from += 1000) {
      const { data, error } = await supabase
        .from("rank_scan_keywords")
        .select("*")
        .eq("client_id", clientId)
        .eq("scan_id", scanId)
        .order("score", { ascending: false, nullsFirst: false })
        .order("keyword_norm")
        .range(from, from + 999)
      if (error) return { ok: false, error: "Couldn't read the scan." }
      rows.push(...((data ?? []) as unknown as ScanRow[]))
      if (!data || data.length < 1000) break
    }
  }
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  const clean = rows.map((r) => ({
    ...r,
    position: num(r.position),
    gsc_position: num(r.gsc_position),
    gsc_ctr: num(r.gsc_ctr),
    cpc: num(r.cpc),
    ...("prev_position" in r ? { prev_position: num(r.prev_position) } : {}),
  }))
  return { ok: true, data: { csv: scanCsv(clean, country), count: clean.length } }
}

/** Find better keywords as CSV: every idea (not only the 400 on screen), or the dismissed list. */
export async function exportCandidatesCsv(
  clientId: string,
  opts: { dismissed?: boolean } = {},
): Promise<ActionResult<{ csv: string; count: number }>> {
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const dismissed = opts.dismissed === true
  const supabase = await createSupabaseServerClient()
  const [country, tracked] = await Promise.all([
    clientCountry(supabase, clientId),
    supabase.from("keywords").select("phrase").eq("client_id", clientId).eq("tracked", true).is("archived_at", null),
  ])
  const rows: Candidate[] = []
  for (let from = 0; from < MAX_EXPORT; from += 1000) {
    let query = supabase.from("keyword_candidates").select("*").eq("client_id", clientId)
    query = dismissed ? query.eq("status", "dismissed") : query.neq("status", "dismissed")
    const { data, error } = await query
      .order(dismissed ? "decided_at" : "score", { ascending: false, nullsFirst: false })
      .order("keyword_norm")
      .range(from, from + 999)
    if (error) return { ok: false, error: "Couldn't read the keyword ideas." }
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const norms = new Set((tracked.data ?? []).map((t) => t.phrase))
  return { ok: true, data: { csv: candidatesCsv(rows, country, norms, dismissed), count: rows.length } }
}

/** One keyword's positions across the client's recent scans. */
export async function scanKeywordHistory(clientId: string, norm: string) {
  if (!isUuid(clientId) || !norm || norm.length > 200) return []
  return getScanHistory(clientId, norm)
}
