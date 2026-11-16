"use server"

import { refresh } from "next/cache"

import { newToken } from "@/features/onboarding/token"
import { PermissionError, requirePermission } from "@/lib/auth"
import { normalizeHost } from "@/lib/dataforseo/domains"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  looksLikeWebsite,
  newClientSchema,
  normalizeWebsite,
  slugify,
  type NewClientField,
  type NewClientInput,
  type NewClientResult,
} from "./schemas"

/**
 * Creates a client from the Add client page: the client, the team-approved business
 * profile, the onboarding row, optionally the onboarding link and the history line, all in
 * one database transaction (public.create_client). Admins and managers only, checked here
 * and again in the database.
 */
export async function createClient(input: NewClientInput): Promise<NewClientResult> {
  try {
    await requirePermission("clients.create")
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: error.message }
    throw error
  }

  const parsed = newClientSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Partial<Record<NewClientField, string>> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]) as NewClientField
      fieldErrors[key] ??= issue.message
    }
    return { ok: false, error: "Check the highlighted fields.", fieldErrors }
  }
  const v = parsed.data
  const website = v.noWebsite ? null : normalizeWebsite(v.website)

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("create_client", {
    p_slug: slugify(v.name),
    p_link_token: v.createLink ? newToken() : undefined,
    p: {
      name: v.name,
      website,
      industry: v.industry,
      phone: v.phone,
      public_email: v.publicEmail,
      country_code: v.country,
      street: v.street,
      city: v.city,
      region: v.region,
      postal_code: v.postalCode,
      service_area_business: v.serviceAreaBusiness,
      service_areas: v.serviceAreas,
      services: v.services,
      other_categories: v.otherCategories,
      year_founded: v.yearFounded,
      description: v.description,
      contact_name: v.contactName,
      contact_role: v.contactRole,
      contact_email: v.contactEmail,
      contact_phone: v.contactPhone,
      preferred_contact: v.preferredContact,
      package: v.package,
      started_on: v.startedOn,
      owner_id: v.ownerId,
      keywords_target: v.keywords,
      backlinks_target: v.backlinks,
      articles_target: v.articles,
      gbp_posts_target: v.gbpPosts,
      review_requests_target: v.reviewRequests,
      ai_fixes_target: v.aiFixes,
    },
  })

  if (error) {
    if ((error.code === "P0001" || error.code === "42501") && error.message) {
      return { ok: false, error: error.message }
    }
    if (error.code === "23514") return { ok: false, error: "One of the fields is too long or not valid. Check them and try again." }
    console.error("[clients] create_client failed", error)
    return { ok: false, error: "Couldn't save the client. Try again." }
  }

  const r = data as { id: string; slug: string }
  refresh()
  return { ok: true, slug: r.slug, name: v.name, withLink: v.createLink, contactName: v.contactName }
}

/** Is this website already a client? (A warning on the Add client page, not a block.) */
export async function findClientByWebsite(
  website: string,
): Promise<{ name: string; slug: string } | null> {
  try {
    await requirePermission("clients.create")
  } catch {
    return null
  }
  if (!looksLikeWebsite(website)) return null
  const host = normalizeHost(normalizeWebsite(website))
  if (!host) return null
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("clients")
    .select("name, slug, website")
    .ilike("website", `%${host.replace(/[%_]/g, "")}%`)
    .limit(10)
  const hit = (data ?? []).find((c) => normalizeHost(c.website) === host)
  return hit ? { name: hit.name, slug: hit.slug } : null
}
