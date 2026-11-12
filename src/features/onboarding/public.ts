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
  notUsing: SocialPlatform[]
  logins: {
    id: string
    site_name: string
    site_url: string | null
    username: string
    has_2fa: boolean
  }[]
}

type Raw = Omit<OnboardingData, "token" | "expiresAt" | "notUsing"> & {
  expires_at: string
  not_using: SocialPlatform[]
}

/**
 * Everything the wizard shows for one link. The token is checked inside
 * onboarding_get, which only ever returns that client's answers (never
 * passwords, internal fields or team emails). Null for a bad or inactive link.
 */
export async function getOnboarding(link: string): Promise<OnboardingData | null> {
  const token = tokenFromLink(link)
  if (!token) return null
  const { data, error } = await createSupabasePublicClient().rpc("onboarding_get", {
    p_token: token,
  })
  if (error || !data) return null
  const raw = data as unknown as Raw
  return {
    token,
    client: raw.client,
    contact: raw.contact,
    expiresAt: raw.expires_at,
    onboarding: raw.onboarding,
    business: raw.business,
    google: raw.google,
    website: raw.website,
    accounts: raw.accounts ?? [],
    notUsing: raw.not_using ?? [],
    logins: raw.logins ?? [],
  }
}
