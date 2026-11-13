"use server"

import { randomInt } from "node:crypto"
import { refresh } from "next/cache"

import type { ActionResult } from "@/features/tasks/schemas"
import { PermissionError, requirePermission, type CurrentMember } from "@/lib/auth"
import type { Permission } from "@/lib/roles"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { APPLY_FIELDS } from "./constants"
import { fieldErrorsOf, loginSchema, type LoginInput } from "./schemas"

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
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

/** 22 base62 characters from the OS random source (~131 bits; unbiased). */
function newToken() {
  let out = ""
  for (let i = 0; i < 22; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  if (
    (error?.code === "P0001" || error?.code === "42501") &&
    error.message &&
    !error.message.includes("row-level")
  ) {
    return error.message
  }
  return fallback
}

/**
 * A new onboarding link. Any previous active link stops working at the same moment.
 * `reopen` also unlocks a reviewed onboarding, so the client can change their answers.
 */
export async function createOnboardingLink(
  clientId: string,
  options: { reopen?: boolean } = {},
): Promise<ActionResult> {
  const g = await guard("onboarding.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }

  const supabase = await createSupabaseServerClient()
  const { error: revokeError } = await supabase
    .from("onboarding_links")
    .update({ status: "revoked" })
    .eq("client_id", clientId)
    .eq("status", "active")
  if (revokeError) return { ok: false, error: "Couldn't turn off the old link. Try again." }

  for (let i = 0; i < 2; i++) {
    const { error } = await supabase
      .from("onboarding_links")
      .insert({ client_id: clientId, token: newToken(), created_by: g.member.id })
    if (!error) {
      if (options.reopen === true) {
        const { error: reopenError } = await supabase.rpc("onboarding_reopen", {
          p_client_id: clientId,
        })
        if (reopenError) {
          refresh()
          return {
            ok: false,
            error:
              "The link was created, but the answers are still locked. Use “Let the client edit again”.",
          }
        }
      }
      refresh()
      return { ok: true }
    }
    if (error.code !== "23505") return { ok: false, error: "Couldn't create the link. Try again." }
  }
  return { ok: false, error: "Couldn't create the link. Try again." }
}

export async function extendOnboardingLink(linkId: string): Promise<ActionResult> {
  const g = await guard("onboarding.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(linkId)) return { ok: false, error: "Unknown link." }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("onboarding_links")
    .update({ expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() })
    .eq("id", linkId)
    .eq("status", "active")
    .select("id")
  if (error || !data?.length)
    return { ok: false, error: "That link isn't active any more. Create a new one." }
  refresh()
  return { ok: true }
}

export async function revokeOnboardingLink(linkId: string): Promise<ActionResult> {
  const g = await guard("onboarding.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(linkId)) return { ok: false, error: "Unknown link." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("onboarding_links")
    .update({ status: "revoked" })
    .eq("id", linkId)
  if (error) return { ok: false, error: "Couldn't turn the link off. Try again." }
  refresh()
  return { ok: true }
}

const APPLY_KEYS = new Set<string>(APPLY_FIELDS.map((f) => f.key))

export async function applyOnboardingProfile(
  clientId: string,
  fields: string[],
): Promise<ActionResult> {
  const g = await guard("onboarding.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const chosen = fields.filter((f) => APPLY_KEYS.has(f))
  if (chosen.length === 0) return { ok: false, error: "Tick at least one field to apply." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("apply_onboarding_profile", {
    p_client_id: clientId,
    p_fields: chosen,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't apply the details. Try again.") }
  refresh()
  return { ok: true }
}

export async function markGoogleVerified(
  clientId: string,
  which: "sc" | "ga4",
  verified: boolean,
): Promise<ActionResult> {
  const g = await guard("onboarding.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(clientId) || (which !== "sc" && which !== "ga4"))
    return { ok: false, error: "Unknown property." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("onboarding_mark_verified", {
    p_client_id: clientId,
    p_which: which,
    p_verified: verified,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save that. Try again.") }
  refresh()
  return { ok: true }
}

export async function markOnboardingReviewed(
  clientId: string,
  activate: boolean,
): Promise<ActionResult> {
  const g = await guard("onboarding.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("onboarding_mark_reviewed", {
    p_client_id: clientId,
    p_activate: activate,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't mark it reviewed. Try again.") }
  refresh()
  return { ok: true }
}

export async function reopenOnboarding(clientId: string): Promise<ActionResult> {
  const g = await guard("onboarding.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("onboarding_reopen", { p_client_id: clientId })
  if (error) return { ok: false, error: dbError(error, "Couldn't reopen it. Try again.") }
  refresh()
  return { ok: true }
}

/** Returns a stored password. The database checks the role and logs the view. */
export async function revealLogin(loginId: string): Promise<ActionResult<{ password: string }>> {
  const g = await guard("vault.reveal")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(loginId)) return { ok: false, error: "Unknown login." }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("reveal_client_login", { p_login_id: loginId })
  if (error || typeof data !== "string")
    return { ok: false, error: dbError(error, "Couldn't open that login.") }
  refresh()
  return { ok: true, data: { password: data } }
}

export async function addTeamLogin(clientId: string, input: LoginInput): Promise<ActionResult> {
  const g = await guard("onboarding.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted field.",
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    }
  }
  const v = parsed.data
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("add_client_login", {
    p_client_id: clientId,
    p_site_name: v.site_name,
    p_site_url: v.site_url ?? "",
    p_username: v.username,
    p_password: v.password,
    p_has_2fa: v.has_2fa,
    p_notes: v.notes ?? "",
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the login. Try again.") }
  refresh()
  return { ok: true }
}

export async function removeTeamLogin(loginId: string): Promise<ActionResult> {
  const g = await guard("onboarding.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(loginId)) return { ok: false, error: "Unknown login." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("remove_client_login", { p_login_id: loginId })
  if (error) return { ok: false, error: dbError(error, "Couldn't remove the login. Try again.") }
  refresh()
  return { ok: true }
}
