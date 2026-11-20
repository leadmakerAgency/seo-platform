import "server-only"

import {
  bulkRanks,
  bulkSpamScore,
  linksToTarget,
  referringDomains,
  type CompetitorLink,
  type ReferringDomain,
} from "@/lib/dataforseo/backlinks"
import { labsItems } from "@/lib/dataforseo/api"
import type { Db } from "@/lib/dataforseo/client"
import type { Json } from "@/lib/supabase/database.types"
import { registrableDomain } from "../site-key"
import { cleanDomain, GENERIC_LINKERS, PLATFORMS } from "./competitors"

/**
 * Competitor link gap (docs/plans/backlinks/11-competitor-backlinks.md §2.2–2.4, 2.8).
 *
 * 1. The sites linking to each competitor (top 500 each by strength) and to the client.
 * 2. Count, per site, how many competitors it links to ("links to 3 of 5"); drop the client's
 *    existing linkers, the competitors' own sites, platforms and spam.
 * 3. The exact linking page per competitor (one link per site).
 * 4. Domain Rank and spam score for the kept sites (shared site library).
 * Results are cached for 30 days per competitor set; a re-run costs only Claude.
 */

export const GAP_REFERRERS_PER_COMPETITOR = 500
const CACHE_DAYS = 30
const SPAM_LIMIT = 60

export type GapLink = {
  competitor: string
  url_from: string
  title: string | null
  anchor: string | null
  dofollow: boolean | null
  location: string | null
  text: string | null
  first_seen: string | null
  language: string | null
  still_there?: boolean | null
  /** How many competitors were compared ("links to 3 of 5"). */
  of?: number
}

export type GapSite = {
  domain: string
  shared: number
  competitors: string[]
  rank: number | null
  spam: number | null
  links: GapLink[]
}

export type GapResult = {
  sites: GapSite[]
  /** Linking sites found across all competitors, before filtering. */
  total: number
  cost: number
  cached: boolean
  fetchedAt: string
}

type Ctx = { clientId: string; ref: string }

export function gapKey(competitors: string[], clientDomain: string | null, perCompetitor: number) {
  return `${[...competitors].sort().join(",")}|${clientDomain ?? "-"}|${perCompetitor}`
}

/** Count and filter the referring domains (pure, so it can be tested on saved responses). */
export function intersect(input: {
  byCompetitor: Record<string, ReferringDomain[]>
  clientLinkers: Set<string>
  competitors: string[]
  clientDomain: string | null
  minShared: number
  includeSingle: boolean
  maxSites: number
}): { sites: Omit<GapSite, "links">[]; total: number } {
  const own = new Set(input.competitors.map((c) => registrableDomain(c)))
  const map = new Map<string, { competitors: Set<string>; rank: number | null; spam: number | null }>()
  for (const [competitor, list] of Object.entries(input.byCompetitor)) {
    for (const r of list) {
      const root = registrableDomain(r.domain)
      if (!root) continue
      const e = map.get(r.domain) ?? { competitors: new Set<string>(), rank: null, spam: null }
      e.competitors.add(competitor)
      e.rank = Math.max(e.rank ?? 0, r.rank ?? 0) || e.rank
      e.spam = r.spam === null ? e.spam : Math.max(e.spam ?? 0, r.spam)
      map.set(r.domain, e)
    }
  }
  const total = map.size
  const clientRoot = input.clientDomain ? registrableDomain(input.clientDomain) : null
  const min = input.includeSingle ? 1 : Math.max(1, input.minShared)
  const sites = [...map.entries()]
    .filter(([domain]) => {
      const root = registrableDomain(domain)
      return (
        !own.has(root) &&
        root !== clientRoot &&
        !GENERIC_LINKERS.has(root) &&
        !input.clientLinkers.has(domain) &&
        !input.clientLinkers.has(root)
      )
    })
    .map(([domain, e]) => ({ domain, shared: e.competitors.size, competitors: [...e.competitors], rank: e.rank, spam: e.spam }))
    .filter((s) => s.shared >= min)
    .sort((a, b) => b.shared - a.shared || (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, input.maxSites)
  return { sites, total }
}

/**
 * The full link gap for a competitor set, from the cache when it's fresh.
 * Throws BacklinksAccessError when Backlinks access is off (the caller falls back to AI only).
 */
export async function competitorGap(
  db: Db,
  input: {
    competitors: string[]
    clientDomain: string | null
    minShared: number
    includeSingle: boolean
    maxSites: number
    refresh?: boolean
  },
  ctx: Ctx,
): Promise<GapResult> {
  const key = gapKey(input.competitors, input.clientDomain, GAP_REFERRERS_PER_COMPETITOR)
  let byCompetitor: Record<string, ReferringDomain[]> = {}
  let clientLinkers = new Set<string>()
  let pages: Record<string, CompetitorLink[]> = {}
  let cost = 0
  let cached = false
  let fetchedAt = new Date().toISOString()

  if (!input.refresh) {
    const { data } = await db
      .from("backlink_gap_cache")
      .select("intersection, pages, fetched_at")
      .eq("key", key)
      .gte("fetched_at", new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString())
      .maybeSingle()
    if (data) {
      const i = data.intersection as unknown as { byCompetitor?: Record<string, ReferringDomain[]>; clientLinkers?: string[] }
      byCompetitor = i.byCompetitor ?? {}
      clientLinkers = new Set(i.clientLinkers ?? [])
      pages = (data.pages ?? {}) as unknown as Record<string, CompetitorLink[]>
      cached = Object.keys(byCompetitor).length > 0
      fetchedAt = data.fetched_at
    }
  }

  if (!cached) {
    const results = await Promise.all(
      input.competitors.map((c) => referringDomains(db, c, GAP_REFERRERS_PER_COMPETITOR, ctx).then((r) => [c, r] as const)),
    )
    for (const [c, r] of results) {
      byCompetitor[c] = r.domains
      cost += r.cost
    }
    if (input.clientDomain) {
      const mine = await referringDomains(db, input.clientDomain, 1000, ctx)
      clientLinkers = new Set(mine.domains.map((d) => d.domain))
      cost += mine.cost
    }
  }

  const { sites, total } = intersect({
    byCompetitor,
    clientLinkers,
    competitors: input.competitors,
    clientDomain: input.clientDomain,
    minShared: input.minShared,
    includeSingle: input.includeSingle,
    maxSites: input.maxSites,
  })

  // The exact linking pages, per competitor, for the kept sites (only what the cache lacks).
  const need = new Map<string, string[]>()
  for (const s of sites) {
    for (const c of s.competitors) {
      if ((pages[c] ?? []).some((l) => l.domainFrom === s.domain)) continue
      need.set(c, [...(need.get(c) ?? []), s.domain])
    }
  }
  for (const [c, domains] of need) {
    const r = await linksToTarget(db, c, domains, ctx)
    cost += r.cost
    pages[c] = [...(pages[c] ?? []), ...r.links].slice(0, 2000)
  }

  // Strength and spam for the kept sites (shared library; also feeds Standard Search).
  if (!cached && sites.length) {
    const targets = sites.map((s) => s.domain)
    const [ranks, spam] = await Promise.allSettled([bulkRanks(db, targets, ctx), bulkSpamScore(db, targets, ctx)])
    const rankValues = ranks.status === "fulfilled" ? ranks.value.values : {}
    const spamValues = spam.status === "fulfilled" ? spam.value.values : {}
    cost += (ranks.status === "fulfilled" ? ranks.value.cost : 0) + (spam.status === "fulfilled" ? spam.value.cost : 0)
    for (const s of sites) {
      if (typeof spamValues[s.domain] === "number") s.spam = spamValues[s.domain]
      if (typeof rankValues[s.domain] === "number") s.rank = rankValues[s.domain]
    }
    if (Object.keys(rankValues).length || Object.keys(spamValues).length) {
      await db.rpc("dfs_store_site_strength", { p_ranks: rankValues as unknown as Json, p_spam: spamValues as unknown as Json })
    }
  }

  if (!cached || need.size) {
    await db.from("backlink_gap_cache").upsert(
      {
        key,
        client_id: ctx.clientId,
        competitors: input.competitors,
        client_domain: input.clientDomain,
        intersection: { byCompetitor, clientLinkers: [...clientLinkers] } as unknown as Json,
        pages: pages as unknown as Json,
        rows: Object.values(byCompetitor).reduce((n, l) => n + l.length, 0),
        cost_usd: Math.round(cost * 100000) / 100000,
        fetched_at: cached ? fetchedAt : new Date().toISOString(),
      },
      { onConflict: "key" },
    )
    // Old cache rows go after 90 days.
    await db.from("backlink_gap_cache").delete().lt("fetched_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
  }

  const withLinks: GapSite[] = sites
    // Spam stays in the list; the merge step hides it with the reason.
    .map((s) => ({
      ...s,
      links: s.competitors
        .map((c) => {
          const l = (pages[c] ?? []).find((x) => x.domainFrom === s.domain)
          const link: GapLink | null = l
            ? {
                competitor: c,
                url_from: l.urlFrom,
                title: l.title,
                anchor: l.anchor,
                dofollow: l.dofollow,
                location: l.location,
                text: [l.textPre, l.anchor ? `[${l.anchor}]` : null, l.textPost].filter(Boolean).join(" ").slice(0, 300) || null,
                first_seen: l.firstSeen,
                language: l.language,
                of: input.competitors.length,
              }
            : null
          return link
        })
        .filter((x): x is GapLink => Boolean(x))
        .slice(0, 5),
    }))
  return { sites: withLinks, total, cost, cached, fetchedAt }
}

/** Spam score at which a site goes to Hidden. */
export const GAP_SPAM_LIMIT = SPAM_LIMIT

/**
 * Keyword-overlap competitors from DataForSEO Labs (domains ranking for the same keywords),
 * used when the AI search and the team haven't named enough. Big platforms are dropped.
 */
export async function labsCompetitors(
  db: Db,
  input: { domain: string; locationCode: number; languageCode: string | null },
  ctx: Ctx,
): Promise<{ domain: string; intersections: number }[]> {
  const items = await labsItems(
    db,
    "competitors_domain",
    {
      target: input.domain,
      location_code: input.locationCode,
      ...(input.languageCode ? { language_code: input.languageCode } : {}),
      exclude_top_domains: true,
      limit: 20,
      filters: [["intersections", ">=", 10]],
    },
    ctx,
  )
  const own = registrableDomain(input.domain)
  const out: { domain: string; intersections: number }[] = []
  for (const it of items) {
    const d = cleanDomain(String(it.domain ?? ""))
    if (!d || PLATFORMS.has(registrableDomain(d)) || registrableDomain(d) === own) continue
    if (out.some((o) => o.domain === d)) continue
    out.push({ domain: d, intersections: Number(it.intersections ?? 0) || 0 })
  }
  return out.slice(0, 10)
}
