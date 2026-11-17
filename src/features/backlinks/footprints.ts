import type { FootprintScope } from "./constants"

/**
 * Turns the footprint templates into searches for the places the team chose (pure).
 * "{service} {place} directory" + "scottsdale az" + duct cleaning →
 * "duct cleaning scottsdale az directory". Place and service searches are made per place;
 * industry searches once per run. A template whose placeholder has no value is skipped.
 * The database's private.backlink_search_estimate uses the same limits.
 */

export type Footprint = { id: string; template: string; scope: FootprintScope; sort: number }

export type PlaceContext = {
  id: string
  /** The words searches use for this place ("scottsdale az", "arizona", "united kingdom"). */
  searchName: string
  /** Full region name, for "{industry} association {state}". */
  region: string | null
}

export type QueryContext = {
  places: PlaceContext[]
  services: string[]
  industry: string | null
}

export type BuiltQuery = {
  footprintId: string
  scope: FootprintScope
  /** The place this search is for; null for industry searches. */
  targetId: string | null
  query: string
  queryNorm: string
}

/** Searches per place (place words, then services) and industry searches per run. */
export const PER_PLACE_GEO = 7
export const PER_PLACE_SERVICE = 5
export const MAX_INDUSTRY = 4

export const normQuery = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 700)

/** "Air duct cleaning service" → "air duct cleaning" (the word people search with). */
export function cleanTerm(s: string | null | undefined): string | null {
  if (!s) return null
  const t = normQuery(s)
    .replace(/[^\p{L}\p{N}&' -]/gu, " ")
    .replace(/\b(service|services|company|companies|contractor|contractors|business|llc|inc)$/u, "")
    .replace(/\s+/g, " ")
    .trim()
  return t.length >= 3 && t.length <= 60 ? t : null
}

export function buildQueries(
  footprints: Footprint[],
  ctx: QueryContext,
  max: number,
): { queries: BuiltQuery[]; skipped: number } {
  const services = [...new Set(ctx.services.map(cleanTerm).filter((s): s is string => Boolean(s)))].slice(0, 3)
  const industry = cleanTerm(ctx.industry)
  const out: BuiltQuery[] = []
  const seen = new Set<string>()
  let skipped = 0

  const ordered = [...footprints].sort(
    (a, b) => scopeOrder(a.scope) - scopeOrder(b.scope) || a.sort - b.sort || a.template.localeCompare(b.template),
  )
  const fill = (template: string, values: Record<string, string | null>) => {
    let missing = false
    const text = template.replace(/\{(place|city|state|state_code|service|industry)\}/g, (_, key: string) => {
      const v = values[key] ?? null
      if (!v) missing = true
      return v ?? ""
    })
    return missing ? null : text
  }
  const push = (f: Footprint, targetId: string | null, text: string | null) => {
    if (!text) {
      skipped++
      return false
    }
    const queryNorm = normQuery(text)
    const key = `${targetId ?? "-"}|${queryNorm}`
    if (!queryNorm || seen.has(key)) return false
    if (out.length >= max) {
      skipped++
      return false
    }
    seen.add(key)
    out.push({ footprintId: f.id, scope: f.scope, targetId, query: queryNorm, queryNorm })
    return true
  }

  for (const place of ctx.places) {
    const values = {
      place: normQuery(place.searchName),
      state: place.region ? normQuery(place.region) : null,
      industry,
    }
    let geo = 0
    let service = 0
    for (const f of ordered) {
      if (f.scope === "geo" && geo < PER_PLACE_GEO) {
        if (push(f, place.id, fill(f.template, { ...values, service: null }))) geo++
      } else if (f.scope === "service") {
        for (const s of services) {
          if (service >= PER_PLACE_SERVICE) break
          if (push(f, place.id, fill(f.template, { ...values, service: s }))) service++
        }
      }
    }
  }

  // Industry searches: once per run (the first place with a region fills {state}).
  const region = ctx.places.find((p) => p.region)?.region ?? null
  let industryCount = 0
  for (const f of ordered) {
    if (f.scope !== "industry" || industryCount >= MAX_INDUSTRY) continue
    if (push(f, null, fill(f.template, { industry, state: region ? normQuery(region) : null }))) industryCount++
  }
  return { queries: out, skipped }
}

function scopeOrder(scope: FootprintScope) {
  return scope === "geo" ? 0 : scope === "service" ? 1 : 2
}
