"use server"

import { after } from "next/server"
import { refresh } from "next/cache"

import type { ActionResult } from "@/features/tasks/schemas"
import { PermissionError, requirePermission } from "@/lib/auth"
import type { Db } from "@/lib/dataforseo/client"
import { hasDataForSeo } from "@/lib/env.server"
import type { Permission } from "@/lib/roles"
import type { Json } from "@/lib/supabase/database.types"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { syncCountryLocations } from "@/features/rankings/locations"
import { countryName, isCountryCode } from "@/lib/countries"
import { countryShort } from "@/lib/format"
import { regionCode, regionList } from "@/lib/regions"
import { briefSchema, snapshotOf, type BriefInput } from "./brief"
import { buildSearchPlan, SEARCH_COST, type PlanFootprint, type PlanPlace } from "./search-plan"
import { DIRECTORY_TYPES, REJECT_REASONS, type DirectoryType, type RejectReason } from "./constants"
import { processBacklinkRuns } from "./discovery"
import { runStrengthCheck } from "./strength"

/**
 * Backlinks actions. Each checks its permission here; the database functions check the role
 * and the client again (security definer + private.require_backlinks_worker / _manager).
 * Spending is decided in the database (budgets, limits), never here.
 */

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
const NOT_CONNECTED = "DataForSEO isn't connected yet. An admin adds the login on the server."

function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  if (["P0001", "P0002", "42501", "22023"].includes(error?.code ?? "") && error?.message)
    return error.message
  return fallback
}

/** The planned searches for the ticked places, from the saved brief (no side effects). */
async function planFor(clientId: string, targetIds: string[]) {
  const supabase = await createSupabaseServerClient()
  const [{ data: briefRow }, { data: targets }, { data: fps }, { data: client }, { data: profile }] = await Promise.all([
    supabase.from("backlink_briefs").select("*").eq("client_id", clientId).maybeSingle(),
    supabase
      .from("backlink_targets")
      .select("id, label, search_name, kind, region_name, active")
      .eq("client_id", clientId)
      .in("id", targetIds.length ? targetIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .from("backlink_footprints")
      .select("id, template, scope, reach, buyer, offering, site_type, priority")
      .eq("active", true),
    supabase.from("clients").select("industry").eq("id", clientId).maybeSingle(),
    supabase.from("client_business_profiles").select("services, primary_category").eq("client_id", clientId).maybeSingle(),
  ])
  const brief = snapshotOf(briefRow)
  if (!brief) return { error: "Fill in the strategy brief first." } as const
  const byId = new Map((targets ?? []).filter((t) => t.active).map((t) => [t.id, t]))
  const places: PlanPlace[] = targetIds
    .map((id) => byId.get(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => ({
      id: t.id,
      label: t.label,
      searchName: t.search_name,
      kind: t.kind as PlanPlace["kind"],
      regionName: t.region_name,
    }))
  const services = profile?.services?.length
    ? profile.services
    : [profile?.primary_category ?? "", client?.industry ?? ""].filter(Boolean)
  const plan = buildSearchPlan({
    footprints: (fps ?? []) as PlanFootprint[],
    brief,
    places,
    services,
    industry: profile?.primary_category ?? client?.industry ?? null,
  })
  return { brief, places, plan } as const
}

export type PlanPreview = {
  count: number
  cost: number
  groups: Record<string, number>
  perPlace: Record<string, number>
  dropped: number
  queries: { place: string; query: string; group: string }[]
}

/** For the Find places dialog: what the ticked places would search, and the cost. */
export async function previewSearchPlan(
  clientId: string,
  targetIds: string[],
): Promise<{ ok: true; data: PlanPreview } | { ok: false; error: string }> {
  const denied = await guard("backlinks.discover")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const ids = [...new Set(targetIds)].filter(isUuid).slice(0, 25)
  const r = await planFor(clientId, ids)
  if ("error" in r) return { ok: false, error: r.error! }
  const labels = new Map(r.places.map((p) => [p.id, p.label]))
  return {
    ok: true,
    data: {
      count: r.plan.queries.length,
      cost: r.plan.queries.length * SEARCH_COST,
      groups: r.plan.groups,
      perPlace: r.plan.perPlace,
      dropped: r.plan.dropped,
      queries: r.plan.queries.map((q) => ({ place: labels.get(q.target_id) ?? "", query: q.query, group: q.group })),
    },
  }
}

/** Find places: build the plan from the brief, the database checks and saves it (≤ 60). */
export async function findPlaces(clientId: string, targetIds: string[]): Promise<ActionResult> {
  const denied = await guard("backlinks.discover")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const ids = [...new Set(targetIds)].filter(isUuid).slice(0, 25)
  if (ids.length === 0) return { ok: false, error: "Tick at least one place to search." }
  if (!hasDataForSeo() || !hasSupabaseSecretKey()) return { ok: false, error: NOT_CONNECTED }
  const r = await planFor(clientId, ids)
  if ("error" in r) return { ok: false, error: r.error! }
  if (r.plan.queries.length === 0) {
    return { ok: false, error: "Nothing to search with this brief. Check its topics and kinds of sites." }
  }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("request_backlink_discovery", {
    p_client_id: clientId,
    p_target_ids: ids,
    p_queries: r.plan.queries.map(({ footprint_id, scope, target_id, query }) => ({
      footprint_id,
      scope,
      target_id,
      query,
    })) as unknown as Json,
    p_brief_version: r.brief.version,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't start the search. Try again.") }
  startJob()
  refresh()
  return { ok: true }
}

/** Redo the top 30 from the saved results with the current brief (AI review only, no searches). */
export async function rerankPlaces(clientId: string): Promise<ActionResult> {
  const denied = await guard("backlinks.discover")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (!hasSupabaseSecretKey()) return { ok: false, error: NOT_CONNECTED }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("rerank_backlinks", { p_client_id: clientId })
  if (error) return { ok: false, error: dbError(error, "Couldn't re-rank. Try again.") }
  startJob()
  refresh()
  return { ok: true }
}

function startJob() {
  after(async () => {
    try {
      await processBacklinkRuns(createSupabaseAdminClient() as Db, 1)
    } catch (e) {
      console.error("[backlinks] search could not start", e)
    }
  })
}

/** Save the strategy brief (admins and account managers). */
export async function saveBrief(
  clientId: string,
  input: BriefInput,
): Promise<ActionResult<{ version: number }> & { fieldErrors?: Record<string, string> }> {
  const denied = await guard("backlinks.strategy")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const parsed = briefSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message
    return { ok: false, error: "Check the highlighted fields.", fieldErrors }
  }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("save_backlink_brief", {
    p_client_id: clientId,
    p: parsed.data as unknown as Json,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the brief. Try again.") }
  refresh()
  return { ok: true, data: { version: Number(data ?? 1) } }
}

// ---------------------------------------------------------------------------
// Places the client wants to be found in
// ---------------------------------------------------------------------------

export type LocationOption = {
  code: number
  name: string
  type: string | null
  kind: "city" | "region" | "country"
  label: string
}

const kindOf = (type: string | null): LocationOption["kind"] =>
  type === "Country"
    ? "country"
    : type === "City" || type === "Municipality" || type === "Neighborhood"
      ? "city"
      : "region"

/** Display label and default search words for a DataForSEO location. */
function describeLocation(name: string, type: string | null, iso: string) {
  const parts = name.split(",").map((p) => p.trim())
  const kind = kindOf(type)
  const country = countryName(iso)
  if (kind === "country") return { kind, label: country, searchName: country, regionCode: null }
  if (kind === "region") {
    const code = regionList(iso) ? regionCode(iso, parts[0]) : null
    return {
      kind,
      label: `${parts[0]}, ${countryShort(iso)}`,
      searchName: parts[0],
      regionCode: code && code !== parts[0] ? code : null,
    }
  }
  const city = parts[0]
  const region = parts.length >= 3 ? parts[parts.length - 2] : null
  const code = regionList(iso) && region ? regionCode(iso, region) : null
  const short = code && code !== region ? code : null
  return {
    kind,
    label: `${city}, ${short ?? region ?? country}`,
    // Listed countries: "scottsdale az"; elsewhere the country keeps it unambiguous.
    searchName: short ? `${city} ${short}` : `${city} ${country}`,
    regionCode: short,
  }
}

/**
 * Places to pick from in one country (DataForSEO's free location list). The list is
 * downloaded the first time a country is used.
 */
export async function searchTargetLocations(
  countryIso: string,
  query: string,
): Promise<{ ok: true; options: LocationOption[] } | { ok: false; error: string }> {
  const denied = await guard("backlinks.discover")
  if (denied) return { ok: false, error: denied }
  const iso = countryIso.toUpperCase().slice(0, 2)
  if (!isCountryCode(iso)) return { ok: false, error: "Choose a country." }
  const supabase = await createSupabaseServerClient()

  const { count } = await supabase
    .from("dfs_locations")
    .select("code", { count: "exact", head: true })
    .eq("source", "google")
    .eq("country_iso", iso)
  if (!count) {
    if (!hasDataForSeo() || !hasSupabaseSecretKey()) return { ok: false, error: NOT_CONNECTED }
    try {
      await syncCountryLocations(createSupabaseAdminClient() as Db, iso)
    } catch (e) {
      console.error("[backlinks] location list download failed", iso, e)
      return { ok: false, error: `Couldn't load the places for ${countryName(iso)}. Try again.` }
    }
  }

  const q = query.trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ")
  let rows: { code: number; name: string; type: string | null }[] = []
  if (q.length < 2) {
    const { data } = await supabase
      .from("dfs_locations")
      .select("code, name, type")
      .eq("source", "google")
      .eq("country_iso", iso)
      .in("type", ["Country", "State", "Province", "Region"])
      .order("name")
      .limit(80)
    rows = data ?? []
  } else {
    const { data } = await supabase
      .from("dfs_locations")
      .select("code, name, type")
      .eq("source", "google")
      .eq("country_iso", iso)
      .ilike("name", `${q}%`)
      .order("name")
      .limit(40)
    rows = data ?? []
  }
  const order = (k: LocationOption["kind"]) => (k === "country" ? 0 : k === "region" ? 1 : 2)
  const options = rows
    .map((r) => {
      const d = describeLocation(r.name, r.type, iso)
      return { code: r.code, name: r.name, type: r.type, kind: d.kind, label: d.label }
    })
    .sort((a, b) => order(a.kind) - order(b.kind) || a.name.localeCompare(b.name))
    .slice(0, 30)
  return { ok: true, options }
}

export async function addTarget(clientId: string, locationCode: number): Promise<ActionResult> {
  const denied = await guard("backlinks.discover")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId) || !Number.isInteger(locationCode)) return { ok: false, error: "Pick a place from the list." }
  const supabase = await createSupabaseServerClient()
  const { data: loc } = await supabase
    .from("dfs_locations")
    .select("code, name, type, country_iso")
    .eq("source", "google")
    .eq("code", locationCode)
    .maybeSingle()
  if (!loc?.country_iso) return { ok: false, error: "Pick a place from the list." }
  const d = describeLocation(loc.name, loc.type, loc.country_iso.toUpperCase())
  const { error } = await supabase.rpc("add_backlink_target", {
    p_client_id: clientId,
    p_location_code: loc.code,
    p_label: d.label,
    p_search_name: d.searchName.toLowerCase(),
    p_region_code: d.regionCode ?? undefined,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't add the place. Try again.") }
  refresh()
  return { ok: true }
}

export async function updateTarget(
  targetId: string,
  patch: { searchName?: string; active?: boolean },
): Promise<ActionResult> {
  const denied = await guard("backlinks.discover")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(targetId)) return { ok: false, error: "Unknown place." }
  const words = patch.searchName?.trim().toLowerCase().replace(/\s+/g, " ")
  if (words !== undefined) {
    if (words.length < 2 || words.length > 100) return { ok: false, error: "Use 2 to 100 characters." }
    if (/[{}:]/.test(words)) return { ok: false, error: "Use words only (no : or { })." }
  }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("update_backlink_target", {
    p_id: targetId,
    p_search_name: words ?? "",
    p_active: (patch.active ?? null) as boolean,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the place. Try again.") }
  refresh()
  return { ok: true }
}

export async function removeTarget(targetId: string): Promise<ActionResult> {
  const denied = await guard("backlinks.discover")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(targetId)) return { ok: false, error: "Unknown place." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("remove_backlink_target", { p_id: targetId })
  if (error) return { ok: false, error: dbError(error, "Couldn't remove the place. Try again.") }
  refresh()
  return { ok: true }
}

export async function reviewPlaces(
  ids: string[],
  decision: "approve" | "reject" | "restore" | "promote",
  reason?: RejectReason | null,
  note?: string | null,
): Promise<ActionResult<{ changed: number }>> {
  const denied = await guard("backlinks.review")
  if (denied) return { ok: false, error: denied }
  const clean = [...new Set(ids)].filter(isUuid)
  if (clean.length === 0) return { ok: false, error: "Pick at least one place." }
  if (!["approve", "reject", "restore", "promote"].includes(decision))
    return { ok: false, error: "Unknown decision." }
  if (decision === "reject" && (!reason || !REJECT_REASONS.includes(reason))) {
    return { ok: false, error: "Pick a reason for rejecting." }
  }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("review_backlink_opportunities", {
    p_ids: clean,
    p_decision: decision,
    p_reason: decision === "reject" ? reason! : undefined,
    p_note: note?.trim() ? note.trim().slice(0, 500) : undefined,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save. Try again.") }
  refresh()
  return { ok: true, data: { changed: Number(data ?? 0) } }
}

export async function checkSiteStrength(
  clientId: string,
  ids: string[] | null,
  force = false,
): Promise<ActionResult<{ checked: number; cost: number }>> {
  const denied = await guard("backlinks.strength")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (!hasDataForSeo() || !hasSupabaseSecretKey()) return { ok: false, error: NOT_CONNECTED }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("request_strength_check", {
    p_client_id: clientId,
    p_ids: ids?.filter(isUuid).length ? ids.filter(isUuid) : undefined,
    p_force: force,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't start the check. Try again.") }
  const req = data as { check_id: string | null; targets: string[] } | null
  if (!req?.check_id || !req.targets.length) return { ok: true, data: { checked: 0, cost: 0 } }
  try {
    const res = await runStrengthCheck(createSupabaseAdminClient() as Db, {
      id: req.check_id,
      clientId,
      targets: req.targets,
    })
    refresh()
    return { ok: true, data: { checked: res.checked, cost: res.cost } }
  } catch (e) {
    refresh()
    return {
      ok: false,
      error: e instanceof Error ? e.message : "DataForSEO didn't answer. Try again.",
    }
  }
}

export async function updateDirectory(input: {
  id: string
  type: DirectoryType
  submitUrl: string | null
  costType: "free" | "paid" | "unknown"
  notes: string | null
}): Promise<ActionResult> {
  const denied = await guard("backlinks.library")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(input.id) || !DIRECTORY_TYPES.includes(input.type))
    return { ok: false, error: "Unknown site." }
  const url = input.submitUrl?.trim() || null
  if (url && !/^https?:\/\/\S+$/i.test(url))
    return { ok: false, error: "The sign-up link must start with https://." }
  if ((input.notes?.length ?? 0) > 2000)
    return { ok: false, error: "Keep the notes under 2,000 characters." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("set_directory", {
    p_id: input.id,
    p_type: input.type,
    p_submit_url: url ?? "",
    p_cost_type: input.costType,
    p_notes: input.notes ?? "",
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the site. Try again.") }
  refresh()
  return { ok: true }
}

export async function setDirectoryBlocked(
  id: string,
  blocked: boolean,
  reason?: string,
): Promise<ActionResult> {
  const denied = await guard("backlinks.library")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(id)) return { ok: false, error: "Unknown site." }
  const supabase = await createSupabaseServerClient()
  const { error } = blocked
    ? await supabase.rpc("block_directory", {
        p_id: id,
        p_reason: (reason ?? "").trim().slice(0, 300),
      })
    : await supabase.rpc("unblock_directory", { p_id: id })
  if (error) return { ok: false, error: dbError(error, "Couldn't change the site. Try again.") }
  refresh()
  return { ok: true }
}
