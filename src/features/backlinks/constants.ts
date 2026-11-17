import type { Tone } from "@/components/common/status"
import type { Database } from "@/lib/supabase/database.types"

/** Backlinks: labels, bands and limits (docs/plans/backlinks). */

export type DirectoryType = Database["public"]["Enums"]["directory_type"]
export type OpportunityStatus = Database["public"]["Enums"]["opportunity_status"]
export type RejectReason = Database["public"]["Enums"]["backlink_reject_reason"]
export type RunStatus = Database["public"]["Enums"]["backlink_run_status"]
export type FootprintScope = Database["public"]["Enums"]["footprint_scope"]

export type FilterReason =
  | "own_site"
  | "agency_client"
  | "competitor"
  | "looks_like_business"
  | "blocked"
  | "other_state"
  | "not_local_article"
  | "pdf"

export const TYPE_LABELS: Record<DirectoryType, string> = {
  business_directory: "Business directory",
  industry_directory: "Industry directory",
  maps: "Maps",
  chamber: "Chamber",
  association: "Association",
  review_site: "Reviews / best-of",
  news_blog: "News or blog",
  guest_post: "Guest post",
  social: "Social",
  government: "Government",
  aggregator: "Data aggregator",
  other: "Other",
}

export const DIRECTORY_TYPES = Object.keys(TYPE_LABELS) as DirectoryType[]

export const FILTER_LABELS: Record<FilterReason, string> = {
  own_site: "The client's own website",
  agency_client: "Another client's website",
  competitor: "A competitor (in the map results)",
  looks_like_business: "Looks like a business, not a directory",
  blocked: "Site blocked for all clients",
  other_state: "Mentions a different state",
  not_local_article: "An article with nothing local",
  pdf: "A document, not a site",
}

export const REJECT_LABELS: Record<RejectReason, string> = {
  not_relevant: "Not relevant",
  competitor: "A competitor",
  paid_only: "Paid only",
  not_accepting: "Not accepting listings",
  duplicate: "Duplicate",
  spam: "Spammy or low quality",
  broken: "Site broken",
  other: "Other",
}

export const REJECT_REASONS = Object.keys(REJECT_LABELS) as RejectReason[]

export const COST_LABELS: Record<string, string> = {
  free: "Free",
  paid: "Paid",
  unknown: "Not sure",
}

/** Searches per run, results per search, new places per run. */
export const MAX_QUERIES = 60
export const SEARCH_DEPTH = 30
export const MAX_NEW_PLACES = 200
export const MAX_SERVICES = 3
export const CACHE_DAYS = 90
export const STRENGTH_FRESH_DAYS = 30
/** Searches running at once inside one run. */
export const SEARCH_CONCURRENCY = 5
/** Rough cost of one Live search at depth 30, for the button hint. */
export const SEARCH_COST_USD = 0.006

export type Band = { label: string; tone: Tone }

/** Site strength (DataForSEO Domain Rank on 0–100). Calibrate after the first real checks. */
export function strengthBand(authority: number | null, status: string | null): Band | null {
  if (authority === null) return status === "no_data" ? { label: "No data", tone: "neutral" } : null
  if (authority >= 60) return { label: "Strong", tone: "success" }
  if (authority >= 35) return { label: "Good", tone: "brand" }
  if (authority >= 15) return { label: "Fair", tone: "neutral" }
  return { label: "Weak", tone: "warning" }
}

export function spamBand(spam: number | null): Band | null {
  if (spam === null) return null
  if (spam >= 60) return { label: "Spam risk", tone: "danger" }
  if (spam >= 30) return { label: "Check", tone: "warning" }
  return null
}

export const TABS = ["review", "approved", "rejected", "hidden"] as const
export type Tab = (typeof TABS)[number]

export const TAB_STATUS: Record<Tab, OpportunityStatus> = {
  review: "pending_review",
  approved: "approved",
  rejected: "rejected",
  hidden: "filtered",
}

export const TAB_LABELS: Record<Tab, string> = {
  review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  hidden: "Hidden",
}
