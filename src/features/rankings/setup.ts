import "server-only"

import type { Db } from "@/lib/dataforseo/client"
import { normalizeHost } from "@/lib/dataforseo/domains"
import type { Tables } from "@/lib/supabase/database.types"
import { countryLocation, resolveCity, syncCountryLocations } from "./locations"

export type RankSettings = Tables<"rank_settings">

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

/** Next check: the weekday at 09:00 UTC (02:00 in Phoenix), after `from`. Mirrors private.next_rank_run_at. */
export function nextRunAt(weekday: number, from: Date = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 9))
  for (let i = 0; i < 8; i++) {
    if (d.getUTCDay() === weekday && d > from) return d.toISOString()
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return d.toISOString()
}

/** Spread clients over the week so 300 checks don't all run on the same night. */
function weekdayFor(clientId: string) {
  let h = 0
  for (const ch of clientId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 7
}

/** Services, categories and industry: the words that make a keyword relevant to this client. */
export function topicTermsFrom(
  profile: { services: string[]; primary_category: string | null; other_categories: string[] } | null,
  industry: string | null,
): string[] {
  const terms = [
    ...(profile?.services ?? []),
    profile?.primary_category ?? "",
    ...(profile?.other_categories ?? []),
    ...(industry ?? "").split(/[,/]/),
  ]
    .map(norm)
    .filter((t) => t.length >= 3 && t.length <= 120)
  return [...new Set(terms)].slice(0, 50)
}

export type ClientRankContext = {
  clientId: string
  name: string
  domain: string | null
  city: string | null
  region: string | null
  countryIso: string
  serviceAreas: string[]
  settings: RankSettings
  /** The country's locations aren't cached yet: run syncAndResolve (in the background). */
  needsLocationSync: boolean
}

/**
 * The client's rank settings, created on first use and filled from the client record and
 * approved business profile. Uses only cached locations (no API call), so it is safe on a
 * page render; `needsLocationSync` says when `syncAndResolve` should run in the background.
 */
export async function ensureRankSettings(db: Db, clientId: string): Promise<ClientRankContext> {
  const [{ data: client, error }, { data: profile }, { data: existing }] = await Promise.all([
    db
      .from("clients")
      .select("id, name, website, city, region, country_code, industry")
      .eq("id", clientId)
      .single(),
    db
      .from("client_business_profiles")
      .select("services, primary_category, other_categories, service_areas, website")
      .eq("client_id", clientId)
      .maybeSingle(),
    db.from("rank_settings").select("*").eq("client_id", clientId).maybeSingle(),
  ])
  if (error || !client) throw new Error(`Client not found: ${error?.message ?? clientId}`)

  let settings = existing
  if (!settings) {
    const weekday = weekdayFor(clientId)
    const { data: created, error: insertError } = await db
      .from("rank_settings")
      .upsert(
        {
          client_id: clientId,
          check_weekday: weekday,
          topic_terms: topicTermsFrom(profile, client.industry),
        },
        { onConflict: "client_id", ignoreDuplicates: true },
      )
      .select("*")
      .maybeSingle()
    if (insertError) throw new Error(`Could not create rank settings: ${insertError.message}`)
    settings =
      created ?? (await db.from("rank_settings").select("*").eq("client_id", clientId).single()).data!
  }

  let needsLocationSync = false
  if (settings.location_code === null || settings.country_location_code === null) {
    const filled = await fillLocations(db, settings, client)
    settings = filled.settings
    needsLocationSync = filled.missingCache
  }

  return {
    clientId,
    name: client.name,
    domain: normalizeHost(client.website ?? profile?.website ?? null),
    city: client.city,
    region: client.region,
    countryIso: client.country_code,
    serviceAreas: profile?.service_areas ?? [],
    settings,
    needsLocationSync,
  }
}

async function fillLocations(
  db: Db,
  settings: RankSettings,
  client: { city: string | null; region: string | null; country_code: string },
): Promise<{ settings: RankSettings; missingCache: boolean }> {
  const country = await countryLocation(db, "google", client.country_code)
  if (!country) return { settings, missingCache: true }

  const patch: Partial<RankSettings> = {}
  if (settings.country_location_code === null) patch.country_location_code = country.code
  if (settings.location_code === null) {
    const city = await resolveCity(db, "google", client.city, client.region, client.country_code)
    if (city) {
      patch.location_code = city.code
      patch.location_name = city.name
      if (!settings.paused && !settings.next_run_at) patch.next_run_at = nextRunAt(settings.check_weekday)
    }
  }
  if (settings.bing_location_code === null) {
    const bing =
      (await resolveCity(db, "bing", client.city, client.region, client.country_code)) ??
      (await countryLocation(db, "bing", client.country_code))
    if (bing) patch.bing_location_code = bing.code
  }
  if (Object.keys(patch).length === 0) return { settings, missingCache: false }

  const { data } = await db
    .from("rank_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("client_id", settings.client_id)
    .select("*")
    .single()
  return { settings: data ?? settings, missingCache: false }
}

/** Background: download the country's locations (free), then fill the client's settings. */
export async function syncAndResolve(db: Db, clientId: string, countryIso: string) {
  await syncCountryLocations(db, countryIso)
  await ensureRankSettings(db, clientId)
}
