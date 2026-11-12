import "server-only"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { SocialAccountStatus, SocialPlatform } from "@/features/connections/constants"
import type { Tables } from "@/lib/supabase/database.types"

const nameOf = (m: { full_name: string; email: string } | null) =>
  m ? m.full_name || m.email.split("@")[0] : null

export type OnboardingLink = {
  id: string
  token: string
  status: Tables<"onboarding_links">["status"]
  expiresAt: string
  createdAt: string
  createdBy: string | null
  firstOpenedAt: string | null
  lastOpenedAt: string | null
}

export type StoredLogin = {
  id: string
  siteName: string
  siteUrl: string | null
  username: string
  has2fa: boolean
  notes: string | null
  source: Tables<"client_logins">["source"]
  createdAt: string
  lastViewedAt: string | null
  lastViewedBy: string | null
}

export type OnboardingOverview = {
  link: OnboardingLink | null
  progress: Tables<"client_onboarding"> | null
  submitted: Tables<"onboarding_business_details"> | null
  profile: Tables<"client_business_profiles"> | null
  client: Pick<
    Tables<"clients">,
    "name" | "website" | "city" | "region" | "country_code" | "industry" | "stage"
  >
  google: Tables<"onboarding_google_access"> | null
  website: Tables<"onboarding_website"> | null
  accounts: { platform: SocialPlatform; name: string; status: SocialAccountStatus }[]
  notUsing: SocialPlatform[]
  logins: StoredLogin[]
  history: {
    id: number
    action: string
    meta: Record<string, unknown>
    createdAt: string
    actorName: string | null
  }[]
}

/** Everything the client's Onboarding page shows (RLS decides what each role can read). */
export async function getOnboardingOverview(clientId: string): Promise<OnboardingOverview> {
  const supabase = await createSupabaseServerClient()
  const [
    link,
    progress,
    submitted,
    profile,
    client,
    google,
    website,
    accounts,
    notUsing,
    logins,
    history,
  ] = await Promise.all([
    supabase
      .from("onboarding_links")
      .select(
        "id, token, status, expires_at, created_at, first_opened_at, last_opened_at, creator:team_members!onboarding_links_created_by_fkey(full_name, email)",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("client_onboarding").select("*").eq("client_id", clientId).maybeSingle(),
    supabase
      .from("onboarding_business_details")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase.from("client_business_profiles").select("*").eq("client_id", clientId).maybeSingle(),
    supabase
      .from("clients")
      .select("name, website, city, region, country_code, industry, stage")
      .eq("id", clientId)
      .single(),
    supabase.from("onboarding_google_access").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("onboarding_website").select("*").eq("client_id", clientId).maybeSingle(),
    supabase
      .from("social_accounts")
      .select("platform, display_name, location_name, username, status")
      .eq("client_id", clientId)
      .neq("status", "removed"),
    supabase.from("onboarding_social_choices").select("platform").eq("client_id", clientId),
    supabase
      .from("client_logins")
      .select(
        "id, site_name, site_url, username, has_2fa, notes, source, created_at, last_viewed_at, viewer:team_members!client_logins_last_viewed_by_fkey(full_name, email)",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: true }),
    supabase
      .from("activity_log")
      .select(
        "id, action, meta, created_at, actor:team_members!activity_log_actor_id_fkey(full_name, email)",
      )
      .eq("client_id", clientId)
      .or("action.like.onboarding.%,action.like.vault.%")
      .order("created_at", { ascending: false })
      .limit(40),
  ])
  if (client.error) throw new Error(`Could not load the client: ${client.error.message}`)

  return {
    link: link.data
      ? {
          id: link.data.id,
          token: link.data.token,
          status: link.data.status,
          expiresAt: link.data.expires_at,
          createdAt: link.data.created_at,
          createdBy: nameOf(link.data.creator),
          firstOpenedAt: link.data.first_opened_at,
          lastOpenedAt: link.data.last_opened_at,
        }
      : null,
    progress: progress.data,
    submitted: submitted.data,
    profile: profile.data,
    client: client.data,
    google: google.data,
    website: website.data,
    accounts: (accounts.data ?? []).map((a) => ({
      platform: a.platform,
      name: a.location_name || a.display_name || a.username || "Connected",
      status: a.status,
    })),
    notUsing: (notUsing.data ?? []).map((n) => n.platform),
    logins: (logins.data ?? []).map((l) => ({
      id: l.id,
      siteName: l.site_name,
      siteUrl: l.site_url,
      username: l.username,
      has2fa: l.has_2fa,
      notes: l.notes,
      source: l.source,
      createdAt: l.created_at,
      lastViewedAt: l.last_viewed_at,
      lastViewedBy: nameOf(l.viewer),
    })),
    history: (history.data ?? []).map((h) => ({
      id: h.id,
      action: h.action,
      meta: (h.meta ?? {}) as Record<string, unknown>,
      createdAt: h.created_at,
      actorName: nameOf(h.actor),
    })),
  }
}
