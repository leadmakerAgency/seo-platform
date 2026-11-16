"use server"

import { after } from "next/server"
import { refresh } from "next/cache"

import type { ActionResult } from "@/features/tasks/schemas"
import { PermissionError, requirePermission } from "@/lib/auth"
import type { Db } from "@/lib/dataforseo/client"
import { hasDataForSeo } from "@/lib/env.server"
import type { Permission } from "@/lib/roles"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { DIRECTORY_TYPES, REJECT_REASONS, type DirectoryType, type RejectReason } from "./constants"
import { processBacklinkRuns } from "./discovery"
import { runStrengthCheck } from "./strength"

/**
 * Backlinks actions. Each checks its permission here; the database functions check the role
 * and the client again (security definer + private.require_backlinks_worker / _manager).
 * Spending is decided in the database (budgets, limits), never here.
 */

async function guard(permission: Permission): Promise<string | null> {
  try {
    await requirePermission(permission)
    return null
  } catch (error) {
    if (error instanceof PermissionError) return error.message
    throw error
  }
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)
const NOT_CONNECTED = "DataForSEO isn't connected yet. An admin adds the login on the server."

function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  if (["P0001", "P0002", "42501", "22023"].includes(error?.code ?? "") && error?.message)
    return error.message
  return fallback
}

export async function findPlaces(clientId: string): Promise<ActionResult> {
  const denied = await guard("backlinks.discover")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (!hasDataForSeo() || !hasSupabaseSecretKey()) return { ok: false, error: NOT_CONNECTED }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("request_backlink_discovery", { p_client_id: clientId })
  if (error) return { ok: false, error: dbError(error, "Couldn't start the search. Try again.") }
  after(async () => {
    try {
      await processBacklinkRuns(createSupabaseAdminClient() as Db, 1)
    } catch (e) {
      console.error("[backlinks] search could not start", e)
    }
  })
  refresh()
  return { ok: true }
}

export async function reviewPlaces(
  ids: string[],
  decision: "approve" | "reject" | "restore",
  reason?: RejectReason | null,
  note?: string | null,
): Promise<ActionResult<{ changed: number }>> {
  const denied = await guard("backlinks.review")
  if (denied) return { ok: false, error: denied }
  const clean = [...new Set(ids)].filter(isUuid)
  if (clean.length === 0) return { ok: false, error: "Pick at least one place." }
  if (!["approve", "reject", "restore"].includes(decision))
    return { ok: false, error: "Unknown decision." }
  if (decision === "reject" && (!reason || !REJECT_REASONS.includes(reason))) {
    return { ok: false, error: "Pick a reason for rejecting." }
  }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("review_backlink_opportunities", {
    p_ids: clean,
    p_decision: decision,
    p_reason: decision === "reject" ? reason! : undefined,
    p_note: note?.trim() ? note.trim().slice(0, 500) : undefined,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save. Try again.") }
  refresh()
  return { ok: true, data: { changed: Number(data ?? 0) } }
}

export async function checkSiteStrength(
  clientId: string,
  ids: string[] | null,
  force = false,
): Promise<ActionResult<{ checked: number; cost: number }>> {
  const denied = await guard("backlinks.strength")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (!hasDataForSeo() || !hasSupabaseSecretKey()) return { ok: false, error: NOT_CONNECTED }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("request_strength_check", {
    p_client_id: clientId,
    p_ids: ids?.filter(isUuid).length ? ids.filter(isUuid) : undefined,
    p_force: force,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't start the check. Try again.") }
  const req = data as { check_id: string | null; targets: string[] } | null
  if (!req?.check_id || !req.targets.length) return { ok: true, data: { checked: 0, cost: 0 } }
  try {
    const res = await runStrengthCheck(createSupabaseAdminClient() as Db, {
      id: req.check_id,
      clientId,
      targets: req.targets,
    })
    refresh()
    return { ok: true, data: { checked: res.checked, cost: res.cost } }
  } catch (e) {
    refresh()
    return {
      ok: false,
      error: e instanceof Error ? e.message : "DataForSEO didn't answer. Try again.",
    }
  }
}

export async function updateDirectory(input: {
  id: string
  type: DirectoryType
  submitUrl: string | null
  costType: "free" | "paid" | "unknown"
  notes: string | null
}): Promise<ActionResult> {
  const denied = await guard("backlinks.library")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(input.id) || !DIRECTORY_TYPES.includes(input.type))
    return { ok: false, error: "Unknown site." }
  const url = input.submitUrl?.trim() || null
  if (url && !/^https?:\/\/\S+$/i.test(url))
    return { ok: false, error: "The sign-up link must start with https://." }
  if ((input.notes?.length ?? 0) > 2000)
    return { ok: false, error: "Keep the notes under 2,000 characters." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("set_directory", {
    p_id: input.id,
    p_type: input.type,
    p_submit_url: url ?? "",
    p_cost_type: input.costType,
    p_notes: input.notes ?? "",
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the site. Try again.") }
  refresh()
  return { ok: true }
}

export async function setDirectoryBlocked(
  id: string,
  blocked: boolean,
  reason?: string,
): Promise<ActionResult> {
  const denied = await guard("backlinks.library")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(id)) return { ok: false, error: "Unknown site." }
  const supabase = await createSupabaseServerClient()
  const { error } = blocked
    ? await supabase.rpc("block_directory", {
        p_id: id,
        p_reason: (reason ?? "").trim().slice(0, 300),
      })
    : await supabase.rpc("unblock_directory", { p_id: id })
  if (error) return { ok: false, error: dbError(error, "Couldn't change the site. Try again.") }
  refresh()
  return { ok: true }
}
