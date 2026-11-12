"use server"

import { refresh } from "next/cache"

import type { ActionResult } from "@/features/tasks/schemas"
import { PermissionError, requirePermission, type CurrentMember } from "@/lib/auth"
import { getZernioWebhookSecret, hasZernioApiKey } from "@/lib/env.server"
import { requestOrigin } from "@/lib/origin"
import type { Permission } from "@/lib/roles"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  createInvite,
  deleteAccount,
  deleteProfile,
  getConnectUrl,
  listWebhooks,
  saveWebhook,
  testWebhook,
  ZernioError,
} from "@/lib/zernio/client"
import { isSocialPlatform, PLATFORM_META, type SocialPlatform } from "./constants"
import { ensureZernioProfile } from "./profile"
import { isLocalOrigin } from "./queries"
import { syncClient, type Db } from "./sync"

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
const NOT_SET_UP = "Zernio isn't set up yet. An admin needs to add ZERNIO_API_KEY."

/** Zernio failures in words a person can act on. */
function zernioMessage(error: unknown) {
  if (!(error instanceof ZernioError)) return "Something went wrong. Try again."
  if (error.status === 402) {
    return "Zernio needs a payment method before more than 2 accounts can be connected. An admin can add one in Zernio's billing page."
  }
  if (error.status === 401)
    return "Zernio rejected the API key. An admin needs to check ZERNIO_API_KEY."
  if (error.status === 429) return "Zernio is busy right now. Wait a minute and try again."
  if (error.status === 0 || error.status >= 500)
    return "Zernio isn't responding. Try again in a minute."
  return error.message
}

async function loadClient(supabase: Db, clientId: string) {
  const { data } = await supabase
    .from("clients")
    .select("id, name, slug")
    .eq("id", clientId)
    .maybeSingle()
  return data
}

async function loadReconnect(supabase: Db, clientId: string, accountId: string | null | undefined) {
  if (!accountId) return null
  if (!isUuid(accountId)) return undefined
  const { data } = await supabase
    .from("social_accounts")
    .select("id, zernio_account_id, platform")
    .eq("id", accountId)
    .eq("client_id", clientId)
    .maybeSingle()
  return data ?? undefined
}

/** Starts Zernio's hosted sign-in. The browser goes to the returned URL. */
export async function startConnect(
  clientId: string,
  platform: string,
  reconnectAccountId?: string | null,
): Promise<ActionResult<{ url: string }>> {
  const g = await guard("connections.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(clientId) || !isSocialPlatform(platform))
    return { ok: false, error: "Unknown client or platform." }
  if (!hasZernioApiKey()) return { ok: false, error: NOT_SET_UP }

  const supabase = (await createSupabaseServerClient()) as unknown as Db
  const client = await loadClient(supabase, clientId)
  if (!client) return { ok: false, error: "Unknown client." }
  const reconnect = await loadReconnect(supabase, clientId, reconnectAccountId)
  if (reconnect === undefined || (reconnect && reconnect.platform !== platform)) {
    return { ok: false, error: "That account isn't on this client." }
  }

  let attemptId: string | null = null
  try {
    const profileId = await ensureZernioProfile(supabase, client, g.member.id)
    const { data: attempt, error } = await supabase
      .from("social_connect_attempts")
      .insert({
        client_id: clientId,
        platform,
        method: "oauth",
        reconnect_account_id: reconnect?.id ?? null,
        created_by: g.member.id,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single()
    if (error) return { ok: false, error: "Couldn't start the connection. Try again." }
    attemptId = attempt.id

    const origin = await requestOrigin()
    const url = await getConnectUrl({
      platform,
      profileId,
      redirectUrl: `${origin}/integrations/zernio/callback?attempt=${attempt.id}`,
      reconnectAccountId: reconnect?.zernio_account_id ?? null,
    })
    return { ok: true, data: { url } }
  } catch (error) {
    if (attemptId) {
      await supabase
        .from("social_connect_attempts")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_code:
            error instanceof ZernioError
              ? (error.code ?? `http_${error.status}`).slice(0, 100)
              : "error",
          error_message: zernioMessage(error).slice(0, 500),
          zernio_request_id: error instanceof ZernioError ? error.requestId : null,
        })
        .eq("id", attemptId)
    }
    console.error("[zernio] startConnect failed", error)
    return { ok: false, error: zernioMessage(error) }
  }
}

/** A link the client opens to connect their own account (no LeadMaker or Zernio login). */
export async function createClientLink(
  clientId: string,
  platform: string,
  reconnectAccountId?: string | null,
): Promise<ActionResult<{ url: string; expiresAt: string; message: string }>> {
  const g = await guard("connections.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(clientId) || !isSocialPlatform(platform))
    return { ok: false, error: "Unknown client or platform." }
  if (!hasZernioApiKey()) return { ok: false, error: NOT_SET_UP }

  const supabase = (await createSupabaseServerClient()) as unknown as Db
  const client = await loadClient(supabase, clientId)
  if (!client) return { ok: false, error: "Unknown client." }
  const reconnect = await loadReconnect(supabase, clientId, reconnectAccountId)
  if (reconnect === undefined || (reconnect && reconnect.platform !== platform)) {
    return { ok: false, error: "That account isn't on this client." }
  }

  try {
    const profileId = await ensureZernioProfile(supabase, client, g.member.id)
    const invite = await createInvite({
      platform,
      profileId,
      accountId: reconnect?.zernio_account_id ?? null,
      expiresInDays: 7,
    })
    const expiresAt =
      invite.expiresAt && !Number.isNaN(Date.parse(invite.expiresAt))
        ? invite.expiresAt
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    // An older pending link for the same thing is replaced by this one.
    await supabase
      .from("social_connect_attempts")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .eq("platform", platform)
      .eq("method", "invite")
      .eq("status", "pending")

    const { error } = await supabase.from("social_connect_attempts").insert({
      client_id: clientId,
      platform,
      method: "invite",
      invite_url: invite.url,
      reconnect_account_id: reconnect?.id ?? null,
      created_by: g.member.id,
      expires_at: expiresAt,
    })
    if (error) return { ok: false, error: "The link was made but couldn't be saved. Try again." }

    refresh()
    return {
      ok: true,
      data: { url: invite.url, expiresAt, message: clientMessage(platform, invite.url, g.member) },
    }
  } catch (error) {
    console.error("[zernio] createClientLink failed", error)
    return { ok: false, error: zernioMessage(error) }
  }
}

function clientMessage(platform: SocialPlatform, url: string, member: CurrentMember) {
  const label = PLATFORM_META[platform].label
  return [
    "Hi!",
    "",
    `To let us manage your ${label} for you, please open this link and sign in. It takes about a minute, and we never see your password:`,
    url,
    "",
    "The link works once and expires in 7 days.",
    "",
    `Thanks, ${member.displayName.split(" ")[0]}`,
  ].join("\n")
}

export async function cancelClientLink(attemptId: string): Promise<ActionResult> {
  const g = await guard("connections.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(attemptId)) return { ok: false, error: "Unknown link." }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("social_connect_attempts")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", attemptId)
    .eq("method", "invite")
    .eq("status", "pending")
    .select("id")
  if (error || !data?.length) return { ok: false, error: "That link is no longer pending." }
  refresh()
  return { ok: true }
}

/** Disconnects at Zernio. A reconnect within the hour keeps the same account. */
export async function disconnectAccount(accountId: string): Promise<ActionResult> {
  const g = await guard("connections.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(accountId)) return { ok: false, error: "Unknown account." }
  if (!hasZernioApiKey()) return { ok: false, error: NOT_SET_UP }

  const supabase = await createSupabaseServerClient()
  const { data: account } = await supabase
    .from("social_accounts")
    .select("id, zernio_account_id, status")
    .eq("id", accountId)
    .maybeSingle()
  if (!account) return { ok: false, error: "Unknown account." }
  if (account.status === "removed") return { ok: true }

  try {
    const { graceEndsAt } = await deleteAccount(account.zernio_account_id)
    const { error } = await supabase
      .from("social_accounts")
      .update({
        status: "removed",
        removed_at: new Date().toISOString(),
        removal_grace_ends_at: graceEndsAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .eq("id", accountId)
    if (error)
      return {
        ok: false,
        error: "Disconnected at Zernio, but the list didn't update. Click Check now.",
      }
    refresh()
    return { ok: true }
  } catch (error) {
    console.error("[zernio] disconnect failed", error)
    return { ok: false, error: zernioMessage(error) }
  }
}

/** Re-reads the client's accounts from Zernio (at most once a minute). */
export async function checkNow(clientId: string): Promise<ActionResult<{ changed: boolean }>> {
  const g = await guard("connections.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (!hasZernioApiKey()) return { ok: false, error: NOT_SET_UP }

  const supabase = (await createSupabaseServerClient()) as unknown as Db
  const { data: recent } = await supabase
    .from("social_accounts")
    .select("last_checked_at")
    .eq("client_id", clientId)
    .gte("last_checked_at", new Date(Date.now() - 60 * 1000).toISOString())
    .limit(1)
  if (recent?.length) return { ok: true, data: { changed: false } }

  try {
    const summary = await syncClient(supabase, clientId, g.member.id)
    refresh()
    return {
      ok: true,
      data: { changed: Boolean(summary && summary.added + summary.removed > 0) },
    }
  } catch (error) {
    console.error("[zernio] checkNow failed", error)
    return { ok: false, error: zernioMessage(error) }
  }
}

// ---------------------------------------------------------------------------
// Admin: the Zernio integration itself
// ---------------------------------------------------------------------------

export async function registerWebhook(): Promise<ActionResult> {
  const g = await guard("integrations.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!hasZernioApiKey()) return { ok: false, error: NOT_SET_UP }
  const secret = getZernioWebhookSecret()
  if (!secret || secret.length < 32) {
    return { ok: false, error: "Add ZERNIO_WEBHOOK_SECRET (at least 32 characters) first." }
  }
  const origin = await requestOrigin()
  if (isLocalOrigin(origin) || !origin.startsWith("https://")) {
    return {
      ok: false,
      error: "Register the webhook from the live https site; Zernio can't reach this computer.",
    }
  }
  try {
    await saveWebhook(`${origin}/api/webhooks/zernio`, secret)
    refresh()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: zernioMessage(error) }
  }
}

export async function sendTestWebhook(): Promise<ActionResult> {
  const g = await guard("integrations.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!hasZernioApiKey()) return { ok: false, error: NOT_SET_UP }
  const origin = await requestOrigin()
  try {
    const hook = (await listWebhooks()).find((w) => w.url === `${origin}/api/webhooks/zernio`)
    if (!hook) return { ok: false, error: "Register the webhook first." }
    await testWebhook(hook._id)
    return { ok: true }
  } catch (error) {
    if (error instanceof ZernioError && error.status === 500) {
      return {
        ok: false,
        error:
          "Zernio sent it but this app didn't answer 2xx. Check the secret and the server logs.",
      }
    }
    return { ok: false, error: zernioMessage(error) }
  }
}

export async function turnOnHourlyChecks(): Promise<ActionResult> {
  const g = await guard("integrations.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!hasSupabaseSecretKey()) return { ok: false, error: "Add SUPABASE_SECRET_KEY first." }
  const origin = await requestOrigin()
  if (isLocalOrigin(origin) || !origin.startsWith("https://")) {
    return {
      ok: false,
      error: "Turn this on from the live https site; the database can't reach this computer.",
    }
  }
  const { error } = await createSupabaseAdminClient().rpc("configure_zernio_cron", {
    p_base_url: origin,
  })
  if (error) return { ok: false, error: `Couldn't schedule the checks: ${error.message}` }
  refresh()
  return { ok: true }
}

/**
 * Stops Zernio billing for a client: disconnects every account, deletes the
 * Zernio profile and our row. Required before a client can be deleted
 * (zernio_profiles references clients with ON DELETE RESTRICT).
 */
export async function offboardClient(clientId: string): Promise<ActionResult> {
  const g = await guard("clients.delete")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (!hasSupabaseSecretKey()) return { ok: false, error: "Add SUPABASE_SECRET_KEY first." }

  const admin = createSupabaseAdminClient()
  const { data: profile } = await admin
    .from("zernio_profiles")
    .select("zernio_profile_id")
    .eq("client_id", clientId)
    .maybeSingle()
  if (!profile) return { ok: true }
  if (!hasZernioApiKey()) return { ok: false, error: NOT_SET_UP }

  try {
    const { data: accounts } = await admin
      .from("social_accounts")
      .select("zernio_account_id")
      .eq("client_id", clientId)
      .neq("status", "removed")
    for (const a of accounts ?? []) await deleteAccount(a.zernio_account_id)
    await deleteProfile(profile.zernio_profile_id)
    await admin.from("zernio_profiles").delete().eq("client_id", clientId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: zernioMessage(error) }
  }
}
