import type { Tone } from "@/components/common/status"
import type { Database } from "@/lib/supabase/database.types"

/** Manual Search: labels, tones and stages (docs/plans/backlinks/09-manual-search.md). Pure. */

type Enums = Database["public"]["Enums"]
export type SubmissionStatus = Enums["submission_status"]
export type SubmissionBlock = Enums["submission_block"]
export type LinkKind = Enums["link_kind"]
export type CatalogPricing = Enums["catalog_pricing"]
export type CatalogCategory = Enums["catalog_category"]
export type CatalogKind = Enums["catalog_kind"]

export const SUBMISSION_STATUSES: SubmissionStatus[] = [
  "todo",
  "doing",
  "submitted",
  "live",
  "blocked",
  "skipped",
]

export const STATUS_META: Record<SubmissionStatus, { label: string; tone: Tone; help: string }> = {
  todo: { label: "To do", tone: "neutral", help: "Picked, not started" },
  doing: { label: "Doing", tone: "info", help: "Account made or form in progress" },
  submitted: { label: "Submitted", tone: "brand", help: "Sent, waiting for the site" },
  live: { label: "Live", tone: "success", help: "Listing is up; counts toward the month" },
  blocked: { label: "Blocked", tone: "danger", help: "Stuck, with the reason" },
  skipped: { label: "Skipped", tone: "neutral", help: "Not doing it" },
}

/** The work-list tabs (?stage=). */
export const STAGES = [
  "open",
  "todo",
  "doing",
  "submitted",
  "live",
  "blocked",
  "skipped",
  "all",
] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_LABELS: Record<Stage, string> = {
  open: "Open",
  todo: "To do",
  doing: "Doing",
  submitted: "Submitted",
  live: "Live",
  blocked: "Blocked",
  skipped: "Skipped",
  all: "All",
}

export const stageHas = (stage: Stage, status: SubmissionStatus) =>
  stage === "all"
    ? true
    : stage === "open"
      ? ["todo", "doing", "submitted", "blocked"].includes(status)
      : stage === status

export const isStage = (v: unknown): v is Stage =>
  typeof v === "string" && (STAGES as readonly string[]).includes(v)

/** Where an approved place came from (?from=). */
export const ORIGINS = ["catalog", "hand", "standard", "ai"] as const
export type Origin = (typeof ORIGINS)[number]
export const ORIGIN_LABELS: Record<Origin, string> = {
  catalog: "Catalog",
  hand: "Added by hand",
  standard: "Standard Search",
  ai: "Shockwave AI",
}

export function originOf(source: string, catalogId: string | null): Origin {
  if (source === "manual") return catalogId ? "catalog" : "hand"
  if (source === "ai") return "ai"
  return "standard"
}

export const BLOCK_LABELS: Record<SubmissionBlock, string> = {
  verification: "Waiting for verification (postcard, phone, video)",
  needs_client_info: "Needs information from the client",
  needs_payment: "Needs payment",
  site_rejected: "The site rejected the listing",
  site_broken: "The site is broken",
  duplicate_found: "A duplicate listing already exists",
  other: "Other",
}
export const BLOCK_REASONS = Object.keys(BLOCK_LABELS) as SubmissionBlock[]

export const LINK_LABELS: Record<LinkKind, string> = {
  follow: "Follow",
  nofollow: "Nofollow",
  mixed: "Mixed",
  varies: "Varies",
  none: "No link",
  unknown: "Not sure",
}
export const LINK_KINDS = Object.keys(LINK_LABELS) as LinkKind[]

export const PRICING_META: Record<CatalogPricing, { label: string; tone: Tone; help: string }> = {
  free: { label: "Free", tone: "success", help: "Free to list" },
  freemium: { label: "Freemium", tone: "success", help: "Free listing, paid upgrades" },
  trial: { label: "Free trial", tone: "warning", help: "Free trial, then paid" },
  paid: { label: "Paid", tone: "warning", help: "Costs money" },
  lead_fees: { label: "Lead fees", tone: "warning", help: "Free profile, pay per lead" },
  membership: { label: "Membership", tone: "warning", help: "Paid membership" },
  selection: { label: "By selection", tone: "info", help: "They pick you; you can't apply or buy" },
  retired: { label: "Closed", tone: "neutral", help: "No longer running" },
}
export const PRICINGS = Object.keys(PRICING_META) as CatalogPricing[]

/** Paid in some way (shown with a cost field). */
export const costsMoney = (p: CatalogPricing) =>
  ["trial", "paid", "lead_fees", "membership"].includes(p)

export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  maps_core: "Maps and core listings",
  citation: "Citation directories",
  local_country: "Country directories",
  home_services: "Home services and trades",
  professional: "Professional and industry",
  b2b_reviews: "B2B review platforms",
  software: "Software and SaaS",
  company_profile: "Company profiles",
  social_profile: "Social profiles",
  publishing: "Publishing platforms",
  journalist_requests: "Journalist requests",
  press_release: "Press releases",
  podcast: "Podcasts",
  local_play: "Local plays",
  community: "Forums and communities",
  ecommerce: "Products and ecommerce",
  marketplace_paid: "Paid guest-post marketplaces",
}
export const CATEGORIES = Object.keys(CATEGORY_LABELS) as CatalogCategory[]

export const PRIORITY_LABELS: Record<number, string> = {
  3: "Must-have",
  2: "Recommended",
  1: "Optional",
}

export const BENEFIT_LABELS: Record<string, string> = {
  ranking: "Rankings",
  citation: "Citation (NAP)",
  referral: "Referral traffic",
  ai_visibility: "AI answers",
  entity: "Brand / entity",
  reviews: "Reviews",
}
export const BENEFITS = Object.keys(BENEFIT_LABELS)

export const NEED_LABELS: Record<string, string> = {
  address: "A street address",
  phone_verification: "Phone verification",
  postcard: "Postcard verification",
  video_verification: "Video verification",
  website: "A website",
  logo: "A logo",
  photos: "Photos",
  reviews: "Reviews first",
  licence: "A licence or membership",
  payment: "Payment",
  personal_profile: "A personal profile as admin",
  content: "An article or real news",
}
export const NEEDS = Object.keys(NEED_LABELS)

/** Max sites picked in one go (pick_catalog_sites caps at 100). */
export const MAX_PICK = 100
