import type { Brief } from "./brief"
import type { DirectoryType } from "./constants"

/**
 * How places are ranked (pure; shown on the page under "How scores work").
 *
 * rule score (0–1, saved by the search), from the client's strategy brief:
 *   local:            0.30 topic + 0.25 site type + 0.15 local + 0.15 searches + 0.15 position
 *   national/global:  0.45 topic + 0.25 site type + 0.15 searches + 0.15 position
 * score (0–100, at read time) = 100 × (0.75 rule score + 0.25 strength)
 *   strength = Domain Rank / 100, unknown = 0.4; spam score 60+ halves the score.
 * The top 30 is then picked by Claude's review (shortlist.ts); without it, by this score.
 * Without a brief (old searches), the original weights below apply.
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
  marketplace: 0.7,
  podcast: 0.55,
  community: 0.5,
  sponsorship: 0.7,
  resource_page: 0.6,
}

const LOCAL_WEIGHT: Record<DirectoryType, number> = {
  chamber: 1,
  industry_directory: 0.95,
  business_directory: 0.9,
  association: 0.85,
  sponsorship: 0.85,
  maps: 0.8,
  community: 0.8,
  review_site: 0.75,
  news_blog: 0.75,
  aggregator: 0.7,
  resource_page: 0.7,
  guest_post: 0.5,
  marketplace: 0.5,
  podcast: 0.5,
  social: 0.45,
  government: 0.35,
  other: 0.2,
}

const B2B_WEIGHT: Record<DirectoryType, number> = {
  review_site: 1,
  marketplace: 0.95,
  industry_directory: 0.95,
  news_blog: 0.85,
  podcast: 0.85,
  association: 0.85,
  resource_page: 0.8,
  guest_post: 0.75,
  sponsorship: 0.75,
  community: 0.7,
  business_directory: 0.45,
  aggregator: 0.4,
  social: 0.4,
  chamber: 0.3,
  maps: 0.3,
  government: 0.3,
  other: 0.25,
}

const B2C_WEIGHT: Record<DirectoryType, number> = {
  review_site: 0.95,
  news_blog: 0.9,
  community: 0.85,
  industry_directory: 0.8,
  podcast: 0.75,
  guest_post: 0.75,
  resource_page: 0.75,
  marketplace: 0.7,
  association: 0.6,
  sponsorship: 0.6,
  business_directory: 0.45,
  social: 0.45,
  aggregator: 0.4,
  chamber: 0.3,
  maps: 0.3,
  government: 0.3,
  other: 0.25,
}

/** How much this kind of site is worth for this client's reach, buyer and offering. */
export function siteTypeWeight(type: DirectoryType, brief: Pick<Brief, "reach" | "buyer" | "offering">): number {
  let w =
    brief.reach === "local"
      ? LOCAL_WEIGHT[type]
      : brief.buyer === "b2c"
        ? B2C_WEIGHT[type]
        : brief.buyer === "b2b"
          ? B2B_WEIGHT[type]
          : (B2B_WEIGHT[type] + B2C_WEIGHT[type]) / 2
  if (brief.offering === "software" && type === "marketplace") w = 1
  if (brief.offering === "products" && (type === "review_site" || type === "marketplace")) w = Math.max(w, 0.95)
  return w ?? 0.25
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

/** Does the text talk about one of the brief's topics? Core topics count fully, adjacent ones 0.7. */
export function topicMatch(
  text: string,
  brief: Pick<Brief, "core_topics" | "adjacent_topics">,
  services: string[] = [],
): { fit: number; topic: string | null } {
  const hay = ` ${words(text)} `
  let best = { fit: 0, topic: null as string | null }
  const check = (topic: string, weight: number) => {
    const parts = words(topic)
      .split(" ")
      .filter((w) => w.length >= 3)
    if (parts.length === 0) return
    // "development" / "developers", "restoration" / "restorations": compare the first 7 letters.
    const stem = (w: string) => (w.length > 7 ? w.slice(0, 7) : w)
    const hits = parts.filter((w) => hay.includes(` ${w}`) || hay.includes(` ${stem(w)}`)).length
    const fit = hits === parts.length ? weight : hits / parts.length >= 0.5 && parts.some((w) => w.length >= 5) ? weight * 0.6 : 0
    if (fit > best.fit) best = { fit, topic }
  }
  for (const t of [...brief.core_topics, ...services]) check(t, 1)
  for (const t of brief.adjacent_topics) check(t, 0.7)
  return best
}

export function ruleScore(input: {
  type: DirectoryType
  brief: Pick<Brief, "reach" | "buyer" | "offering">
  topicFit: number
  isLocal: boolean
  searches: number
  bestPosition: number | null
}): number {
  const type = siteTypeWeight(input.type, input.brief)
  const hits = Math.min(1, Math.log2(1 + Math.max(0, input.searches)) / Math.log2(5))
  const pos = input.bestPosition === null ? 0.5 : Math.max(0, 1 - (input.bestPosition - 1) / 30)
  const topic = Math.min(1, Math.max(0, input.topicFit))
  const r =
    input.brief.reach === "local"
      ? 0.3 * topic + 0.25 * type + 0.15 * (input.isLocal ? 1 : 0) + 0.15 * hits + 0.15 * pos
      : 0.45 * topic + 0.25 * type + 0.15 * hits + 0.15 * pos
  return Math.round(Math.min(1, Math.max(0, r)) * 1000) / 1000
}

export const CORE_FLOOR = 0.8
export const UNKNOWN_STRENGTH = 0.4

/** The original weights (searches made before the brief existed). */
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
