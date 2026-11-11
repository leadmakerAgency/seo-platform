"use server"

import { refresh } from "next/cache"

import { createSupabasePublicClient } from "@/lib/supabase/public"
import type { RequestStatus } from "./constants"
import {
  portalAttachSchema,
  portalRespondSchema,
  portalTokenSchema,
  type ActionResult,
  type PortalRespondInput,
} from "./schemas"

/**
 * The client's side. No session: every call goes to a portal_* database
 * function that checks the private link's token before touching anything.
 */

/** Our portal functions raise plain sentences for the client; pass those through. */
function portalError(error: { message?: string; code?: string } | null) {
  if ((error?.code === "P0001" || error?.code === "42501") && error.message) return error.message
  return "Something went wrong on our side. Try again in a minute."
}

export async function respondOnPortal(
  input: PortalRespondInput,
): Promise<ActionResult<{ status: RequestStatus }>> {
  const parsed = portalRespondSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const v = parsed.data

  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase.rpc("portal_respond", {
    p_token: v.token,
    p_request_id: v.requestId,
    p_text: v.text,
    // The generated type says non-null, but the function takes null for "no decision".
    p_decision: v.decision as "approved",
    p_name: v.name,
  })
  if (error || !data) return { ok: false, error: portalError(error) }

  refresh()
  return { ok: true, data: { status: data } }
}

/** Registers a file the browser just uploaded to storage. */
export async function attachPortalFile(input: {
  token: string
  requestId: string
  path: string
  name: string
  mime: string
  size: number
}): Promise<ActionResult<{ id: string }>> {
  const parsed = portalAttachSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "That upload didn't work. Try again." }
  const v = parsed.data

  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase.rpc("portal_attach_file", {
    p_token: v.token,
    p_request_id: v.requestId,
    p_path: v.path,
    p_name: v.name,
    p_mime: v.mime,
    p_size: v.size,
  })
  if (error || !data) return { ok: false, error: portalError(error) }

  refresh()
  return { ok: true, data: { id: data } }
}

export async function removePortalFile(token: string, fileId: string): Promise<ActionResult> {
  if (!portalTokenSchema.safeParse(token).success || !/^[0-9a-f-]{36}$/i.test(fileId)) {
    return { ok: false, error: "That file can't be removed." }
  }
  const supabase = createSupabasePublicClient()
  const { error } = await supabase.rpc("portal_remove_file", {
    p_token: token,
    p_file_id: fileId,
  })
  if (error) return { ok: false, error: portalError(error) }

  refresh()
  return { ok: true }
}
