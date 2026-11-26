import "server-only"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Tables } from "@/lib/supabase/database.types"
import type { ScanSources } from "./scan"
import type { ScanRow, ScanSource } from "./scan-sources"
import type { Verdict } from "./scan-verdicts"

/** Reads for Rankings → Ranking now (RLS: the team on clients it can see). */

export type ScanSummary = Pick<
  Tables<"rank_scans">,
  "id" | "status" | "trigger" | "step" | "created_at" | "finished_at" | "error" | "cost_usd"
> & {
  sources: ScanSources
  counts: Partial<Record<Verdict | "total" | "new" | "lost" | "low_ctr" | "page_one", number | null>> & {
    by_source?: Partial<Record<ScanSource, number>>
  }
  params: Record<string, unknown>
}

export type ScanPageRow = ScanRow & {
  tracked_id: string | null
  prev_position: number | null
  is_new: boolean
  city_position: number | null
}

export type ScanOverview = {
  latest: ScanSummary | null
  open: ScanSummary | null
  history: { id: string; created_at: string; status: string }[]
  manualUsed: number
  manualLimit: number
  settings: {
    scanAuto: boolean
    scanNextAt: string | null
    gscAccountId: string | null
    gscCountryOnly: boolean
    brandTerms: string[]
  } | null
  gscAccounts: { id: string; site: string; status: string }[]
  hasWebsite: boolean
  hasGbp: boolean
}

const SUMMARY = "id, status, trigger, step, created_at, finished_at, error, cost_usd, sources, counts, params"

export async function getScanOverview(clientId: string, website: string | null): Promise<ScanOverview> {
  const db = await createSupabaseServerClient()
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(7, 0, 0, 0) // midnight in Phoenix
  const [scans, settings, accounts, quota, used] = await Promise.all([
    db.from("rank_scans").select(SUMMARY).eq("client_id", clientId).order("created_at", { ascending: false }).limit(8),
    db
      .from("rank_settings")
      .select("scan_auto, scan_next_at, gsc_account_id, gsc_country_only, brand_terms, last_scan_id")
      .eq("client_id", clientId)
      .maybeSingle(),
    db
      .from("social_accounts")
      .select("id, platform, status, username, display_name")
      .eq("client_id", clientId)
      .in("platform", ["googlesearchconsole", "googlebusiness"])
      .neq("status", "removed"),
    db.from("dfs_settings").select("rank_scans_per_client_month").maybeSingle(),
    db
      .from("rank_scans")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("trigger", "manual")
      .neq("status", "failed")
      .gte("created_at", monthStart.toISOString()),
  ])
  const list = (scans.data ?? []) as unknown as ScanSummary[]
  const open = list.find((s) => s.status === "queued" || s.status === "running") ?? null
  const finished = list.filter((s) => s.status === "done" || s.status === "partial")
  const latest =
    finished.find((s) => s.id === settings.data?.last_scan_id) ?? finished[0] ?? list.find((s) => s.status === "failed") ?? null
  const acc = accounts.data ?? []
  return {
    latest,
    open,
    history: list.map((s) => ({ id: s.id, created_at: s.created_at, status: s.status })),
    manualUsed: used.count ?? 0,
    manualLimit: quota.data?.rank_scans_per_client_month ?? 4,
    settings: settings.data
      ? {
          scanAuto: settings.data.scan_auto,
          scanNextAt: settings.data.scan_next_at,
          gscAccountId: settings.data.gsc_account_id,
          gscCountryOnly: settings.data.gsc_country_only,
          brandTerms: settings.data.brand_terms,
        }
      : null,
    gscAccounts: acc
      .filter((a) => a.platform === "googlesearchconsole")
      .map((a) => ({ id: a.id, site: a.username || a.display_name || "Search Console site", status: a.status })),
    hasWebsite: Boolean(website?.trim()),
    hasGbp: acc.some((a) => a.platform === "googlebusiness" && a.status === "connected"),
  }
}

export type ScanFilter = {
  verdict: Verdict | null
  source: ScanSource | "several" | null
  q: string | null
  untracked: boolean
}

export async function getScanPage(
  clientId: string,
  scanId: string,
  f: ScanFilter,
  limit = 500,
): Promise<{ total: number; rows: ScanPageRow[] }> {
  const db = await createSupabaseServerClient()
  const { data, error } = await db.rpc("rank_scan_page", {
    p_client_id: clientId,
    p_scan_id: scanId,
    p_verdict: f.verdict ?? undefined,
    p_source: f.source ?? undefined,
    p_q: f.q ?? undefined,
    p_untracked: f.untracked,
    p_limit: limit,
    p_offset: 0,
  })
  if (error) throw new Error(`Could not load the scan: ${error.message}`)
  const d = (data ?? {}) as { total?: number; rows?: ScanPageRow[] }
  const toNum = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    total: d.total ?? 0,
    rows: (d.rows ?? []).map((r) => ({
      ...r,
      position: toNum(r.position),
      gsc_position: toNum(r.gsc_position),
      gsc_ctr: toNum(r.gsc_ctr),
      prev_position: toNum(r.prev_position),
      dfs_etv: toNum(r.dfs_etv),
      cpc: toNum(r.cpc),
    })),
  }
}

export type LostRow = { keyword_norm: string; phrase: string; verdict: Verdict; position: number | null; sources: ScanSource[]; gsc_clicks: number | null }

export async function getScanLost(clientId: string, scanId: string): Promise<LostRow[]> {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("rank_scan_lost", { p_client_id: clientId, p_scan_id: scanId })
  return ((data ?? []) as LostRow[]).map((r) => ({ ...r, position: r.position === null ? null : Number(r.position) }))
}

/** One keyword's positions across the client's recent scans (detail sheet). */
export async function getScanHistory(clientId: string, norm: string) {
  const db = await createSupabaseServerClient()
  const { data } = await db
    .from("rank_scan_keywords")
    .select("scan_id, position, gsc_clicks, verdict, scan:rank_scans!inner(created_at, status)")
    .eq("client_id", clientId)
    .eq("keyword_norm", norm)
    .limit(12)
  return (data ?? [])
    .map((r) => ({
      at: (r.scan as { created_at: string }).created_at,
      position: r.position === null ? null : Number(r.position),
      clicks: r.gsc_clicks,
      verdict: r.verdict as Verdict | null,
    }))
    .sort((a, b) => a.at.localeCompare(b.at))
}

/** The latest scan's verdict for tracked keywords (keep protection in the Keywords tab). */
export type TrackedScanFact = { verdict: Verdict; reasons: string[]; position: number | null; clicks: number | null }

export async function getTrackedScanFacts(clientId: string, phrases: string[]): Promise<Map<string, TrackedScanFact>> {
  const out = new Map<string, TrackedScanFact>()
  if (!phrases.length) return out
  const db = await createSupabaseServerClient()
  const { data: s } = await db.from("rank_settings").select("last_scan_id").eq("client_id", clientId).maybeSingle()
  if (!s?.last_scan_id) return out
  const { data } = await db
    .from("rank_scan_keywords")
    .select("keyword_norm, verdict, reasons, position, gsc_clicks")
    .eq("scan_id", s.last_scan_id)
    .in("keyword_norm", phrases.slice(0, 300))
  for (const r of data ?? []) {
    if (!r.verdict) continue
    out.set(r.keyword_norm, {
      verdict: r.verdict as Verdict,
      reasons: r.reasons,
      position: r.position === null ? null : Number(r.position),
      clicks: r.gsc_clicks,
    })
  }
  return out
}
