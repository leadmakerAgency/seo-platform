import "server-only"

import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Every Find places, Re-rank and stand-alone strength check for a client, with its full cost
 * (public.backlink_run_history, migration 0040): Google searches, Google Maps, site strength
 * and Claude's review. dfs_calls / ai_calls stay admin-only; the function returns the sums.
 */

export type RunKind = "search" | "rerank" | "strength"

export type RunEntry = {
  id: string
  kind: RunKind
  status: string
  createdAt: string
  finishedAt: string | null
  searches: number | null
  counts: Record<string, unknown>
  error: string | null
  places: string[]
  by: string | null
  google: number
  googleCalls: number
  maps: number
  mapsCalls: number
  strength: number
  strengthDomains: number
  ai: number
  aiCalls: number
  aiInputTokens: number | null
  aiOutputTokens: number | null
  total: number
}

export type RunHistory = {
  totals: {
    allTime: number
    thisMonth: number
    lastMonth: number
    runs: number
    runsThisMonth: number
    google: number
    maps: number
    strength: number
    ai: number
  }
  entries: RunEntry[]
}

type Rec = Record<string, unknown>
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export async function getRunHistory(clientId: string): Promise<RunHistory | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("backlink_run_history", { p_client_id: clientId })
  if (error) {
    console.error("[backlinks] run history", error.message)
    return null
  }
  const h = data as Rec | null
  if (!h) return null
  const t = (h.totals ?? {}) as Rec
  return {
    totals: {
      allTime: num(t.all_time),
      thisMonth: num(t.this_month),
      lastMonth: num(t.last_month),
      runs: num(t.runs),
      runsThisMonth: num(t.runs_this_month),
      google: num(t.google),
      maps: num(t.maps),
      strength: num(t.strength),
      ai: num(t.ai),
    },
    entries: ((h.entries as Rec[] | null) ?? []).map((e) => ({
      id: String(e.id),
      kind: (["search", "rerank", "strength"].includes(String(e.kind)) ? e.kind : "search") as RunKind,
      status: String(e.status),
      createdAt: String(e.created_at),
      finishedAt: (e.finished_at as string | null) ?? null,
      searches: numOrNull(e.searches),
      counts: (e.counts ?? {}) as Record<string, unknown>,
      error: (e.error as string | null) ?? null,
      places: Array.isArray(e.places) ? e.places.map(String) : [],
      by: typeof e.by === "string" && e.by.trim() ? e.by.trim() : null,
      google: num(e.google),
      googleCalls: num(e.google_calls),
      maps: num(e.maps),
      mapsCalls: num(e.maps_calls),
      strength: num(e.strength),
      strengthDomains: num(e.strength_domains),
      ai: num(e.ai),
      aiCalls: num(e.ai_calls),
      aiInputTokens: numOrNull(e.ai_input_tokens),
      aiOutputTokens: numOrNull(e.ai_output_tokens),
      total: num(e.total),
    })),
  }
}
