import { z } from "zod"

/**
 * What each Haiku step must answer (structured outputs). Limits on list lengths are applied in code
 * after parsing, so the schemas stay simple for structured outputs.
 */

export const VERTICALS = [
  "restaurant",
  "healthcare",
  "legal",
  "home_services",
  "real_estate",
  "automotive",
  "saas",
  "agency",
  "ecommerce",
  "publisher",
  "professional_services",
  "other",
] as const

export const DossierSchema = z.object({
  summary: z.string(),
  business_type: z.enum(["brick_and_mortar", "service_area", "hybrid", "online"]),
  vertical: z.enum(VERTICALS),
  services: z.array(z.string()),
  differentiators: z.array(z.string()),
  brand_names: z.array(z.string()),
  ideal_buyer: z.object({ who: z.string(), triggers: z.string(), researches_on: z.array(z.string()) }),
  facts: z.array(z.object({ text: z.string(), quote: z.string(), source_url: z.string() })),
  doubts: z.array(z.string()),
})
export type Dossier = z.infer<typeof DossierSchema>

export const RESULT_KINDS = [
  "direct_competitor",
  "best_of_list",
  "directory",
  "review_site",
  "marketplace",
  "publisher",
  "association",
  "forum",
  "government",
  "client",
  "other",
] as const

export const RankingSchema = z.object({
  queries: z.array(
    z.object({ q: z.string(), intent: z.enum(["commercial", "transactional", "informational"]), why: z.string() }),
  ),
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      query: z.string(),
      kind: z.enum(RESULT_KINDS),
      can_get_listed: z.boolean(),
    }),
  ),
})
export type Ranking = z.infer<typeof RankingSchema>

export const CompetitorsSchema = z.object({
  competitors: z.array(z.object({ domain: z.string(), name: z.string(), why: z.string() })),
})
export type Competitors = z.infer<typeof CompetitorsSchema>

export const ACTIONS = [
  "submit",
  "claim",
  "join",
  "request_review",
  "pitch",
  "sponsor",
  "get_featured",
  "ask_for_link",
  "contribute",
  "other",
] as const

export const CandidatesSchema = z.object({
  items: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      why: z.string(),
      quote: z.string(),
      query: z.string(),
      action: z.enum(ACTIONS),
    }),
  ),
})
export type Candidates = z.infer<typeof CandidatesSchema>

export const PAGE_KINDS = [
  "best_of_list",
  "directory",
  "review_site",
  "marketplace",
  "publisher",
  "association",
  "forum",
  "podcast",
  "resource_page",
  "partner_page",
  "event_or_sponsorship",
  "business_site",
  "government",
  "other",
] as const

/** How a competitor got a link on a page (plan 11 §2.5). */
export const LINK_KINDS = [
  "directory_listing",
  "best_of_list",
  "editorial_mention",
  "guest_article",
  "resource_page",
  "event_or_sponsorship",
  "press_release",
  "partner_or_vendor",
  "client_credit",
  "forum_or_comment",
  "paid_or_sponsored",
  "link_network",
  "other",
] as const
export type LinkKind = (typeof LINK_KINDS)[number]

/** Can the client get the same link? */
export const REPLICABILITY = ["easy", "possible", "hard", "no"] as const
export type Replicability = (typeof REPLICABILITY)[number]

export const PageReadSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      page_kind: z.enum(PAGE_KINDS),
      lists_businesses: z.boolean(),
      action: z.string(),
      submit_url: z.string().nullable(),
      contact_url: z.string().nullable(),
      updated: z.string().nullable(),
      quote: z.string(),
      authority: z.number().int().min(1).max(5),
      red_flags: z.array(z.string()),
      /** Only for pages where a competitor has a link (null otherwise). */
      link_kind: z.enum(LINK_KINDS).nullable(),
      replicability: z.enum(REPLICABILITY).nullable(),
      how_to_get: z.string().nullable(),
    }),
  ),
})
export type PageRead = z.infer<typeof PageReadSchema>

/** What competitors do for links, in a few lines (competitor backlinks, plan 11 §2.5). */
export const InsightsSchema = z.object({
  insights: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      kind: z.enum(["pattern", "quick_win", "ask_clients", "watch_out"]),
    }),
  ),
})
export type Insights = z.infer<typeof InsightsSchema>

export const VERDICTS = [
  "keep",
  "competitor",
  "irrelevant",
  "paid_link_seller",
  "spam",
  "not_a_link_opportunity",
  "already_have",
] as const

const score = z.number().int().min(1).max(5)

export const JudgementSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      relevant: score,
      real: score,
      reachable: score,
      worth_it: score,
      notes: z.string(),
      verdict: z.enum(VERDICTS),
      action: z.string(),
      effort: z.enum(["minutes", "hours", "days", "unknown"]),
      cost_type: z.enum(["free", "paid_optional", "paid_only", "unknown"]),
      reason: z.string(),
    }),
  ),
})
export type Judgement = z.infer<typeof JudgementSchema>

export const PicksSchema = z.object({
  picks: z.array(z.object({ id: z.string(), pick_rank: z.number().int().min(1).max(30), reason: z.string() })),
})
export type Picks = z.infer<typeof PicksSchema>
