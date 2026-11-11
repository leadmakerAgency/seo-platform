"use server"

import { randomBytes } from "node:crypto"
import { refresh } from "next/cache"

import { PermissionError, requirePermission, type CurrentMember } from "@/lib/auth"
import type { Permission } from "@/lib/roles"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/database.types"
import {
  askAgainSchema,
  buildOptions,
  canAutoComplete,
  requestFormSchema,
  type ActionResult,
  type RequestFormInput,
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

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) out[String(issue.path[0] ?? "form")] ??= issue.message
  return out
}

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v)
const NOT_ALLOWED = "You can't change this request. Ask its owner or an account manager."

/** The task must include the client, or the link makes no sense. */
async function checkTaskLink(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  taskId: string | null,
  clientId: string,
) {
  if (!taskId) return null
  const { data } = await supabase
    .from("task_clients")
    .select("task_id")
    .eq("task_id", taskId)
    .eq("client_id", clientId)
    .maybeSingle()
  return data ? null : "That task doesn't include this client."
}

export async function createRequest(
  input: RequestFormInput,
): Promise<ActionResult<{ number: number }>> {
  const g = await guard("requests.create")
  if ("error" in g) return { ok: false, error: g.error }

  const parsed = requestFormSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    }
  }
  const v = parsed.data
  const supabase = await createSupabaseServerClient()

  const linkError = await checkTaskLink(supabase, v.taskId, v.clientId)
  if (linkError) return { ok: false, error: linkError, fieldErrors: { taskId: linkError } }

  const { data, error } = await supabase
    .from("client_requests")
    .insert({
      client_id: v.clientId,
      task_id: v.taskId,
      kind: v.kind,
      title: v.title,
      instructions: v.instructions,
      internal_note: v.internalNote,
      options: buildOptions(v) as Json,
      auto_complete: canAutoComplete(v.kind) && v.autoComplete,
      due_on: v.dueOn,
      owner_id: v.ownerId ?? g.member.id,
      created_by: g.member.id,
    })
    .select("number")
    .single()
  if (error) {
    return {
      ok: false,
      error:
        error.code === "42501"
          ? "You can only ask clients that are in your tasks."
          : "Couldn't create the request. Try again.",
    }
  }

  refresh()
  return { ok: true, data: { number: data.number } }
}

export async function updateRequest(
  requestId: string,
  input: RequestFormInput,
): Promise<ActionResult<{ number: number }>> {
  const g = await guard("requests.create")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(requestId)) return { ok: false, error: "Unknown request." }

  const parsed = requestFormSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    }
  }
  const v = parsed.data
  const supabase = await createSupabaseServerClient()

  const linkError = await checkTaskLink(supabase, v.taskId, v.clientId)
  if (linkError) return { ok: false, error: linkError, fieldErrors: { taskId: linkError } }

  // Only while the client hasn't answered yet; the client can't move clients.
  const { data, error } = await supabase
    .from("client_requests")
    .update({
      task_id: v.taskId,
      kind: v.kind,
      title: v.title,
      instructions: v.instructions,
      internal_note: v.internalNote,
      options: buildOptions(v) as Json,
      auto_complete: canAutoComplete(v.kind) && v.autoComplete,
      due_on: v.dueOn,
      owner_id: v.ownerId,
    })
    .eq("id", requestId)
    .eq("client_id", v.clientId)
    .eq("status", "open")
    .select("number")
  if (error) return { ok: false, error: "Couldn't save the request. Try again." }
  if (!data?.length) {
    return { ok: false, error: "Only requests still waiting on the client can be edited." }
  }

  refresh()
  return { ok: true, data: { number: data[0].number } }
}

/** Saves just the internal note (team only), at any status. */
export async function saveInternalNote(requestId: string, note: string): Promise<ActionResult> {
  const g = await guard("requests.create")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(requestId)) return { ok: false, error: "Unknown request." }
  const trimmed = note.trim()
  if (trimmed.length > 2000) return { ok: false, error: "Use 2,000 characters or fewer." }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("client_requests")
    .update({ internal_note: trimmed || null })
    .eq("id", requestId)
    .select("id")
  if (error) return { ok: false, error: "Couldn't save the note. Try again." }
  if (!data?.length) return { ok: false, error: NOT_ALLOWED }

  refresh()
  return { ok: true }
}

/** Mark done (accept the answer) or cancel (no longer needed). */
export async function setRequestStatus(
  requestId: string,
  status: "done" | "cancelled",
): Promise<ActionResult> {
  const g = await guard("requests.create")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(requestId)) return { ok: false, error: "Unknown request." }
  if (status !== "done" && status !== "cancelled") return { ok: false, error: "Unknown status." }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("client_requests")
    .update({ status })
    .eq("id", requestId)
    .in("status", ["open", "answered"])
    .select("id")
  if (error) return { ok: false, error: "Couldn't update the request. Try again." }
  if (!data?.length) return { ok: false, error: NOT_ALLOWED }

  refresh()
  return { ok: true }
}

/** Send it back to the client with a note they see ("The code expired, please send the new one"). */
export async function askAgain(requestId: string, note: string): Promise<ActionResult> {
  const g = await guard("requests.create")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(requestId)) return { ok: false, error: "Unknown request." }
  const parsed = askAgainSchema.safeParse(note)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0].message,
      fieldErrors: { note: parsed.error.issues[0].message },
    }
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("client_requests")
    .update({
      status: "open",
      ask_again_note: parsed.data,
      response_text: null,
      decision: null,
      responded_at: null,
      responder_name: null,
    })
    .eq("id", requestId)
    .in("status", ["answered", "done"])
    .select("id")
  if (error) return { ok: false, error: "Couldn't send it back. Try again." }
  if (!data?.length) return { ok: false, error: NOT_ALLOWED }

  refresh()
  return { ok: true }
}

/** Turns the client's link on, or replaces it (the old link stops working at once). */
export async function createPortalLink(clientId: string): Promise<ActionResult> {
  const g = await guard("requests.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from("client_portal_links").upsert(
    {
      client_id: clientId,
      token: randomBytes(32).toString("base64url"),
      created_by: g.member.id,
      created_at: new Date().toISOString(),
      last_opened_at: null,
    },
    { onConflict: "client_id" },
  )
  if (error) return { ok: false, error: "Couldn't create the link. Try again." }

  refresh()
  return { ok: true }
}
