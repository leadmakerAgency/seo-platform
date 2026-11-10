import "server-only"

import { cache } from "react"

import { formatLocation } from "@/lib/format"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/** One client by its URL slug, or null if it doesn't exist / isn't visible. */
export const getClientBySlug = cache(async (slug: string) => {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("clients")
    .select("id, slug, name, city, region, country_code, health, stage")
    .eq("slug", slug)
    .maybeSingle()
  if (!data) return null
  return { ...data, location: formatLocation(data.city, data.region, data.country_code) }
})

/** Active team members, for owner pickers. */
export const getTeamMembers = cache(async () => {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("team_members")
    .select("id, full_name, email, role")
    .eq("status", "active")
    .order("full_name")
  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.full_name || m.email.split("@")[0],
    role: m.role,
  }))
})
