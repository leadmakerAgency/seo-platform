import {
  AtSign,
  BookMarked,
  GitCompareArrows,
  Handshake,
  Landmark,
  Library,
  MapPin,
  MessagesSquare,
  Mic,
  Network,
  Newspaper,
  PenLine,
  Search,
  Sparkles,
  Star,
  Trophy,
  type LucideIcon,
} from "lucide-react"

import { StatusTag, type Tone } from "@/components/common/status"
import { cn } from "@/lib/utils"
import { CATEGORY, FINDER_LABELS, type CategoryKey } from "../config"

/** Small display pieces for the Shockwave AI Search tab (plan appendix C). */

export const CATEGORY_ICON: Record<string, LucideIcon> = {
  best_of_lists: Trophy,
  industry_directories: BookMarked,
  local_citations: MapPin,
  associations: Landmark,
  reviews_marketplaces: Star,
  niche_publications: PenLine,
  local_press_events: Newspaper,
  resource_pages: Library,
  podcasts: Mic,
  communities: MessagesSquare,
  partners_vendors: Handshake,
  competitor_footprint: GitCompareArrows,
  competitor_links: Network,
  gap_footprint: GitCompareArrows,
  mentions: AtSign,
  buyer_questions: Sparkles,
  ranking: Search,
}

export const categoryLabel = (key: string) => CATEGORY[key as CategoryKey]?.label ?? FINDER_LABELS[key as CategoryKey] ?? key

export function CategoryChip({ category, className }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICON[category] ?? Search
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-xs text-muted-foreground", className)}>
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{categoryLabel(category)}</span>
    </span>
  )
}

const LINK: Record<string, { label: string; tone: Tone }> = {
  dofollow: { label: "Followed link", tone: "success" },
  nofollow: { label: "Nofollow", tone: "neutral" },
  sponsored: { label: "Sponsored", tone: "warning" },
  mention_only: { label: "Mention", tone: "info" },
  unknown: { label: "Link unknown", tone: "neutral" },
}

export function LinkTag({ type }: { type: string | null }) {
  const l = LINK[type ?? "unknown"] ?? LINK.unknown
  return (
    <StatusTag tone={l.tone} dot={false}>
      {l.label}
    </StatusTag>
  )
}

export const EFFORT_LABEL: Record<string, string> = {
  minutes: "Quick win",
  hours: "A few hours",
  days: "Days",
  unknown: "Effort unknown",
}

export const COST_LABEL: Record<string, string> = {
  free: "Free",
  paid_optional: "Free + paid options",
  paid_only: "Paid only",
  unknown: "Cost unknown",
}

export const FILTER_LABEL: Record<string, string> = {
  own_site: "The client's own site",
  competitor: "A competitor",
  blocked: "Blocked site",
  excluded_term: "Matches an excluded term",
  ai_rejected: "Not relevant",
  gone: "Page no longer exists",
  ai_invented: "Site doesn't exist",
  not_reachable: "No way to get on it",
  paid_only: "Paid only",
  language_mismatch: "Wrong language for the market",
  spam: "Spam or link seller",
  social_profile: "Social profile",
  not_replicable: "Can't be copied (e.g. their client's site credit)",
}

/** How a competitor got its link (plan 11 §2.5). */
export const LINK_KIND_LABEL: Record<string, string> = {
  directory_listing: "Directory listing",
  best_of_list: "Best-of list",
  editorial_mention: "Editorial mention",
  guest_article: "Guest article",
  resource_page: "Resource page",
  event_or_sponsorship: "Event or sponsorship",
  press_release: "Press release",
  partner_or_vendor: "Partner or vendor page",
  client_credit: "Client credit (website by)",
  forum_or_comment: "Forum or comment",
  paid_or_sponsored: "Paid or sponsored",
  link_network: "Link network",
  other: "Other",
}

export const REPLICABILITY_META: Record<string, { label: string; tone: Tone }> = {
  easy: { label: "Easy to copy", tone: "success" },
  possible: { label: "Copy with a pitch", tone: "info" },
  hard: { label: "Hard to copy", tone: "warning" },
  no: { label: "Can't copy", tone: "neutral" },
}

/** "Links to 3 of 5": how many of the client's competitors this site links to. */
export function SharedBadge({ shared, of, className }: { shared: number | null; of?: number | null; className?: string }) {
  if (!shared) return null
  const strong = shared >= 3
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs tabular-nums",
        strong ? "border-primary/40 bg-brand-soft text-foreground" : "text-muted-foreground",
        className,
      )}
      title="How many of the client's competitors this site links to"
    >
      <Network className="size-3 shrink-0" aria-hidden />
      Links to {shared}
      {of ? ` of ${of}` : ""}
    </span>
  )
}

export const VERDICT_LABEL: Record<string, string> = {
  keep: "Keep",
  competitor: "Competitor",
  irrelevant: "Not relevant",
  paid_link_seller: "Sells links",
  spam: "Spam",
  not_a_link_opportunity: "No way in",
  already_have: "Already listed",
}

export const FLAG_LABEL: Record<string, string> = {
  link_farm: "Very many outbound links",
  sells_posts: "Sells posts or links",
  spam_words: "Spam words on the page",
  sponsored_section: "Sponsored section",
  parked: "Parked domain",
  paid_only: "Paid listings only",
  all_nofollow: "All links nofollow",
  language_mismatch: "Different language",
  thin: "Very little text",
  prompt_injection: "Text aimed at AI tools",
}

export function FitMeter({ fit }: { fit: number | null }) {
  if (fit === null) return <span className="text-xs text-muted-foreground">—</span>
  const tone = fit >= 70 ? "bg-success" : fit >= 50 ? "bg-primary" : "bg-muted-foreground/50"
  return (
    <span className="inline-flex items-center gap-1.5" title={`Fit ${fit} of 100`}>
      <span className="font-mono text-sm tabular-nums">{fit}</span>
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${fit}%` }} />
      </span>
    </span>
  )
}
