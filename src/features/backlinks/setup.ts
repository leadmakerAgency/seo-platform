import "server-only"

import { can, type AppRole } from "@/lib/roles"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { defaultSiteTypes, snapshotOf, type Brief, type BriefSnapshot } from "./brief"
import type { Target } from "./queries"
import { guessBuyer } from "./topic-ideas"

/**
 * The client's backlink setup: the strategy brief and the places ("Where the client wants to be
 * found"). Loaded once by the Backlinks page and passed to whichever tab is open; the tabs stay
 * locked until `complete` (docs/plans/backlinks/12-shared-setup.md).
 */
export type BacklinkSetup = {
  brief: BriefSnapshot | null
  /** What the brief form starts from: the saved brief, or a first draft from the profile. */
  draft: Brief
  /** Services, categories and industry: what the idea chips are based on. */
  ideasText: string
  targets: Target[]
  /** The client's city and service areas, offered as quick searches for the first place. */
  suggestions: string[]
  /** Exactly what the run RPCs would refuse with (private.backlink_brief_missing). */
  missing: string[]
  complete: boolean
  canEditBrief: boolean
  canEditPlaces: boolean
  defaultCountry: string
}

type Rec = Record<string, unknown>

export function targetOf(t: Rec): Target {
  return {
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
  }
}

export async function getBacklinkSetup(
  client: { id: string; city: string | null; country_code: string },
  role: AppRole,
): Promise<BacklinkSetup> {
  const supabase = await createSupabaseServerClient()
  const [{ data: setupRaw }, { data: briefRow }, { data: profile }, { data: details }] = await Promise.all([
    supabase.rpc("backlink_setup", { p_client_id: client.id }),
    supabase.from("backlink_briefs").select("*").eq("client_id", client.id).maybeSingle(),
    supabase
      .from("client_business_profiles")
      .select("services, primary_category, other_categories, service_areas")
      .eq("client_id", client.id)
      .maybeSingle(),
    supabase.from("clients").select("industry").eq("id", client.id).maybeSingle(),
  ])
  const setup = (setupRaw ?? {}) as Rec
  const brief = snapshotOf(briefRow)
  const missing = Array.isArray(setup.missing) ? (setup.missing as unknown[]).map(String) : ["Fill in the strategy brief"]
  const targets = ((setup.targets as Rec[] | null) ?? []).map(targetOf)

  const ideasText = [
    ...(profile?.services ?? []),
    profile?.primary_category ?? "",
    ...(profile?.other_categories ?? []),
    details?.industry ?? "",
  ].join(" ")

  // A first draft from what we know: services as core topics, a guessed buyer, local reach.
  const buyer = guessBuyer(ideasText)
  const draft: Brief = brief ?? {
    reach: ["local"],
    buyer,
    offering: ["services"],
    audience: "",
    core_topics: [
      ...new Set(
        (profile?.services ?? [])
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.length >= 2 && s.length <= 60 && !/[:{}"]/.test(s)),
      ),
    ].slice(0, 5),
    adjacent_topics: [],
    trusted_sites: [],
    exclude_terms: ["jobs", "careers", "salary", "free download", "course"],
    site_types: defaultSiteTypes({ reach: ["local"], buyer, offering: ["services"] }),
    notes: "",
  }

  const suggestions = [
    ...new Set([client.city ?? "", ...(profile?.service_areas ?? [])].map((s) => s.trim()).filter(Boolean)),
  ].slice(0, 6)

  return {
    brief,
    draft,
    ideasText,
    targets,
    suggestions,
    missing,
    complete: missing.length === 0,
    canEditBrief: can(role, "backlinks.strategy"),
    canEditPlaces: can(role, "backlinks.discover"),
    defaultCountry: client.country_code,
  }
}

/** Server check for actions that start new backlink work: the setup must be complete. */
export async function setupProblem(clientId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.rpc("backlink_setup", { p_client_id: clientId })
  const missing = (data as Rec | null)?.missing
  if (!Array.isArray(missing)) return "Client not found."
  return missing.length ? "Finish the backlink setup first." : null
}
