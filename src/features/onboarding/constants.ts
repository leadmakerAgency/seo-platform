import type { Database } from "@/lib/supabase/database.types"

type Enums = Database["public"]["Enums"]
export type OnboardingStatus = Enums["onboarding_status"]
export type StepStatus = Enums["onboarding_step_status"]
export type WebsitePlatform = Enums["website_platform"]
export type WebsiteManager = Enums["website_manager"]
export type WebsiteAccessStatus = Enums["website_access_status"]
export type GoogleAccessStatus = Enums["google_access_status"]

export type StepKey = "business" | "social" | "google" | "website" | "logins"

export type StepStatuses = { status: OnboardingStatus } & Record<StepKey, StepStatus>

export const STEPS: { key: StepKey; label: string; short: string; minutes: number }[] = [
  { key: "business", label: "Business details", short: "Business", minutes: 5 },
  { key: "social", label: "Google profile & social media", short: "Accounts", minutes: 4 },
  { key: "google", label: "Google reporting access", short: "Reporting", minutes: 3 },
  { key: "website", label: "Website", short: "Website", minutes: 2 },
  { key: "logins", label: "Other logins", short: "Logins", minutes: 2 },
]

export const STEP_STATUS_META: Record<StepStatus, { label: string; badge: string; dot: string }> = {
  todo: {
    label: "Not started",
    badge: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/40",
  },
  in_progress: { label: "In progress", badge: "bg-warning-soft text-warning", dot: "bg-warning" },
  done: { label: "Done", badge: "bg-success-soft text-success", dot: "bg-success" },
  skipped: {
    label: "Skipped",
    badge: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
}

export const ONBOARDING_STATUS_META: Record<OnboardingStatus, { label: string; badge: string }> = {
  not_started: { label: "Not started", badge: "bg-muted text-muted-foreground" },
  in_progress: { label: "In progress", badge: "bg-warning-soft text-warning" },
  submitted: { label: "Submitted, needs review", badge: "bg-brand-soft text-primary" },
  reviewed: { label: "Reviewed", badge: "bg-success-soft text-success" },
}

export const isFinished = (s: StepStatus) => s === "done" || s === "skipped"

export const WEBSITE_PLATFORMS: { value: WebsitePlatform; label: string }[] = [
  { value: "wordpress", label: "WordPress" },
  { value: "wix", label: "Wix" },
  { value: "squarespace", label: "Squarespace" },
  { value: "shopify", label: "Shopify" },
  { value: "webflow", label: "Webflow" },
  { value: "godaddy", label: "GoDaddy Website Builder" },
  { value: "other", label: "Something else" },
  { value: "unknown", label: "I'm not sure" },
  { value: "none", label: "We don't have a website" },
]

export const WEBSITE_MANAGERS: { value: WebsiteManager; label: string }[] = [
  { value: "self", label: "We do it ourselves" },
  { value: "developer", label: "A web developer or designer" },
  { value: "agency", label: "Another agency" },
  { value: "unknown", label: "Not sure" },
]

export const GOOGLE_ACCESS_OPTIONS: { value: GoogleAccessStatus; label: string }[] = [
  { value: "added", label: "I've added you" },
  { value: "not_using", label: "We don't have this" },
  { value: "no_access", label: "I don't have access to it" },
  { value: "help", label: "I need help" },
]

export const PREFERRED_CONTACT = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone call" },
  { value: "text", label: "Text message" },
  { value: "whatsapp", label: "WhatsApp" },
] as const

export const SUGGESTED_LOGIN_SITES = [
  "Yelp for Business",
  "Bing Places",
  "Apple Business Connect",
  "Angi",
  "BBB",
  "Nextdoor",
  "Thumbtack",
  "HomeAdvisor",
]

export const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const

export type DayKey = (typeof DAYS)[number]["key"]
export type Hours = Partial<Record<DayKey, { open: string; close: string }[]>>

/** Field groups the team can apply to the profile, in review order. */
export const APPLY_FIELDS = [
  { key: "business_name", label: "Business name" },
  { key: "legal_name", label: "Legal name" },
  { key: "phone", label: "Phone" },
  { key: "public_email", label: "Public email" },
  { key: "website", label: "Website" },
  { key: "address", label: "Address" },
  { key: "service_areas", label: "Service areas" },
  { key: "categories", label: "Categories" },
  { key: "services", label: "Services" },
  { key: "hours", label: "Opening hours" },
  { key: "about", label: "About (year, description)" },
  { key: "contact", label: "Main contact" },
] as const
export type ApplyField = (typeof APPLY_FIELDS)[number]["key"]
