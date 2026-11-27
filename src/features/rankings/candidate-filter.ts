/**
 * The Find better keywords filters (search, searches a month, intent, service, found in). Pure:
 * the Research tab and its CSV export use the same rule.
 */

export type CandidateFilters = { q: string; min: string; intent: string; topic: string; source: string }

export const DEFAULT_CANDIDATE_FILTERS: CandidateFilters = { q: "", min: "0", intent: "any", topic: "any", source: "any" }

type Filterable = {
  phrase: string
  local_volume: number | null
  national_volume: number | null
  intent: string | null
  topic: string | null
  sources: string[]
}

export const isFiltered = (f: CandidateFilters) =>
  f.q.trim() !== "" || f.min !== "0" || f.intent !== "any" || f.topic !== "any" || f.source !== "any"

export function matchesCandidate(c: Filterable, f: CandidateFilters): boolean {
  const q = f.q.trim().toLowerCase()
  const min = Number(f.min)
  if (q && !c.phrase.includes(q)) return false
  if (min > 0 && (c.local_volume ?? c.national_volume ?? 0) < min) return false
  if (f.intent !== "any" && c.intent !== f.intent) return false
  if (f.topic !== "any" && c.topic !== f.topic) return false
  if (f.source !== "any") {
    const s = f.source === "ideas" ? ["ideas", "suggestions", "related"] : [f.source]
    if (!c.sources.some((x) => s.includes(x))) return false
  }
  return true
}
