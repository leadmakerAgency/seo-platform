import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database, TablesInsert } from "@/lib/supabase/database.types"
import { accountsHealth, listAccounts } from "@/lib/zernio/client"
import type { ZernioAccount, ZernioAccountHealth } from "@/lib/zernio/schemas"
import { isSocialPlatform } from "./constants"

/**
 * Zernio is the source of truth; these functions mirror it into
 * social_accounts. Every path (the connect callback, webhooks, the hourly
 * cron, Check now, page loads) ends here, and running it twice changes nothing.
 *
 * `db` is the signed-in user's client for things a person did (so history
 * names them; RLS lets admins and managers write) or the service client for
 * webhooks and the cron.
 */
export type Db = SupabaseClient<Database>

type Row = TablesInsert<"social_accounts">
export type SyncSummary = { added: number; updated: number; removed: number }

const clip = (v: string | null | undefined, max: number) => (v ? v.slice(0, max) : null)
const https = (v: string | null | undefined) =>
  v && /^https:\/\//i.test(v) ? v.slice(0, 2000) : null
const iso = (v: string | null | undefined) => (v && !Number.isNaN(Date.parse(v)) ? v : null)
const meta = (a: ZernioAccount, key: string) => {
  const v = a.metadata?.[key]
  return typeof v === "string" ? v : null
}

export function profileIdOf(a: ZernioAccount): string | null {
  if (!a.profileId) return null
  return typeof a.profileId === "string" ? a.profileId : a.profileId._id
}

function toRow(
  a: ZernioAccount,
  health: ZernioAccountHealth | undefined,
  clientId: string,
  profileId: string,
  now: string,
): Omit<Row, "connected_by"> | null {
  if (!isSocialPlatform(a.platform) || a.enabled === false) return null

  const broken =
    a.needsReconnection === true ||
    a.isActive === false ||
    health?.needsReconnect === true ||
    health?.tokenValid === false
  const isGbp = a.platform === "googlebusiness"

  return {
    client_id: clientId,
    zernio_profile_id: profileId,
    zernio_account_id: a._id,
    platform: a.platform,
    platform_user_id: clip(a.platformUserId, 200),
    username: clip(a.username, 300),
    display_name: clip(a.displayName, 300),
    avatar_url: https(a.profilePicture),
    profile_url: https(a.profileUrl),
    location_id: isGbp ? clip(a.selectedLocationId ?? meta(a, "selectedLocationId"), 200) : null,
    location_name: isGbp
      ? clip(a.selectedLocationName ?? meta(a, "selectedLocationName") ?? a.displayName, 300)
      : null,
    status: broken ? "needs_reconnect" : "connected",
    can_post: health?.canPost ?? null,
    can_fetch_analytics: health?.canFetchAnalytics ?? null,
    token_expires_at: iso(health?.tokenExpiresAt),
    issues: (health?.issues ?? []).slice(0, 20).map((i) => i.slice(0, 300)),
    disconnect_reason: broken
      ? clip(health?.disconnectReason ?? health?.issues?.[0] ?? null, 500)
      : null,
    last_checked_at: now,
  }
}

/** Upserts one client's accounts from Zernio's lists; marks ones Zernio no longer has. */
async function applyAccounts(
  db: Db,
  clientId: string,
  profileId: string,
  accounts: ZernioAccount[],
  health: Map<string, ZernioAccountHealth>,
  connectedBy: string | null,
): Promise<SyncSummary> {
  const now = new Date().toISOString()
  const summary: SyncSummary = { added: 0, updated: 0, removed: 0 }

  const { data: existing, error } = await db
    .from("social_accounts")
    .select("id, zernio_account_id, status, removal_grace_ends_at")
    .eq("client_id", clientId)
  if (error) throw new Error(`Could not read connected accounts: ${error.message}`)
  const byZernioId = new Map((existing ?? []).map((r) => [r.zernio_account_id, r]))
  const seen = new Set<string>()

  for (const account of accounts) {
    const row = toRow(account, health.get(account._id), clientId, profileId, now)
    if (!row) continue
    seen.add(row.zernio_account_id)
    const current = byZernioId.get(row.zernio_account_id)

    if (current) {
      // Just disconnected on purpose: stay "removed" during the grace hour
      // unless Zernio reports it healthy again (it was reconnected).
      const inGrace =
        current.status === "removed" &&
        current.removal_grace_ends_at !== null &&
        Date.parse(current.removal_grace_ends_at) > Date.now()
      const status = inGrace && row.status !== "connected" ? "removed" : row.status
      const { error: updateError } = await db
        .from("social_accounts")
        .update({ ...row, status })
        .eq("id", current.id)
      if (updateError) throw new Error(`Could not update an account: ${updateError.message}`)
      summary.updated++
      continue
    }

    const { error: insertError } = await db
      .from("social_accounts")
      .insert({ ...row, connected_by: connectedBy })
    if (insertError?.code === "23505") {
      // Inserted a moment ago by a parallel sync (webhook and callback): update instead.
      await db.from("social_accounts").update(row).eq("zernio_account_id", row.zernio_account_id)
      summary.updated++
    } else if (insertError) {
      throw new Error(`Could not save an account: ${insertError.message}`)
    } else {
      summary.added++
    }
  }

  const gone = (existing ?? []).filter(
    (r) => !seen.has(r.zernio_account_id) && r.status !== "removed",
  )
  if (gone.length > 0) {
    const { error: removeError } = await db
      .from("social_accounts")
      .update({ status: "removed", last_checked_at: now })
      .in(
        "id",
        gone.map((r) => r.id),
      )
    if (removeError) throw new Error(`Could not update removed accounts: ${removeError.message}`)
    summary.removed = gone.length
  }
  return summary
}

/** Pending client links that have since connected, and ones that ran out. */
async function settleAttempts(db: Db, clientId: string) {
  const now = new Date()
  const { data: attempts } = await db
    .from("social_connect_attempts")
    .select("id, platform, created_at, expires_at, reconnect_account_id")
    .eq("client_id", clientId)
    .eq("status", "pending")
  if (!attempts?.length) return

  const { data: accounts } = await db
    .from("social_accounts")
    .select("id, platform, status, connected_at, updated_at")
    .eq("client_id", clientId)
    .eq("status", "connected")

  for (const attempt of attempts) {
    const match = (accounts ?? []).find((a) =>
      attempt.reconnect_account_id
        ? a.id === attempt.reconnect_account_id && a.updated_at >= attempt.created_at
        : a.platform === attempt.platform && a.connected_at >= attempt.created_at,
    )
    if (match) {
      await db
        .from("social_connect_attempts")
        .update({
          status: "connected",
          result_account_id: match.id,
          completed_at: now.toISOString(),
        })
        .eq("id", attempt.id)
        .eq("status", "pending")
    } else if (Date.parse(attempt.expires_at) < now.getTime()) {
      await db
        .from("social_connect_attempts")
        .update({ status: "expired", completed_at: now.toISOString() })
        .eq("id", attempt.id)
        .eq("status", "pending")
    }
  }
}

/** Mirrors one client's Zernio profile. Returns null when the client has no profile yet. */
export async function syncClient(
  db: Db,
  clientId: string,
  connectedBy: string | null = null,
): Promise<SyncSummary | null> {
  const { data: profile } = await db
    .from("zernio_profiles")
    .select("zernio_profile_id")
    .eq("client_id", clientId)
    .maybeSingle()
  if (!profile) return null

  const [accounts, health] = await Promise.all([
    listAccounts(profile.zernio_profile_id),
    accountsHealth(profile.zernio_profile_id),
  ])
  const summary = await applyAccounts(
    db,
    clientId,
    profile.zernio_profile_id,
    accounts.filter((a) => profileIdOf(a) === profile.zernio_profile_id),
    new Map(health.map((h) => [h.accountId, h])),
    connectedBy,
  )
  await settleAttempts(db, clientId)
  return summary
}

/** Mirrors every client in about three Zernio calls (the hourly cron). Service client only. */
export async function syncAll(db: Db) {
  const [{ data: profiles, error }, accounts, health] = await Promise.all([
    db.from("zernio_profiles").select("client_id, zernio_profile_id"),
    listAccounts(),
    accountsHealth(),
  ])
  if (error) throw new Error(`Could not read Zernio profiles: ${error.message}`)

  const healthMap = new Map(health.map((h) => [h.accountId, h]))
  const totals: SyncSummary & { clients: number; failed: number } = {
    added: 0,
    updated: 0,
    removed: 0,
    clients: 0,
    failed: 0,
  }
  for (const p of profiles ?? []) {
    try {
      const s = await applyAccounts(
        db,
        p.client_id,
        p.zernio_profile_id,
        accounts.filter((a) => profileIdOf(a) === p.zernio_profile_id),
        healthMap,
        null,
      )
      await settleAttempts(db, p.client_id)
      totals.added += s.added
      totals.updated += s.updated
      totals.removed += s.removed
      totals.clients++
    } catch (e) {
      totals.failed++
      console.error("[zernio] sync failed for client", p.client_id, e)
    }
  }
  return totals
}
