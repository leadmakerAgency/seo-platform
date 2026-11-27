import "server-only"

import { createSupabasePublicClient } from "@/lib/supabase/public"
import type { SocialAccountStatus, SocialPlatform } from "@/features/connections/constants"
import type {
  GoogleAccessStatus,
  Hours,
  OnboardingStatus,
  StepStatus,
  WebsiteAccessStatus,
  WebsiteManager,
  WebsitePlatform,
} from "./constants"
import { tokenFromLink } from "./schemas"

export type OnboardingBusiness = {
  business_name: string | null
  legal_name: string | null
  phone: string | null
  public_email: string | null
  website: string | null
  street: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country_code: string | null
  service_area_business: boolean
  service_areas: string[]
  primary_category: string | null
  other_categories: string[]
  services: string[]
  hours: Hours | null
  year_founded: number | null
  description: string | null
  contact_name: string | null
  contact_role: string | null
  contact_email: string | null
  contact_phone: string | null
  preferred_contact: string | null
  notes: string | null
}

export type OnboardingData = {
  token: string
  client: { name: string; slug: string }
  contact: string | null
  expiresAt: string
  onboarding: {
    status: OnboardingStatus
    business: StepStatus
    social: StepStatus
    google: StepStatus
    website: StepStatus
    logins: StepStatus
    logins_skipped: boolean
    submitted_at: string | null
  }
  business: OnboardingBusiness | null
  /** The client hasn't saved business details yet; `business` is what the team filled in. */
  businessFromProfile: boolean
  google: {
    sc_status: GoogleAccessStatus
    sc_property: string | null
    ga4_status: GoogleAccessStatus
    ga4_property: string | null
    notes: string | null
  } | null
  website: {
    platform: WebsitePlatform | null
    url: string | null
    managed_by: WebsiteManager | null
    developer_name: string | null
    developer_email: string | null
    access_status: WebsiteAccessStatus
    notes: string | null
  } | null
  accounts: { platform: SocialPlatform; name: string | null; status: SocialAccountStatus }[]
  /** The Git site connected from this link or by the team (no secrets). */
  git: { repo: string; status: "connected" | "needs_attention"; authMethod: "github_app" | "token"; error: string | null } | null
  notUsing: SocialPlatform[]
  logins: {
    id: string
    site_name: string
    site_url: string | null
    username: string
    has_2fa: boolean
  }[]
}

type Raw = Omit<OnboardingData, "token" | "expiresAt" | "notUsing" | "businessFromProfile" | "git"> & {
  expires_at: string
  not_using: SocialPlatform[]
  business_from_profile?: boolean
}

/**
 * Everything the wizard shows for one link. The token is checked inside
 * onboarding_get, which only ever returns that client's answers (never
 * passwords, internal fields or team emails). Null for a bad or inactive link.
 */
export async function getOnboarding(link: string): Promise<OnboardingData | null> {
  const token = tokenFromLink(link)
  if (!token) return null
  const db = createSupabasePublicClient()
  const [{ data, error }, git] = await Promise.all([
    db.rpc("onboarding_get", { p_token: token }),
    db.rpc("onboarding_git_status", { p_token: token }),
  ])
  if (error || !data) return null
  const raw = data as unknown as Raw
  const g = (git.data ?? {}) as { repo?: string; status?: string; auth_method?: string; error?: string | null }
  return {
    token,
    client: raw.client,
    contact: raw.contact,
    expiresAt: raw.expires_at,
    onboarding: raw.onboarding,
    business: raw.business,
    businessFromProfile: Boolean(raw.business_from_profile),
    google: raw.google,
    website: raw.website,
    accounts: raw.accounts ?? [],
    git: g.repo
      ? {
          repo: g.repo,
          status: g.status === "connected" ? "connected" : "needs_attention",
          authMethod: g.auth_method === "token" ? "token" : "github_app",
          error: g.error ?? null,
        }
      : null,
    notUsing: raw.not_using ?? [],
    logins: raw.logins ?? [],
  }
}
