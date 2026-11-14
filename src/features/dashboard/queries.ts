import "server-only"

import type { ClientHealth } from "@/features/clients/constants"
import { formatLocation } from "@/lib/format"
import { ilikePattern } from "@/lib/search"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { DASHBOARD_PAGE_SIZE, type DashboardParams } from "./search-params"

export type HealthCounts = Record<ClientHealth | "all", number>

export async function getHealthCounts(): Promise<HealthCounts> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("client_health_counts")
  if (error) throw new Error(`Could not load client health: ${error.message}`)

  const counts: HealthCounts = { all: 0, on_track: 0, needs_look: 0, action_needed: 0 }
  for (const row of data ?? []) {
    counts[row.health] = row.total
    counts.all += row.total
  }
  return counts
}

export type OpenAlert = {
  id: string
  severity: "needs_look" | "action_needed"
  title: string
  detail: string | null
  actionLabel: string | null
  actionHref: string | null
  createdAt: string
  client: { slug: string; name: string } | null
}

/** Newest unresolved alerts, most severe first. */
export async function getOpenAlerts(limit = 5): Promise<{ alerts: OpenAlert[]; total: number }> {
  const supabase = await createSupabaseServerClient()
  const { data, count, error } = await supabase
    .from("alerts")
    .select(
      "id, severity, title, detail, action_label, action_href, created_at, client:clients(slug, name)",
      { count: "exact" },
    )
    .is("resolved_at", null)
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Could not load alerts: ${error.message}`)

  return {
    total: count ?? 0,
    alerts: (data ?? []).map((a) => ({
      id: a.id,
      severity: a.severity,
      title: a.title,
      detail: a.detail,
      actionLabel: a.action_label,
      actionHref: a.action_href,
      createdAt: a.created_at,
      client: a.client,
    })),
  }
}

export type ClientRow = {
  id: string
  slug: string
  name: string
  website: string | null
  location: string
  industry: string | null
  health: ClientHealth
  stage: "onboarding" | "active" | "paused" | "churned"
  owner: { id: string; name: string } | null
  plan: { keywords: number; backlinks: number; articles: number }
  /** This month's backlinks and articles (from the Overview's month progress). */
  progress: Partial<
    Record<"backlinks" | "articles", { done: number; target: number; behind: boolean }>
  >
  createdAt: string
}

/** One page of the client list, filtered and sorted on the server. */
export async function getClientsPage(
  params: DashboardParams,
  currentMemberId: string,
): Promise<{ rows: ClientRow[]; total: number }> {
  const supabase = await createSupabaseServerClient()
  let query = supabase
    .from("clients")
    .select(
      "id, slug, name, website, city, region, country_code, industry, health, stage, keywords_target, backlinks_target, articles_target, created_at, owner:team_members!clients_owner_id_fkey(id, full_name, email)",
      { count: "exact" },
    )

  const pattern = ilikePattern(params.q)
  if (pattern) {
    query = query.or(`name.ilike.${pattern},city.ilike.${pattern},website.ilike.${pattern}`)
  }
  if (params.health) query = query.eq("health", params.health)
  if (params.country) query = query.eq("country_code", params.country)
  if (params.owner === "me") query = query.eq("owner_id", currentMemberId)

  if (params.sort === "name") {
    query = query.order("name")
  } else if (params.sort === "newest") {
    query = query.order("created_at", { ascending: false })
  } else {
    // Enum order is on_track < needs_look < action_needed, so desc = most urgent first.
    query = query.order("health", { ascending: false }).order("name")
  }

  const from = (params.page - 1) * DASHBOARD_PAGE_SIZE
  const { data, count, error } = await query.range(from, from + DASHBOARD_PAGE_SIZE - 1)
  if (error) throw new Error(`Could not load clients: ${error.message}`)

  // One call for the whole page: this month's backlinks and articles per client.
  const progress = new Map<string, ClientRow["progress"]>()
  if (data?.length) {
    const { data: summary } = await supabase.rpc("month_progress_summary", {
      p_client_ids: data.map((c) => c.id),
    })
    for (const s of summary ?? []) {
      if (s.kind !== "backlinks" && s.kind !== "articles") continue
      const entry = progress.get(s.client_id) ?? {}
      entry[s.kind] = { done: s.done, target: s.target, behind: s.status === "behind" }
      progress.set(s.client_id, entry)
    }
  }

  return {
    total: count ?? 0,
    rows: (data ?? []).map((c) => ({
      progress: progress.get(c.id) ?? {},
      id: c.id,
      slug: c.slug,
      name: c.name,
      website: c.website,
      location: formatLocation(c.city, c.region, c.country_code),
      industry: c.industry,
      health: c.health,
      stage: c.stage,
      owner: c.owner
        ? { id: c.owner.id, name: c.owner.full_name || c.owner.email.split("@")[0] }
        : null,
      plan: {
        keywords: c.keywords_target,
        backlinks: c.backlinks_target,
        articles: c.articles_target,
      },
      createdAt: c.created_at,
    })),
  }
}
