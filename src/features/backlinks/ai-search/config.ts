import { hasLocal, hasWide, type Brief, type SiteType } from "../brief"
import type { DirectoryType } from "../constants"

/**
 * Shockwave AI Search: categories, markets and limits (pure; shared by the dialog, the actions
 * and the pipeline). docs/plans/backlinks/08-shockwave-ai-search.md.
 * AI only: Claude Haiku 5.5 with web search, plus our own page fetcher. No DataForSEO.
 */

export const AI_SEARCH_MODEL = "claude-haiku-5-5"
export const AI_REVIEW_CAP = 30
export const MAX_MARKETS = 8

/** Web searches per kind of task. */
export const SEARCHES = {
  ranking: 4,
  research: 3,
  footprint: 3,
  mentions: 2,
  buyerQuestions: 2,
} as const

/** Limits that keep a run small and predictable. */
export const LIMITS = {
  candidatesPerTask: 12,
  maxCandidates: 160,
  perCategoryMarket: 20,
  pageReadBatch: 8,
  judgeBatch: 15,
  editorPool: 60,
  maxPerCategoryInTop: 8,
  maxPaidInTop: 5,
  concurrency: 4,
  fetchConcurrency: 6,
} as const

export type CategoryKey =
  | "best_of_lists"
  | "industry_directories"
  | "local_citations"
  | "associations"
  | "reviews_marketplaces"
  | "niche_publications"
  | "local_press_events"
  | "resource_pages"
  | "podcasts"
  | "communities"
  | "partners_vendors"

/** Extra finders besides the categories. */
export type FinderKey = "ranking" | "competitor_footprint" | "mentions" | "buyer_questions" | "seed" | "competitor_links" | "gap_footprint"

export type Category = {
  key: CategoryKey
  label: string
  /** What the researcher looks for (goes into the prompt). */
  looksFor: string
  /** Turned on when the brief ticks any of these kinds of sites (empty = always). */
  siteTypes: SiteType[]
  /** Local markets (city / region) only, national markets only, or both. */
  scope: "local" | "wide" | "any"
  /** The library type a found site gets. */
  type: DirectoryType
}

/** In priority order: when the search cap is tight, the last ones are dropped first. */
export const CATEGORIES: Category[] = [
  {
    key: "best_of_lists",
    label: "Best-of lists",
    looksFor:
      'roundups and rankings like "best {service} in {place}", "top {service} companies", award or "top rated" lists that accept submissions, nominations or are updated yearly',
    siteTypes: [],
    scope: "any",
    type: "review_site",
  },
  {
    key: "industry_directories",
    label: "Industry directories",
    looksFor:
      "directories and listing sites specific to the client's industry or vertical (not generic business directories), where a business like this can create or claim a profile",
    siteTypes: ["directories"],
    scope: "any",
    type: "industry_directory",
  },
  {
    key: "local_citations",
    label: "Local citations",
    looksFor:
      "local business directories for this city or region, the chamber of commerce member directory, local business associations, the local BBB office, city or county business listings",
    siteTypes: ["directories", "associations"],
    scope: "local",
    type: "business_directory",
  },
  {
    key: "associations",
    label: "Associations",
    looksFor:
      "trade and professional associations, chambers and industry bodies the client could join, with a member directory or member profiles",
    siteTypes: ["associations"],
    scope: "any",
    type: "association",
  },
  {
    key: "reviews_marketplaces",
    label: "Review sites & marketplaces",
    looksFor:
      "review platforms, comparison sites and marketplaces where the client's buyers compare providers (B2B: agency and vendor review platforms; software: software marketplaces and alternatives sites; consumers: review and booking sites)",
    siteTypes: ["review_platforms", "marketplaces"],
    scope: "any",
    type: "review_site",
  },
  {
    key: "niche_publications",
    label: "Niche publications",
    looksFor:
      "editorial blogs and magazines on the client's core and adjacent topics that publish expert contributions, interviews or company features (real editorial sites, never 'write for us' link sellers)",
    siteTypes: ["niche_blogs", "guest_posts"],
    scope: "any",
    type: "news_blog",
  },
  {
    key: "local_press_events",
    label: "Local press & events",
    looksFor:
      "local news sites with a 'submit a story' or business news section, community event calendars, local sponsorship opportunities, neighbourhood and community organisations",
    siteTypes: ["local_news", "sponsorships"],
    scope: "local",
    type: "news_blog",
  },
  {
    key: "resource_pages",
    label: "Resource pages",
    looksFor: "curated resource or links pages on the client's topics that list useful providers, tools or guides",
    siteTypes: ["resource_pages"],
    scope: "any",
    type: "other",
  },
  {
    key: "podcasts",
    label: "Podcasts & interviews",
    looksFor: "podcasts and interview series in the client's niche that feature business owners or experts as guests",
    siteTypes: ["podcasts"],
    scope: "any",
    type: "podcast",
  },
  {
    key: "communities",
    label: "Communities",
    looksFor:
      "forums, subreddits, groups and Q&A communities where the client's buyers ask for recommendations (for mentions and profiles, not links)",
    siteTypes: ["communities"],
    scope: "any",
    type: "community",
  },
  {
    key: "partners_vendors",
    label: "Partners & vendors",
    looksFor:
      "partner, integration, certified-provider, customer-story or 'find a partner' pages of tools, suppliers and platforms the client uses or works with",
    siteTypes: [],
    scope: "wide",
    type: "industry_directory",
  },
]

export const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<CategoryKey, Category>

export const FINDER_LABELS: Record<FinderKey | CategoryKey, string> = {
  ...(Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label])) as Record<CategoryKey, string>),
  ranking: "Ranks for buyer searches",
  competitor_footprint: "Lists competitors",
  mentions: "Mentions the client",
  buyer_questions: "Answers buyer questions",
  seed: "Known for this industry",
  competitor_links: "Links to competitors",
  gap_footprint: "Features competitors (estimate)",
}

/** One place from the places panel, as the AI search sees it. */
export type Market = {
  id: string
  label: string
  kind: "city" | "region" | "country"
  countryIso: string
  city: string | null
  region: string | null
  language: { code: string; name: string }
}

const LANG: Record<string, [string, string]> = {
  US: ["en", "English"], GB: ["en", "English"], CA: ["en", "English"], AU: ["en", "English"], NZ: ["en", "English"],
  IE: ["en", "English"], IN: ["en", "English"], ZA: ["en", "English"], SG: ["en", "English"], PH: ["en", "English"],
  DE: ["de", "German"], AT: ["de", "German"], CH: ["de", "German"], FR: ["fr", "French"], BE: ["fr", "French"],
  LU: ["fr", "French"], ES: ["es", "Spanish"], MX: ["es", "Spanish"], AR: ["es", "Spanish"], CO: ["es", "Spanish"],
  CL: ["es", "Spanish"], PE: ["es", "Spanish"], IT: ["it", "Italian"], NL: ["nl", "Dutch"], PT: ["pt", "Portuguese"],
  BR: ["pt", "Portuguese"], SE: ["sv", "Swedish"], NO: ["no", "Norwegian"], DK: ["da", "Danish"], FI: ["fi", "Finnish"],
  PL: ["pl", "Polish"], CZ: ["cs", "Czech"], SK: ["sk", "Slovak"], RO: ["ro", "Romanian"], HU: ["hu", "Hungarian"],
  GR: ["el", "Greek"], TR: ["tr", "Turkish"], JP: ["ja", "Japanese"], KR: ["ko", "Korean"], CN: ["zh", "Chinese"],
  TW: ["zh", "Chinese"], AE: ["ar", "Arabic"], SA: ["ar", "Arabic"], IL: ["he", "Hebrew"], RS: ["sr", "Serbian"],
  HR: ["hr", "Croatian"], BG: ["bg", "Bulgarian"], MK: ["mk", "Macedonian"], SI: ["sl", "Slovenian"], UA: ["uk", "Ukrainian"],
}

export function languageOf(countryIso: string) {
  const l = LANG[countryIso.toUpperCase()] ?? ["en", "English"]
  return { code: l[0], name: l[1] }
}

export const isLocalMarket = (m: Pick<Market, "kind">) => m.kind !== "country"

/** The categories that apply to one market for this brief. */
export function categoriesFor(market: Pick<Market, "kind">, brief: Pick<Brief, "reach" | "site_types">): CategoryKey[] {
  const local = isLocalMarket(market) && hasLocal(brief)
  const wide = !isLocalMarket(market) || !hasLocal(brief) || hasWide(brief)
  return CATEGORIES.filter((c) => {
    if (c.scope === "local" && !local) return false
    if (c.scope === "wide" && !wide) return false
    return c.siteTypes.length === 0 || c.siteTypes.some((t) => (brief.site_types as string[]).includes(t))
  }).map((c) => c.key)
}

// ---------------------------------------------------------------------------
// The plan of work and its estimate
// ---------------------------------------------------------------------------

export type PlannedTask = {
  stage: number
  kind: "dossier" | "ranking" | "competitors" | "research" | "footprint" | "mentions" | "buyer_questions"
  key: string
  marketId: string | null
  category: CategoryKey | null
  searches: number
}

export type AiPlan = {
  tasks: PlannedTask[]
  /** Research tasks dropped to stay under the web search cap. */
  dropped: { marketId: string; category: CategoryKey }[]
  searches: number
  estimateUsd: number
  /** Minutes, roughly. */
  minutes: [number, number]
}

/** Rough $ per task in Haiku tokens (prompts ≤ 100K tokens: $0.10 / $0.50 per million). */
const TOKEN_COST = {
  dossier: 0.003,
  ranking: 0.006,
  competitors: 0.001,
  research: 0.005,
  footprint: 0.005,
  mentions: 0.004,
  buyer_questions: 0.004,
  // Per run: page reading (~150 pages), judging, picking and occasional JSON repairs.
  verify: 0.06,
  judge: 0.04,
  editor: 0.006,
  repairs: 0.01,
}

/**
 * Every task a run will make, trimmed to the web search cap (lowest-priority research first),
 * and what it should cost. `disabled` lets the dialog untick categories for one run.
 */
export function planAiSearch(input: {
  markets: Pick<Market, "id" | "kind">[]
  brief: Pick<Brief, "reach" | "site_types">
  disabled?: CategoryKey[]
  maxSearches: number
  searchPrice: number
}): AiPlan {
  const tasks: PlannedTask[] = [{ stage: 1, kind: "dossier", key: "dossier", marketId: null, category: null, searches: 0 }]
  for (const m of input.markets) {
    tasks.push({ stage: 2, kind: "ranking", key: `ranking:${m.id}`, marketId: m.id, category: null, searches: SEARCHES.ranking })
  }
  for (const m of input.markets) {
    tasks.push({ stage: 3, kind: "competitors", key: `competitors:${m.id}`, marketId: m.id, category: null, searches: 0 })
  }
  const fixed: PlannedTask[] = []
  for (const m of input.markets) {
    fixed.push({ stage: 4, kind: "footprint", key: `footprint:${m.id}`, marketId: m.id, category: null, searches: SEARCHES.footprint })
    fixed.push({ stage: 4, kind: "buyer_questions", key: `buyer_questions:${m.id}`, marketId: m.id, category: null, searches: SEARCHES.buyerQuestions })
  }
  fixed.push({ stage: 4, kind: "mentions", key: "mentions", marketId: null, category: null, searches: SEARCHES.mentions })

  // Research: round-robin by category priority across markets, so trimming drops the least useful.
  const research: PlannedTask[] = []
  const perMarket = input.markets.map((m) => ({
    m,
    cats: categoriesFor(m, input.brief).filter((c) => !(input.disabled ?? []).includes(c)),
  }))
  for (const cat of CATEGORIES.map((c) => c.key)) {
    for (const { m, cats } of perMarket) {
      if (cats.includes(cat)) {
        research.push({ stage: 4, kind: "research", key: `research:${cat}:${m.id}`, marketId: m.id, category: cat, searches: SEARCHES.research })
      }
    }
  }

  const base = [...tasks, ...fixed].reduce((n, t) => n + t.searches, 0)
  let budget = Math.max(0, input.maxSearches - base)
  const kept: PlannedTask[] = []
  const dropped: AiPlan["dropped"] = []
  for (const t of research) {
    if (t.searches <= budget) {
      kept.push(t)
      budget -= t.searches
    } else {
      dropped.push({ marketId: t.marketId!, category: t.category! })
    }
  }
  const all = [...tasks, ...fixed, ...kept]
  const searches = all.reduce((n, t) => n + t.searches, 0)
  const tokens =
    all.reduce((n, t) => n + (TOKEN_COST[t.kind] ?? 0.005), 0) +
    TOKEN_COST.verify +
    TOKEN_COST.judge +
    TOKEN_COST.editor +
    TOKEN_COST.repairs
  const estimateUsd = Math.round((searches * input.searchPrice + tokens) * 1.1 * 1000) / 1000
  const research4 = kept.length + fixed.length
  const minutes: [number, number] = [Math.max(4, Math.round(3 + research4 / 6)), Math.max(8, Math.round(6 + research4 / 3))]
  return { tasks: all, dropped, searches, estimateUsd, minutes }
}

// ---------------------------------------------------------------------------
// Competitor backlinks (docs/plans/backlinks/11-competitor-backlinks.md)
// ---------------------------------------------------------------------------

/** "Links to competitors" as a category label (the found_by key is the same). */
export const GAP_CATEGORY = "competitor_links"
export const GAP_LABEL = "Links to competitors"
export const GAP_FOOTPRINT_LABEL = "Estimated from mentions"

/** DataForSEO Backlinks prices (per task, per row returned). */
const DFS_BACKLINKS = { task: 0.024, row: 0.000036, bulkTask: 0.02, bulkRow: 0.00002 }

export type GapPlan = {
  mode: "dataforseo" | "ai_only"
  /** DataForSEO $ (0 when cached or AI only). */
  dfsUsd: number
  /** Claude $ (page checks, judging, insights; web searches in AI-only mode). */
  aiUsd: number
  searches: number
  estimateUsd: number
  minutes: [number, number]
}

/**
 * What a competitor backlinks pass should cost. With DataForSEO: the linking sites of each
 * competitor and the client, the linking pages, strength for the kept sites, then Claude.
 * AI only: up to 5 web searches per competitor.
 */
export function planGap(input: {
  competitors: number
  maxSites: number
  mode: "dataforseo" | "ai_only"
  cached?: boolean
  searchPrice: number
  referrersPerCompetitor?: number
}): GapPlan {
  const n = Math.max(0, input.competitors)
  const sites = Math.max(0, input.maxSites)
  const pagesAi = Math.min(sites, 200)
  // Page checks (8 per call), judging (15 per call), insights.
  const claude = Math.ceil(pagesAi / 8) * 0.004 + Math.ceil(pagesAi / 15) * 0.004 + 0.004
  if (input.mode === "ai_only") {
    const searches = n * 5
    const aiUsd = Math.round((searches * input.searchPrice + n * 0.005 + 0.03) * 1000) / 1000
    return { mode: "ai_only", dfsUsd: 0, aiUsd, searches, estimateUsd: Math.round(aiUsd * 1.1 * 1000) / 1000, minutes: [4, 10] }
  }
  const per = input.referrersPerCompetitor ?? 500
  const dfsUsd = input.cached
    ? 0
    : Math.round(
        ((n + 1) * (DFS_BACKLINKS.task + per * DFS_BACKLINKS.row) +
          n * (DFS_BACKLINKS.task + Math.min(1000, sites * 2) * DFS_BACKLINKS.row) +
          2 * (DFS_BACKLINKS.bulkTask + sites * DFS_BACKLINKS.bulkRow)) *
          1000,
      ) / 1000
  const aiUsd = Math.round(claude * 1000) / 1000
  return {
    mode: "dataforseo",
    dfsUsd,
    aiUsd,
    searches: 0,
    estimateUsd: Math.round((dfsUsd + aiUsd) * 1.1 * 1000) / 1000,
    minutes: [3, 8],
  }
}
