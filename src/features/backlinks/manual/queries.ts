import "server-only"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { displayHost } from "../site-key"
import type {
  CatalogCategory,
  CatalogKind,
  CatalogPricing,
  LinkKind,
  SubmissionBlock,
  SubmissionStatus,
} from "./constants"
import type { KitProfile } from "./listing-kit"
import type { CatalogSite } from "./match"

/** Reads for the Manual Search tab and the catalog page. Everything goes through RLS. */

const nameOf = (m: { full_name: string; email: string } | null) =>
  m ? m.full_name?.trim() || m.email : null

type DirJoin = {
  id: string
  site_key: string
  name: string
  type: string
  authority: number | null
  authority_status: string | null
  spam_score: number | null
  submit_url: string | null
}

export const hostOfKey = (siteKey: string) =>
  siteKey.startsWith("play:") ? "" : displayHost(siteKey)

type CatalogRow = {
  id: string
  directory_id: string
  kind: CatalogKind
  category: CatalogCategory
  name: string
  home_url: string | null
  submit_url: string | null
  countries: string[]
  reach: string[]
  buyer: string[]
  offering: string[]
  industries: string[]
  pricing: CatalogPricing
  price_note: string | null
  typical_link: LinkKind
  priority: number
  benefits: string[]
  needs: string[]
  how_to: string | null
  warnings: string | null
  notes: string | null
  verified_at: string | null
  problem_note: string | null
  sort: number
  directory: DirJoin | null
  verifier: { full_name: string; email: string } | null
}

const CATALOG_SELECT =
  "id, directory_id, kind, category, name, home_url, submit_url, countries, reach, buyer, offering, industries, pricing, price_note, typical_link, priority, benefits, needs, how_to, warnings, notes, verified_at, problem_note, sort, directory:directories!inner(id, site_key, name, type, authority, authority_status, spam_score, submit_url), verifier:team_members!backlink_catalog_verified_by_fkey(full_name, email)"

export function toCatalogSite(r: CatalogRow): CatalogSite {
  return {
    id: r.id,
    directoryId: r.directory_id,
    kind: r.kind,
    category: r.category,
    name: r.name,
    host: r.directory ? hostOfKey(r.directory.site_key) : "",
    homeUrl: r.home_url,
    submitUrl: r.submit_url,
    countries: r.countries,
    reach: r.reach,
    buyer: r.buyer,
    offering: r.offering,
    industries: r.industries,
    pricing: r.pricing,
    priceNote: r.price_note,
    typicalLink: r.typical_link,
    priority: r.priority,
    benefits: r.benefits,
    needs: r.needs,
    howTo: r.how_to,
    warnings: r.warnings,
    notes: r.notes,
    verifiedAt: r.verified_at,
    verifiedBy: nameOf(r.verifier),
    problemNote: r.problem_note,
    authority: r.directory?.authority ?? null,
    authorityStatus: r.directory?.authority_status ?? null,
    spam: r.directory?.spam_score ?? null,
    sort: r.sort,
  }
}

export type Submission = {
  id: string
  opportunityId: string
  status: SubmissionStatus
  blockReason: SubmissionBlock | null
  blockNote: string | null
  source: string
  catalogId: string | null
  site: { id: string; name: string; host: string; type: string; submitUrl: string | null }
  foundUrl: string | null
  authority: number | null
  authorityStatus: string | null
  spam: number | null
  assignedTo: { id: string; name: string } | null
  followUpOn: string | null
  listingUrl: string | null
  linkKind: LinkKind | null
  submittedOn: string | null
  liveOn: string | null
  login: { id: string; siteName: string; username: string; has2fa: boolean } | null
  costUsd: number | null
  costNote: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type SubmissionEvent = {
  id: number
  submissionId: string
  at: string
  actor: string | null
  from: SubmissionStatus | null
  to: SubmissionStatus | null
  change: Record<string, unknown>
  note: string | null
}

export type LoginOption = {
  id: string
  siteName: string
  siteUrl: string | null
  username: string
  has2fa: boolean
}
export type MemberOption = { id: string; name: string; role: string }

export type OtherDecision = {
  directoryId: string
  status: string
  source: string
  reason: string | null
}

export type ManualData = {
  catalog: CatalogSite[]
  /** Catalog sites with a not-approved place for this client (waiting, rejected, hidden). */
  otherDecisions: OtherDecision[]
  submissions: Submission[]
  events: SubmissionEvent[]
  /** The brief's competitors; the brief and the places come from the shared setup (../setup.ts). */
  competitors: string[]
  profile: KitProfile | null
  client: {
    name: string
    website: string | null
    city: string | null
    region: string | null
    country: string
    industry: string | null
    backlinksTarget: number
  }
  logins: LoginOption[]
  members: MemberOption[]
}

export async function getCatalog(includeInactive = false): Promise<
  (CatalogSite & {
    active: boolean
    suggestionStatus: string | null
    suggestedBy: string | null
    problemBy: string | null
  })[]
> {
  const supabase = await createSupabaseServerClient()
  let q = supabase
    .from("backlink_catalog")
    .select(
      `${CATALOG_SELECT}, active, suggestion_status, suggester:team_members!backlink_catalog_suggested_by_fkey(full_name, email), reporter:team_members!backlink_catalog_problem_by_fkey(full_name, email)`,
    )
    .order("sort")
  if (!includeInactive) q = q.eq("active", true)
  const { data } = await q
  return (
    (data ?? []) as unknown as (CatalogRow & {
      active: boolean
      suggestion_status: string | null
      suggester: { full_name: string; email: string } | null
      reporter: { full_name: string; email: string } | null
    })[]
  ).map((r) => ({
    ...toCatalogSite(r),
    active: r.active,
    suggestionStatus: r.suggestion_status,
    suggestedBy: nameOf(r.suggester),
    problemBy: nameOf(r.reporter),
  }))
}

export type CatalogEntry = Awaited<ReturnType<typeof getCatalog>>[number]
export type CatalogUsage = Record<string, { picked: number; live: number }>

/** How many clients (that the viewer can see) have each catalog site on the work list, and live. */
export async function getCatalogUsage(): Promise<CatalogUsage> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("backlink_submissions")
    .select("catalog_id, status")
    .not("catalog_id", "is", null)
    .limit(20000)
  const out: CatalogUsage = {}
  for (const r of data ?? []) {
    if (!r.catalog_id) continue
    const u = (out[r.catalog_id] ??= { picked: 0, live: 0 })
    if (r.status !== "skipped") u.picked += 1
    if (r.status === "live") u.live += 1
  }
  return out
}

export async function getManualData(clientId: string): Promise<ManualData> {
  const supabase = await createSupabaseServerClient()
  const [
    catalogRes,
    subsRes,
    eventsRes,
    briefRes,
    clientRes,
    profileRes,
    loginsRes,
    membersRes,
  ] = await Promise.all([
    supabase.from("backlink_catalog").select(CATALOG_SELECT).eq("active", true).order("sort"),
    supabase
      .from("backlink_submissions")
      .select(
        "id, opportunity_id, status, block_reason, block_note, catalog_id, follow_up_on, listing_url, link_kind, submitted_on, live_on, cost_usd, cost_note, notes, created_at, updated_at, opportunity:backlink_opportunities!inner(source, found_url), directory:directories!inner(id, site_key, name, type, authority, authority_status, spam_score, submit_url), assignee:team_members!backlink_submissions_assigned_to_fkey(id, full_name, email), login:client_logins(id, site_name, username, has_2fa)",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("backlink_submission_events")
      .select(
        "id, submission_id, at, from_status, to_status, change, note, actor:team_members(full_name, email)",
      )
      .eq("client_id", clientId)
      .order("at", { ascending: false })
      .limit(1000),
    supabase.from("backlink_briefs").select("competitors").eq("client_id", clientId).maybeSingle(),
    supabase
      .from("clients")
      .select("name, website, city, region, country_code, industry, backlinks_target")
      .eq("id", clientId)
      .single(),
    supabase
      .from("client_business_profiles")
      .select(
        "business_name, legal_name, street, city, region, postal_code, country_code, phone, website, public_email, primary_category, other_categories, services, service_areas, service_area_business, description, year_founded, hours",
      )
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase
      .from("client_logins")
      .select("id, site_name, site_url, username, has_2fa")
      .eq("client_id", clientId)
      .order("site_name"),
    supabase
      .from("team_members")
      .select("id, full_name, email, role")
      .eq("status", "active")
      .in("role", ["admin", "manager", "va"])
      .order("full_name"),
  ])

  const c = clientRes.data
  const catalogRows = (catalogRes.data ?? []) as unknown as CatalogRow[]
  // Catalog sites this client already has a decision on in Standard or AI (not approved).
  const { data: otherOpps } = catalogRows.length
    ? await supabase
        .from("backlink_opportunities")
        .select("directory_id, status, source, reject_reason, filter_reason")
        .eq("client_id", clientId)
        .neq("status", "approved")
        .in(
          "directory_id",
          catalogRows.map((r) => r.directory_id),
        )
    : { data: [] }
  type SubRow = {
    id: string
    opportunity_id: string
    status: SubmissionStatus
    block_reason: SubmissionBlock | null
    block_note: string | null
    catalog_id: string | null
    follow_up_on: string | null
    listing_url: string | null
    link_kind: LinkKind | null
    submitted_on: string | null
    live_on: string | null
    cost_usd: number | null
    cost_note: string | null
    notes: string | null
    created_at: string
    updated_at: string
    opportunity: { source: string; found_url: string | null } | null
    directory: DirJoin | null
    assignee: { id: string; full_name: string; email: string } | null
    login: { id: string; site_name: string; username: string; has_2fa: boolean } | null
  }
  const submissions: Submission[] = ((subsRes.data ?? []) as unknown as SubRow[]).map((s) => ({
    id: s.id,
    opportunityId: s.opportunity_id,
    status: s.status,
    blockReason: s.block_reason,
    blockNote: s.block_note,
    source: s.opportunity?.source ?? "search",
    catalogId: s.catalog_id,
    site: {
      id: s.directory?.id ?? "",
      name: s.directory?.name ?? "Unknown site",
      host: s.directory ? hostOfKey(s.directory.site_key) : "",
      type: s.directory?.type ?? "other",
      submitUrl: s.directory?.submit_url ?? null,
    },
    foundUrl: s.opportunity?.found_url ?? null,
    authority: s.directory?.authority ?? null,
    authorityStatus: s.directory?.authority_status ?? null,
    spam: s.directory?.spam_score ?? null,
    assignedTo: s.assignee ? { id: s.assignee.id, name: nameOf(s.assignee)! } : null,
    followUpOn: s.follow_up_on,
    listingUrl: s.listing_url,
    linkKind: s.link_kind,
    submittedOn: s.submitted_on,
    liveOn: s.live_on,
    login: s.login
      ? {
          id: s.login.id,
          siteName: s.login.site_name,
          username: s.login.username,
          has2fa: s.login.has_2fa,
        }
      : null,
    costUsd: s.cost_usd === null ? null : Number(s.cost_usd),
    costNote: s.cost_note,
    notes: s.notes,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }))

  type EventRow = {
    id: number
    submission_id: string
    at: string
    from_status: SubmissionStatus | null
    to_status: SubmissionStatus | null
    change: Record<string, unknown> | null
    note: string | null
    actor: { full_name: string; email: string } | null
  }
  const events: SubmissionEvent[] = ((eventsRes.data ?? []) as unknown as EventRow[]).map((e) => ({
    id: e.id,
    submissionId: e.submission_id,
    at: e.at,
    actor: nameOf(e.actor),
    from: e.from_status,
    to: e.to_status,
    change: e.change ?? {},
    note: e.note,
  }))

  return {
    catalog: catalogRows.map(toCatalogSite),
    otherDecisions: (otherOpps ?? []).map((o) => ({
      directoryId: o.directory_id,
      status: o.status,
      source: o.source,
      reason: o.reject_reason ?? o.filter_reason ?? null,
    })),
    submissions,
    events,
    competitors: (briefRes.data?.competitors ?? []) as string[],
    profile: (profileRes.data as KitProfile | null) ?? null,
    client: {
      name: c?.name ?? "",
      website: c?.website ?? null,
      city: c?.city ?? null,
      region: c?.region ?? null,
      country: c?.country_code ?? "US",
      industry: c?.industry ?? null,
      backlinksTarget: c?.backlinks_target ?? 0,
    },
    logins: (loginsRes.data ?? []).map((l) => ({
      id: l.id,
      siteName: l.site_name,
      siteUrl: l.site_url,
      username: l.username,
      has2fa: l.has_2fa,
    })),
    members: (membersRes.data ?? []).map((m) => ({ id: m.id, name: nameOf(m)!, role: m.role })),
  }
}
