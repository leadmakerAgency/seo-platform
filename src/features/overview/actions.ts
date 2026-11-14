"use server"

import { refresh } from "next/cache"

import { normalizeWebsite } from "@/features/clients/schemas"
import type { ActivityEntry } from "@/features/team/queries"
import type { ActionResult } from "@/features/tasks/schemas"
import {
  getCurrentMember,
  PermissionError,
  requirePermission,
  type CurrentMember,
} from "@/lib/auth"
import { agencyMonth, agencyToday, addMonths } from "@/lib/dates"
import type { Permission } from "@/lib/roles"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getClientActivity } from "./queries"
import type { DeliverableKind, PackageKind } from "./constants"
import {
  editClientSchema,
  fieldErrorsOf,
  logWorkSchema,
  type EditClientInput,
  type LogWorkInput,
} from "./schemas"

type Guard = { member: CurrentMember } | { error: string }

async function guard(permission: Permission): Promise<Guard> {
  try {
    return { member: await requirePermission(permission) }
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message }
    throw error
  }
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)

/** Database messages we wrote ourselves (P0001) are safe to show; anything else gets a fallback. */
function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  if (error?.code === "P0001" && error.message) return error.message
  if (error?.code === "42501") return "You can't do that for this client."
  return fallback
}

type FormResult = ActionResult & { fieldErrors?: Record<string, string> }

/** Work done outside the app (or a correction). Counts toward this or last month only. */
export async function logWork(input: LogWorkInput): Promise<FormResult> {
  const g = await guard("work.log")
  if ("error" in g) return { ok: false, error: g.error }

  const parsed = logWorkSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    }
  }
  const v = parsed.data
  const today = agencyToday()
  const earliest = addMonths(agencyMonth(), -1)
  if (v.deliveredOn > today) {
    return { ok: false, error: "Pick today or an earlier day.", fieldErrors: { deliveredOn: "Not in the future." } }
  }
  if (v.deliveredOn < earliest) {
    return {
      ok: false,
      error: "Work can only be logged for this month or last month.",
      fieldErrors: { deliveredOn: "This month or last month only." },
    }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from("work_items").insert({
    client_id: v.clientId,
    kind: v.kind as DeliverableKind,
    quantity: v.quantity,
    delivered_on: v.deliveredOn,
    title: v.title,
    url: v.url ?? null,
    note: v.note ?? null,
    source: "manual",
    created_by: g.member.id,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't log the work. Try again.") }
  refresh()
  return { ok: true }
}

/** Removes a manual entry (your own; admins and managers can remove any). */
export async function removeWork(id: string): Promise<ActionResult> {
  const g = await guard("work.log")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(id)) return { ok: false, error: "Unknown entry." }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from("work_items").delete().eq("id", id).select("id")
  if (error) return { ok: false, error: dbError(error, "Couldn't remove it. Try again.") }
  if (!data?.length) {
    return { ok: false, error: "Only the person who logged it, or an account manager, can remove it." }
  }
  refresh()
  return { ok: true }
}

/** Edit details: name, website, location, owner, stage, start date, package and monthly targets. */
export async function updateClientDetails(input: EditClientInput): Promise<FormResult> {
  const g = await guard("clients.update")
  if ("error" in g) return { ok: false, error: g.error }

  const parsed = editClientSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    }
  }
  const v = parsed.data
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("clients")
    .update({
      name: v.name,
      website: normalizeWebsite(v.website),
      city: v.city,
      region: v.region ?? null,
      country_code: v.country,
      industry: v.industry ?? null,
      owner_id: v.ownerId ?? null,
      stage: v.stage as "onboarding" | "active" | "paused" | "churned",
      started_on: v.startedOn,
      package: v.package as PackageKind,
      keywords_target: v.keywords,
      backlinks_target: v.backlinks,
      articles_target: v.articles,
      gbp_posts_target: v.gbpPosts,
      review_requests_target: v.reviewRequests,
      ai_fixes_target: v.aiFixes,
    })
    .eq("id", v.clientId)
    .select("id")
  if (error) return { ok: false, error: dbError(error, "Couldn't save the changes. Try again.") }
  if (!data?.length) return { ok: false, error: "You can't edit this client." }
  refresh()
  return { ok: true }
}

/** The next page of history for "Show more". */
export async function loadMoreActivity(
  clientId: string,
  clientName: string,
  before: number,
): Promise<ActionResult<{ entries: ActivityEntry[]; hasMore: boolean }>> {
  // Any signed-in team member; client_activity() only returns clients they can see.
  await getCurrentMember()
  if (!isUuid(clientId) || !Number.isInteger(before)) return { ok: false, error: "Unknown client." }
  try {
    return { ok: true, data: await getClientActivity(clientId, clientName.slice(0, 120), before) }
  } catch {
    return { ok: false, error: "Couldn't load more. Try again." }
  }
}
