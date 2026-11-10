"use server"

import { refresh } from "next/cache"

import { PermissionError, requirePermission } from "@/lib/auth"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  addClientSchema,
  normalizeWebsite,
  slugify,
  type AddClientInput,
  type AddClientResult,
} from "./schemas"

/** Creates a client. Admins and managers only (checked here and by RLS). */
export async function addClient(input: AddClientInput): Promise<AddClientResult> {
  let member
  try {
    member = await requirePermission("clients.create")
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: error.message }
    throw error
  }

  const parsed = addClientSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0])
      fieldErrors[key] ??= issue.message
    }
    return { ok: false, error: "Check the highlighted fields.", fieldErrors }
  }

  const values = parsed.data
  const supabase = await createSupabaseServerClient()
  const baseSlug = slugify(values.name)

  // Find a free slug: king-air, king-air-2, king-air-3…
  const { data: taken } = await supabase.from("clients").select("slug").like("slug", `${baseSlug}%`)
  const takenSet = new Set((taken ?? []).map((r) => r.slug))
  let slug = baseSlug
  for (let n = 2; takenSet.has(slug); n++) slug = `${baseSlug}-${n}`

  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      name: values.name,
      slug,
      website: normalizeWebsite(values.website),
      city: values.city,
      region: values.region ?? null,
      country_code: values.country,
      industry: values.industry ?? null,
      owner_id: values.ownerId ?? null,
      keywords_target: values.keywords,
      backlinks_target: values.backlinks,
      articles_target: values.articles,
      created_by: member.id,
    })
    .select("id, slug, name")
    .single()

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A client with this name was just added. Try again." }
    }
    return { ok: false, error: "Couldn't save the client. Try again." }
  }

  await supabase.from("activity_log").insert({
    actor_id: member.id,
    client_id: client.id,
    action: "client.created",
    meta: { name: client.name },
  })

  refresh()
  return { ok: true, slug: client.slug, name: client.name }
}
