import type { FootprintScope } from "./constants"

/**
 * Turns the footprint templates into this client's searches (pure).
 * "{service} {city} {state_code} directory" + Peoria, AZ, duct cleaning →
 * "duct cleaning peoria az directory". A template whose placeholder has no value is skipped.
 */

export type Footprint = { id: string; template: string; scope: FootprintScope; sort: number }

export type QueryContext = {
  city: string
  state: string | null
  stateCode: string | null
  services: string[]
  industry: string | null
}

export type BuiltQuery = {
  footprintId: string
  scope: FootprintScope
  query: string
  queryNorm: string
}

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
  const services = [...new Set(ctx.services.map(cleanTerm).filter((s): s is string => Boolean(s)))]
  const values: Record<string, string | null> = {
    city: cleanTerm(ctx.city) ?? normQuery(ctx.city),
    state: ctx.state ? normQuery(ctx.state) : null,
    state_code: ctx.stateCode ? normQuery(ctx.stateCode) : null,
    industry: cleanTerm(ctx.industry),
  }
  const out: BuiltQuery[] = []
  const seen = new Set<string>()
  let skipped = 0

  const fill = (template: string, service: string | null) => {
    let missing = false
    const text = template.replace(
      /\{(city|state|state_code|service|industry)\}/g,
      (_, key: string) => {
        const v = key === "service" ? service : values[key]
        if (!v) missing = true
        return v ?? ""
      },
    )
    return missing ? null : text
  }

  const ordered = [...footprints].sort(
    (a, b) =>
      scopeOrder(a.scope) - scopeOrder(b.scope) ||
      a.sort - b.sort ||
      a.template.localeCompare(b.template),
  )
  for (const f of ordered) {
    const variants = f.template.includes("{service}")
      ? services.length
        ? services
        : [null]
      : [null]
    for (const service of variants) {
      const text = fill(f.template, service)
      if (!text) {
        skipped++
        continue
      }
      const queryNorm = normQuery(text)
      if (!queryNorm || seen.has(queryNorm)) continue
      if (out.length >= max) {
        skipped++
        continue
      }
      seen.add(queryNorm)
      out.push({ footprintId: f.id, scope: f.scope, query: queryNorm, queryNorm })
    }
  }
  return { queries: out, skipped }
}

function scopeOrder(scope: FootprintScope) {
  return scope === "geo" ? 0 : scope === "service" ? 1 : 2
}
