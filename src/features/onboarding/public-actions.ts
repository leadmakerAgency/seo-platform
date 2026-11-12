"use server"

import { createHash, randomBytes } from "node:crypto"

import { isSocialPlatform } from "@/features/connections/constants"
import { ensureZernioProfile } from "@/features/connections/profile"
import type { Db } from "@/features/connections/sync"
import type { ActionResult } from "@/features/tasks/schemas"
import { hasZernioApiKey, onboardingDoneUrl } from "@/lib/env.server"
import { requestOrigin } from "@/lib/origin"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/database.types"
import { createSupabasePublicClient } from "@/lib/supabase/public"
import { getConnectUrl, ZernioError } from "@/lib/zernio/client"
import type { StepStatuses } from "./constants"
import {
  businessPatchSchema,
  fieldErrorsOf,
  googlePatchSchema,
  loginSchema,
  websitePatchSchema,
  type BusinessPatchInput,
  type GooglePatchInput,
  type LoginInput,
  type WebsitePatchInput,
} from "./schemas"

/**
 * The client's side of onboarding. No session: every call goes to a
 * token-checked onboarding_* database function, which validates and saves
 * straight away. Connecting accounts uses the service client after the same
 * token check, because the client has no LeadMaker login.
 */

type Platform = Database["public"]["Enums"]["social_platform"]
type Result = ActionResult<{ steps: StepStatuses }>

const TOKEN = /^[A-Za-z0-9]{22}$/
const BAD_LINK = {
  ok: false,
  error: "This link isn't active. Ask your LeadMaker contact for a new one.",
} as const

/** Database refusals in words the client can act on. */
function dbError(error: { code?: string; message?: string } | null): string {
  if (!error) return "Something went wrong. Try again."
  if ((error.code === "P0001" || error.code === "42501") && error.message) return error.message
  if (error.code === "23514" || error.code === "22P02" || error.code === "22001") {
    return "One of the answers isn't in a format we can save. Check the field and try again."
  }
  return "We couldn't save that just now. We'll keep trying."
}

async function rpcSteps(name: string, args: Record<string, unknown>): Promise<Result> {
  const supabase = createSupabasePublicClient()
  // The RPC names and args are fixed by the callers below.
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      a: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
  )(name, args)
  if (error) return { ok: false, error: dbError(error) }
  return { ok: true, data: { steps: data as StepStatuses } }
}

export async function saveBusiness(token: string, patch: BusinessPatchInput): Promise<Result> {
  if (!TOKEN.test(token)) return BAD_LINK
  const parsed = businessPatchSchema.safeParse(patch)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted field.",
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    }
  }
  return rpcSteps("onboarding_save_business", { p_token: token, p_data: parsed.data })
}

export async function saveGoogleAccess(token: string, patch: GooglePatchInput): Promise<Result> {
  if (!TOKEN.test(token)) return BAD_LINK
  const parsed = googlePatchSchema.safeParse(patch)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted field.",
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    }
  }
  return rpcSteps("onboarding_save_google_access", { p_token: token, p_data: parsed.data })
}

export async function saveWebsite(token: string, patch: WebsitePatchInput): Promise<Result> {
  if (!TOKEN.test(token)) return BAD_LINK
  const parsed = websitePatchSchema.safeParse(patch)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted field.",
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    }
  }
  return rpcSteps("onboarding_save_website", { p_token: token, p_data: parsed.data })
}

export async function setNotUsing(
  token: string,
  platforms: string[],
  notUsing: boolean,
): Promise<Result> {
  if (!TOKEN.test(token)) return BAD_LINK
  const valid = platforms.filter(isSocialPlatform) as Platform[]
  if (valid.length === 0) return { ok: false, error: "Unknown platform." }
  return rpcSteps("onboarding_set_not_using", {
    p_token: token,
    p_platforms: valid,
    p_not_using: notUsing,
  })
}

export async function addLogin(
  token: string,
  input: LoginInput,
): Promise<ActionResult<{ steps: StepStatuses; id: string }>> {
  if (!TOKEN.test(token)) return BAD_LINK
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted field.",
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    }
  }
  const v = parsed.data
  const { data, error } = await createSupabasePublicClient().rpc("onboarding_add_login", {
    p_token: token,
    p_site_name: v.site_name,
    p_site_url: v.site_url ?? "",
    p_username: v.username,
    p_password: v.password,
    p_has_2fa: v.has_2fa,
    p_notes: v.notes ?? "",
  })
  if (error) return { ok: false, error: dbError(error) }
  const steps = data as unknown as StepStatuses & { login_id: string }
  return { ok: true, data: { steps, id: steps.login_id } }
}

export async function removeLogin(token: string, loginId: string): Promise<Result> {
  if (!TOKEN.test(token) || !/^[0-9a-f-]{36}$/i.test(loginId)) return BAD_LINK
  return rpcSteps("onboarding_remove_login", { p_token: token, p_login_id: loginId })
}

export async function skipLogins(token: string, skip: boolean): Promise<Result> {
  if (!TOKEN.test(token)) return BAD_LINK
  return rpcSteps("onboarding_skip_logins", { p_token: token, p_skip: skip })
}

export async function submitOnboarding(token: string): Promise<Result> {
  if (!TOKEN.test(token)) return BAD_LINK
  return rpcSteps("onboarding_submit", { p_token: token })
}

/**
 * Starts Zernio's hosted sign-in for one platform. The onboarding token is
 * never sent to Zernio: the return address carries a separate one-time key
 * whose hash is stored on the attempt.
 */
export async function startOnboardingConnect(
  token: string,
  platform: string,
): Promise<ActionResult<{ url: string }>> {
  if (!TOKEN.test(token)) return BAD_LINK
  if (!isSocialPlatform(platform)) return { ok: false, error: "Unknown platform." }
  if (!hasZernioApiKey() || !hasSupabaseSecretKey()) {
    return {
      ok: false,
      error: "Connecting isn't available right now. Your LeadMaker contact will help you.",
    }
  }

  const db = createSupabaseAdminClient() as unknown as Db
  const { data: link } = await db
    .from("onboarding_links")
    .select("client_id, status, expires_at, client:clients(id, name)")
    .eq("token", token)
    .maybeSingle()
  if (!link?.client || link.status !== "active" || Date.parse(link.expires_at) < Date.now())
    return BAD_LINK

  try {
    const profileId = await ensureZernioProfile(db, link.client, null)
    const key = randomBytes(32).toString("base64url")
    const { data: attempt, error } = await db
      .from("social_connect_attempts")
      .insert({
        client_id: link.client_id,
        platform,
        method: "oauth",
        source: "onboarding",
        created_by: null,
        callback_key_hash: createHash("sha256").update(key).digest("hex"),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single()
    if (error) return { ok: false, error: "Couldn't start the connection. Try again." }

    const origin = await requestOrigin()
    const url = await getConnectUrl({
      platform,
      profileId,
      redirectUrl: `${onboardingDoneUrl(origin)}?a=${attempt.id}&k=${key}`,
    })
    return { ok: true, data: { url } }
  } catch (error) {
    console.error("[onboarding] connect failed", error)
    if (error instanceof ZernioError && error.status === 402) {
      return {
        ok: false,
        error:
          "Connecting is paused on our side. Your LeadMaker contact has been told; try again later.",
      }
    }
    return { ok: false, error: "We couldn't open the sign-in. Try again in a minute." }
  }
}
