/**
 * AI Visibility constants and the cost estimate (pure; used on the server and in the browser).
 * Prices: docs/plans/ai-visibility/02-data-sources.md §6. Update after the phase 0 check.
 */

export const AIV_MODELS = ["chatgpt", "gemini", "ai_overview", "ai_mode", "claude", "perplexity"] as const
export type AivModel = (typeof AIV_MODELS)[number]
export const isAivModel = (v: unknown): v is AivModel => typeof v === "string" && (AIV_MODELS as readonly string[]).includes(v)

export const MODEL_META: Record<AivModel, { label: string; short: string; note: string }> = {
  chatgpt: { label: "ChatGPT", short: "ChatGPT", note: "ChatGPT as a user sees it, with the pages it read and cited" },
  gemini: { label: "Gemini", short: "Gemini", note: "Gemini as a user sees it" },
  ai_overview: { label: "Google AI Overview", short: "AI Overview", note: "The AI answer on top of Google results" },
  ai_mode: { label: "Google AI Mode", short: "AI Mode", note: "Google's AI Mode answer" },
  claude: { label: "Claude", short: "Claude", note: "Claude through its API, with web search" },
  perplexity: { label: "Perplexity", short: "Perplexity", note: "Perplexity through its API, with web search" },
}

export const INTENTS = ["informational", "commercial", "transactional", "navigational"] as const
export type AivIntent = (typeof INTENTS)[number]
export const INTENT_LABEL: Record<AivIntent, string> = {
  informational: "Informational",
  commercial: "Commercial",
  transactional: "Transactional",
  navigational: "Navigational",
}

export const FREQUENCIES = ["weekly", "twice_weekly", "daily"] as const
export type AivFrequency = (typeof FREQUENCIES)[number]
export const FREQUENCY_LABEL: Record<AivFrequency, string> = {
  weekly: "Weekly",
  twice_weekly: "Twice a week",
  daily: "Daily",
}
export const RUNS_PER_MONTH: Record<AivFrequency, number> = { weekly: 4.33, twice_weekly: 8.66, daily: 30.4 }

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

export const SOURCE_TYPES = ["corporate", "editorial", "reference", "ugc", "directory", "social", "ecommerce", "other"] as const
export type SourceType = (typeof SOURCE_TYPES)[number]
export const SOURCE_TYPE_LABEL: Record<SourceType | "own" | "competitor", string> = {
  own: "Client's site",
  competitor: "Competitor",
  corporate: "Company site",
  editorial: "Editorial",
  reference: "Reference",
  ugc: "Community",
  directory: "Directory or review site",
  social: "Social",
  ecommerce: "Shop",
  other: "Other",
}

export const ACTION_GROUPS = ["site", "own_pages", "earned", "claims"] as const
export type ActionGroup = (typeof ACTION_GROUPS)[number]
export const ACTION_GROUP_META: Record<ActionGroup, { label: string; note: string }> = {
  site: { label: "Fix how AI reads the site", note: "Crawler access and pages AI can't use" },
  own_pages: { label: "Improve the client's pages", note: "Content AI reads but doesn't cite, or is missing" },
  earned: { label: "Get mentioned elsewhere", note: "Sites AI relies on where competitors appear and the client doesn't" },
  claims: { label: "Fix wrong claims", note: "Coming later: checking what AI says against the facts" },
}

/** Dollars per answer, by platform (DataForSEO pricing page, 2026-11; verify after the first run). */
export const UNIT_USD: Record<AivModel, number> = {
  chatgpt: 0.0012,
  gemini: 0.0012,
  ai_overview: 0.0026, // SERP task + async AI Overview extra ($0.002, refunded when there is none)
  ai_mode: 0.002,
  claude: 0.0126,
  perplexity: 0.0066,
}
/** Haiku reading one answer, and per-run extras (domains, insights, actions). */
export const ANALYSIS_USD = 0.0006
export const RUN_EXTRA_USD = 0.01

export const PROMPT_MAX = 400
export const PROMPT_CAP = 50

export function planAiVisibility(input: { prompts: number; models: readonly AivModel[]; frequency?: AivFrequency }) {
  const answers = input.prompts * input.models.length
  const dfsUsd = input.prompts * input.models.reduce((s, m) => s + UNIT_USD[m], 0)
  const aiUsd = answers * ANALYSIS_USD + (answers ? RUN_EXTRA_USD : 0)
  const estimateUsd = Math.round((dfsUsd + aiUsd) * 1.1 * 10_000) / 10_000
  return {
    answers,
    dfsUsd,
    aiUsd,
    estimateUsd,
    perMonth: {
      weekly: estimateUsd * RUNS_PER_MONTH.weekly,
      twice_weekly: estimateUsd * RUNS_PER_MONTH.twice_weekly,
      daily: estimateUsd * RUNS_PER_MONTH.daily,
    },
    /** Queue platforms come back within 45 minutes; analysis takes a few more. */
    minutes: answers ? 60 : 0,
  }
}

export const TABS = ["overview", "prompts", "chats", "brands", "sources", "actions", "settings"] as const
export type AivTab = (typeof TABS)[number]
export const TAB_LABEL: Record<AivTab, string> = {
  overview: "Overview",
  prompts: "Questions",
  chats: "Answers",
  brands: "Brands",
  sources: "Sources",
  actions: "Actions",
  settings: "Settings",
}

/** Run stages, for the progress bar. */
export const STAGES = ["Planning", "Asking the AI platforms", "Collecting answers", "Reading the answers", "Sorting sources", "Insights and actions", "Done"] as const
