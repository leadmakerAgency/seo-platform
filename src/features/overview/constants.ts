import type { Tone } from "@/components/common/status"
import type { Database } from "@/lib/supabase/database.types"

export type DeliverableKind = Database["public"]["Enums"]["deliverable_kind"]
export type PackageKind = Database["public"]["Enums"]["package_kind"]
export type WorkSource = Database["public"]["Enums"]["work_source"]

/** Display order = the enum order in the database. */
export const DELIVERABLES: DeliverableKind[] = [
  "backlinks",
  "articles",
  "gbp_posts",
  "review_requests",
  "ai_fixes",
]

export const DELIVERABLE_META: Record<
  DeliverableKind,
  { label: string; one: string; many: string; target: TargetField }
> = {
  backlinks: {
    label: "Backlinks",
    one: "backlink",
    many: "backlinks",
    target: "backlinks_target",
  },
  articles: { label: "Articles", one: "article", many: "articles", target: "articles_target" },
  gbp_posts: {
    label: "Google posts",
    one: "Google post",
    many: "Google posts",
    target: "gbp_posts_target",
  },
  review_requests: {
    label: "Review requests",
    one: "review request",
    many: "review requests",
    target: "review_requests_target",
  },
  ai_fixes: {
    label: "AI visibility fixes",
    one: "AI visibility fix",
    many: "AI visibility fixes",
    target: "ai_fixes_target",
  },
}

export type TargetField =
  | "backlinks_target"
  | "articles_target"
  | "gbp_posts_target"
  | "review_requests_target"
  | "ai_fixes_target"

export const PACKAGES: { value: PackageKind; label: string }[] = [
  { value: "seo", label: "SEO" },
  { value: "geo", label: "GEO" },
  { value: "seo_geo", label: "SEO + GEO" },
  { value: "custom", label: "Custom" },
]

export const packageLabel = (p: PackageKind) => PACKAGES.find((x) => x.value === p)?.label ?? p

/** Statuses returned by client_month_progress(). */
export type ProgressStatus = "done" | "on_track" | "behind" | "delivered" | "short"

export const PROGRESS_META: Record<ProgressStatus, { label: string; tone: Tone }> = {
  done: { label: "Done", tone: "success" },
  on_track: { label: "On track", tone: "success" },
  behind: { label: "Needs a look", tone: "warning" },
  delivered: { label: "Delivered", tone: "success" },
  short: { label: "Short", tone: "warning" },
}

export const SOURCE_LABELS: Record<WorkSource, string> = {
  task: "Task",
  manual: "Logged by hand",
  backlink: "Backlinks",
  article: "Content",
  gbp_post: "Google post",
  review_request: "Reviews",
  ai_fix: "AI visibility",
}

/** The three places a business shows up, in the order the panel shows them. */
export const PLACES = {
  website: {
    title: "Website on search engines",
    unit: "keywords in the Google top 10",
    explain: "The normal blue links on Google and Bing.",
    link: { label: "See website rankings", segment: "rankings" },
    empty: "No ranking check yet. Add keywords on Rankings and the weekly check fills this in.",
  },
  map: {
    title: "Google Business Profile",
    unit: "keywords in the map pack",
    explain:
      "The map listing with the 3 businesses above the blue links. This brings most of the phone calls.",
    link: { label: "See map rankings", segment: "rankings" },
    empty: "No map check yet. It runs with the weekly ranking check once keywords are added.",
  },
  ai: {
    title: "AI answers",
    unit: "AI answers naming the business",
    explain: "When people ask ChatGPT, Gemini, Perplexity and others for a recommendation.",
    link: { label: "See AI visibility", segment: "ai-visibility" },
    empty: "No AI check yet. It starts once keywords are added and AI tracking is switched on.",
  },
} as const

export type PlaceKey = keyof typeof PLACES
