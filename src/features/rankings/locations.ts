import "server-only"

import { serpLocations } from "@/lib/dataforseo/api"
import type { Db } from "@/lib/dataforseo/client"
import { countryName } from "@/lib/format"
import { LOCATION_TYPES, US_STATES } from "./constants"

const FRESH_DAYS = 30

/**
 * Fills `dfs_locations` with one country's Google and Bing SERP locations (free calls),
 * at most once a month per country. Only useful types are kept (cities, states, …).
 */
export async function syncCountryLocations(db: Db, countryIso: string): Promise<void> {
  const iso = countryIso.toUpperCase()
  const { data: fresh } = await db
    .from("dfs_locations")
    .select("code")
    .eq("source", "google")
    .eq("country_iso", iso)
    .gte("synced_at", new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString())
    .limit(1)
  if (fresh?.length) return

  for (const source of ["google", "bing"] as const) {
    const list = await serpLocations(db, source, iso)
    const rows = list
      .filter((l) => !l.type || LOCATION_TYPES.has(l.type))
      .map((l) => ({
        source,
        code: l.code,
        name: l.name.slice(0, 300),
        type: l.type,
        parent_code: l.parentCode,
        country_iso: (l.countryIso ?? iso).toUpperCase(),
        synced_at: new Date().toISOString(),
      }))
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await db.from("dfs_locations").upsert(rows.slice(i, i + 1000))
      if (error) throw new Error(`Could not save locations: ${error.message}`)
    }
  }
  await db.from("dfs_settings").update({ last_locations_sync_at: new Date().toISOString() }).eq("id", true)
}

export type LocationMatch = { code: number; name: string } | null

/**
 * "Phoenix" + "AZ" + "US" → "Phoenix,Arizona,United States".
 * Exact name first; otherwise the only city with that name in the country, or the one
 * whose state matches. Returns null when it can't be sure (the team picks in Settings).
 */
export async function resolveCity(
  db: Db,
  source: "google" | "bing",
  city: string | null,
  region: string | null,
  countryIso: string,
): Promise<LocationMatch> {
  if (!city?.trim()) return null
  const iso = countryIso.toUpperCase()
  const cityName = city.trim()
  const regionName = region?.trim() ? (iso === "US" ? (US_STATES[region.trim().toUpperCase()] ?? region.trim()) : region.trim()) : null

  const { data } = await db
    .from("dfs_locations")
    .select("code, name, type")
    .eq("source", source)
    .eq("country_iso", iso)
    .ilike("name", `${cityName.replace(/[%_]/g, "")},%`)
    .limit(50)
  const cities = (data ?? []).filter((l) => l.type === "City" || l.type === "Municipality" || !l.type)
  if (cities.length === 0) return null

  const country = countryName(iso)
  if (regionName) {
    const exact = cities.find(
      (l) => l.name.toLowerCase() === `${cityName},${regionName},${country}`.toLowerCase(),
    )
    if (exact) return { code: exact.code, name: exact.name }
    const inRegion = cities.filter((l) => l.name.toLowerCase().split(",").includes(regionName.toLowerCase()))
    if (inRegion.length === 1) return { code: inRegion[0].code, name: inRegion[0].name }
  }
  return cities.length === 1 ? { code: cities[0].code, name: cities[0].name } : null
}

/** The country's own location code (Labs works per country). */
export async function countryLocation(db: Db, source: "google" | "bing", countryIso: string) {
  const { data } = await db
    .from("dfs_locations")
    .select("code, name")
    .eq("source", source)
    .eq("country_iso", countryIso.toUpperCase())
    .eq("type", "Country")
    .limit(1)
    .maybeSingle()
  return data ?? null
}
