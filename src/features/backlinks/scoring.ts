import type { DirectoryType } from "./constants"

/**
 * How places are ranked (pure; shown on the page under "How scores work").
 *
 * relevance (0–1, saved by the search) =
 *   0.40 type + 0.25 local + 0.20 found by more searches + 0.15 best position
 * score (0–100, at read time) = 100 × (0.75 relevance + 0.25 strength)
 *   strength = Domain Rank / 100, unknown = 0.4; spam score 60+ halves the score.
 * Core listings never score below 0.8 relevance.
 */

export const TYPE_WEIGHT: Record<DirectoryType, number> = {
  chamber: 1,
  industry_directory: 0.95,
  business_directory: 0.9,
  association: 0.85,
  aggregator: 0.85,
  maps: 0.8,
  review_site: 0.7,
  news_blog: 0.6,
  guest_post: 0.55,
  social: 0.45,
  government: 0.3,
  other: 0.2,
}

export const CORE_FLOOR = 0.8
export const UNKNOWN_STRENGTH = 0.4

export function relevanceOf(input: {
  type: DirectoryType
  isLocal: boolean
  searches: number
  bestPosition: number | null
  isCore: boolean
}): number {
  const type = TYPE_WEIGHT[input.type] ?? 0.2
  const local = input.isLocal ? 1 : input.isCore ? 0.6 : 0
  const hits = Math.min(1, Math.log2(1 + Math.max(0, input.searches)) / Math.log2(5))
  const pos = input.bestPosition === null ? 0.5 : Math.max(0, 1 - (input.bestPosition - 1) / 30)
  const r = 0.4 * type + 0.25 * local + 0.2 * hits + 0.15 * pos
  const value = input.isCore ? Math.max(CORE_FLOOR, r) : r
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000
}

export function scoreOf(relevance: number, authority: number | null, spam: number | null): number {
  const strength = authority === null ? UNKNOWN_STRENGTH : Math.min(1, Math.max(0, authority / 100))
  let score = 100 * (0.75 * relevance + 0.25 * strength)
  if (spam !== null && spam >= 60) score *= 0.5
  return Math.round(score)
}
