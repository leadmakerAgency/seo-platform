import type { Tone } from "@/components/common/status"
import type { Database } from "@/lib/supabase/database.types"

export type Engine = Database["public"]["Enums"]["rank_engine"]
export type CandidateStatus = Database["public"]["Enums"]["candidate_status"]
export type ResearchStatus = Database["public"]["Enums"]["research_status"]
export type RunStatus = Database["public"]["Enums"]["rank_run_status"]
export type Intent = "informational" | "navigational" | "commercial" | "transactional"

export const ENGINES: Engine[] = ["google", "google_maps", "bing"]

export const ENGINE_META: Record<Engine, { label: string; short: string; depthLabel: string }> = {
  google: { label: "Google", short: "Google", depthLabel: "top 100" },
  google_maps: { label: "Google Maps", short: "Maps", depthLabel: "top 20" },
  bing: { label: "Bing", short: "Bing", depthLabel: "top 100" },
}

export const INTENT_META: Record<Intent, { label: string; tone: Tone; explain: string }> = {
  transactional: {
    label: "Buying",
    tone: "success",
    explain: "Ready to hire or buy now (“book”, “near me”, “cost”).",
  },
  commercial: {
    label: "Comparing",
    tone: "info",
    explain: "Comparing options before choosing a business (“best”, “reviews”).",
  },
  informational: {
    label: "Researching",
    tone: "neutral",
    explain: "Looking for information, not a business (“how to”, “what is”).",
  },
  navigational: {
    label: "Looking for a brand",
    tone: "neutral",
    explain: "Looking for a specific company or website.",
  },
}

export const intentOf = (v: string | null | undefined): Intent | null =>
  v === "informational" || v === "navigational" || v === "commercial" || v === "transactional"
    ? v
    : null

export const RESEARCH_STATUS_META: Record<ResearchStatus, { label: string; tone: Tone }> = {
  queued: { label: "Waiting to start", tone: "neutral" },
  running: { label: "Running", tone: "brand" },
  done: { label: "Finished", tone: "success" },
  failed: { label: "Didn't finish", tone: "danger" },
}

export const RUN_STATUS_META: Record<RunStatus, { label: string; tone: Tone }> = {
  queued: { label: "Starting", tone: "neutral" },
  running: { label: "Checking", tone: "brand" },
  done: { label: "Done", tone: "success" },
  partial: { label: "Partly done", tone: "warning" },
  failed: { label: "Didn't finish", tone: "danger" },
}

export const SOURCE_LABELS: Record<string, string> = {
  ranked: "Already ranking",
  search_console: "Search Console",
  google_business: "Business Profile",
  ideas: "Ideas",
  suggestions: "Suggestions",
  related: "Related searches",
  competitor: "Competitors",
  tracked: "Tracked",
}

/** Estimated cost of one research run, shown on the button (real cost is recorded per call). */
export const RESEARCH_ESTIMATE_USD = 0.5

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/** Not-found positions are stored as null and shown as "—" with this tooltip. */
export const NOT_FOUND = { google: "Not in the top 100", google_maps: "Not in the top 20", bing: "Not in the top 100" }

/** US state abbreviations (the shared list lives in src/lib/regions.ts). */
export { US_STATES } from "@/lib/regions"

/** Location types worth caching from DataForSEO's lists (it also lists airports, universities…). */
export const LOCATION_TYPES = new Set([
  "Country",
  "State",
  "Province",
  "Region",
  "County",
  "City",
  "Municipality",
  "DMA Region",
  "Neighborhood",
])
