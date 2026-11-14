import "server-only"

import type { ClientHealth, ClientStage } from "@/features/clients/constants"
import type { ActivityEntry } from "@/features/team/queries"
import { formatLocation } from "@/lib/format"
import type { Database } from "@/lib/supabase/database.types"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { DeliverableKind, PackageKind, ProgressStatus, WorkSource } from "./constants"

const nameOf = (m: { full_name: string; email: string } | null) =>
  m ? m.full_name || m.email.split("@")[0] : null

type OnboardingStepStatus = Database["public"]["Enums"]["onboarding_step_status"]

export type OverviewDetails = {
  id: string
  slug: string
  name: string
  website: string | null
  city: string | null
  region: string | null
  country: string
  location: string
  industry: string | null
  package: PackageKind
  stage: ClientStage
  health: ClientHealth
  healthReason: string | null
  startedOn: string
  owner: { id: string; name: string } | null
  targets: {
    keywords: number
    backlinks_target: number
    articles_target: number
    gbp_posts_target: number
    review_requests_target: number
    ai_fixes_target: number
  }
  contact: { name: string | null; email: string | null; phone: string | null } | null
  primaryCategory: string | null
  onboarding: {
    status: Database["public"]["Enums"]["onboarding_status"]
    stepsDone: number
    stepsTotal: number
    submittedAt: string | null
  } | null
  connections: { connected: number; broken: number }
  openRequests: number
}

const finished = (s: OnboardingStepStatus) => s === "done" || s === "skipped"

/** Everything in "Client details" plus the onboarding banner, read in parallel (RLS applies). */
export async function getOverviewDetails(clientId: string): Promise<OverviewDetails | null> {
  const supabase = await createSupabaseServerClient()
  const [client, profile, onboarding, accounts, requests] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, slug, name, website, city, region, country_code, industry, package, stage, health, health_reason, started_on, keywords_target, backlinks_target, articles_target, gbp_posts_target, review_requests_target, ai_fixes_target, owner:team_members!clients_owner_id_fkey(id, full_name, email)",
      )
      .eq("id", clientId)
      .maybeSingle(),
    supabase
      .from("client_business_profiles")
      .select("contact_name, contact_email, contact_phone, phone, primary_category")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase
      .from("client_onboarding")
      .select(
        "status, business_status, social_status, google_access_status, website_status, logins_status, submitted_at",
      )
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase.from("social_accounts").select("status").eq("client_id", clientId).neq("status", "removed"),
    supabase
      .from("client_requests")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("status", "open"),
  ])
  if (client.error) throw new Error(`Could not load the client: ${client.error.message}`)
  const c = client.data
  if (!c) return null

  const p = profile.data
  const o = onboarding.data
  const steps = o
    ? [o.business_status, o.social_status, o.google_access_status, o.website_status, o.logins_status]
    : []

  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    website: c.website,
    city: c.city,
    region: c.region,
    country: c.country_code,
    location: formatLocation(c.city, c.region, c.country_code),
    industry: c.industry,
    package: c.package,
    stage: c.stage,
    health: c.health,
    healthReason: c.health_reason,
    startedOn: c.started_on,
    owner: c.owner ? { id: c.owner.id, name: nameOf(c.owner)! } : null,
    targets: {
      keywords: c.keywords_target,
      backlinks_target: c.backlinks_target,
      articles_target: c.articles_target,
      gbp_posts_target: c.gbp_posts_target,
      review_requests_target: c.review_requests_target,
      ai_fixes_target: c.ai_fixes_target,
    },
    contact:
      p && (p.contact_name || p.contact_email || p.contact_phone || p.phone)
        ? {
            name: p.contact_name,
            email: p.contact_email,
            phone: p.contact_phone ?? p.phone,
          }
        : null,
    primaryCategory: p?.primary_category ?? null,
    onboarding: o
      ? {
          status: o.status,
          stepsDone: steps.filter(finished).length,
          stepsTotal: steps.length,
          submittedAt: o.submitted_at,
        }
      : null,
    connections: {
      connected: (accounts.data ?? []).filter((a) => a.status === "connected").length,
      broken: (accounts.data ?? []).filter((a) => a.status === "needs_reconnect").length,
    },
    openRequests: requests.count ?? 0,
  }
}

export type ClientAlert = {
  id: string
  severity: Database["public"]["Enums"]["alert_severity"]
  title: string
  detail: string | null
  actionLabel: string | null
  actionHref: string | null
  createdAt: string
}

/** This client's open problems, most severe first. */
export async function getClientAlerts(clientId: string): Promise<ClientAlert[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("alerts")
    .select("id, severity, title, detail, action_label, action_href, created_at")
    .eq("client_id", clientId)
    .is("resolved_at", null)
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false })
  if (error) throw new Error(`Could not load alerts: ${error.message}`)
  return (data ?? []).map((a) => ({
    id: a.id,
    severity: a.severity,
    title: a.title,
    detail: a.detail,
    actionLabel: a.action_label,
    actionHref: a.action_href,
    createdAt: a.created_at,
  }))
}

export type PlaceStats = {
  current: number
  outOf: number
  previous: number | null
  baseline: number | null
  baselineCheckedAt: string | null
  lastCheckedAt: string
  checks: number
}

export type Visibility = {
  tracked: number
  website: PlaceStats | null
  bing: PlaceStats | null
  map: PlaceStats | null
  ai: PlaceStats | null
}

type RawPlace = {
  current: number
  out_of: number
  previous: number | null
  baseline: number | null
  baseline_checked_at: string | null
  last_checked_at: string
  checks: number
} | null

const place = (raw: RawPlace | undefined): PlaceStats | null =>
  raw
    ? {
        current: raw.current ?? 0,
        outOf: raw.out_of ?? 0,
        previous: raw.previous,
        baseline: raw.baseline,
        baselineCheckedAt: raw.baseline_checked_at,
        lastCheckedAt: raw.last_checked_at,
        checks: raw.checks,
      }
    : null

/** "Where they show up": latest ranking / AI checks with baseline and previous. */
export async function getVisibility(clientId: string): Promise<Visibility> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("client_visibility", { p_client_id: clientId })
  if (error) throw new Error(`Could not load visibility: ${error.message}`)
  const v = (data ?? {}) as Record<string, unknown>
  return {
    tracked: Number(v.tracked ?? 0),
    website: place(v.website as RawPlace),
    bing: place(v.bing as RawPlace),
    map: place(v.map as RawPlace),
    ai: place(v.ai as RawPlace),
  }
}

export type WorkItem = {
  id: string
  kind: DeliverableKind
  quantity: number
  deliveredOn: string
  title: string
  url: string | null
  note: string | null
  source: WorkSource
  taskNumber: number | null
  createdBy: { id: string; name: string } | null
}

export type DeliverableProgress = {
  kind: DeliverableKind
  target: number
  done: number
  expected: number
  status: ProgressStatus
  prorated: boolean
  items: WorkItem[]
}

/** One month of promised work: per deliverable, what's done, where it should be, and the items. */
export async function getMonthWork(clientId: string, month: string): Promise<DeliverableProgress[]> {
  const supabase = await createSupabaseServerClient()
  const [progress, items] = await Promise.all([
    supabase.rpc("client_month_progress", { p_client_id: clientId, p_month: month }),
    supabase
      .from("work_items")
      .select(
        "id, kind, quantity, delivered_on, title, url, note, source, task:tasks!work_items_task_id_fkey(number), creator:team_members!work_items_created_by_fkey(id, full_name, email)",
      )
      .eq("client_id", clientId)
      .eq("month", month)
      .order("delivered_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ])
  if (progress.error) throw new Error(`Could not load this month's work: ${progress.error.message}`)
  if (items.error) throw new Error(`Could not load delivered work: ${items.error.message}`)

  const byKind = new Map<DeliverableKind, WorkItem[]>()
  for (const w of items.data ?? []) {
    const item: WorkItem = {
      id: w.id,
      kind: w.kind,
      quantity: w.quantity,
      deliveredOn: w.delivered_on,
      title: w.title,
      url: w.url,
      note: w.note,
      source: w.source,
      taskNumber: w.task?.number ?? null,
      createdBy: w.creator ? { id: w.creator.id, name: nameOf(w.creator)! } : null,
    }
    byKind.set(w.kind, [...(byKind.get(w.kind) ?? []), item])
  }

  return (progress.data ?? []).map((p) => ({
    kind: p.kind,
    target: p.target,
    done: p.done,
    expected: Number(p.expected),
    status: p.status as ProgressStatus,
    prorated: p.prorated,
    items: byKind.get(p.kind) ?? [],
  }))
}

/** A page of the client's history, newest first. `before` = the last id already shown. */
export async function getClientActivity(
  clientId: string,
  clientName: string,
  before?: number,
  limit = 15,
): Promise<{ entries: ActivityEntry[]; hasMore: boolean }> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("client_activity", {
    p_client_id: clientId,
    p_before: before,
    p_limit: limit + 1,
  })
  if (error) throw new Error(`Could not load activity: ${error.message}`)
  const rows = data ?? []
  return {
    hasMore: rows.length > limit,
    entries: rows.slice(0, limit).map((r) => ({
      id: r.id,
      action: r.action,
      meta: (r.meta ?? {}) as Record<string, unknown>,
      createdAt: r.created_at,
      actorName: r.actor_name,
      clientName,
    })),
  }
}
