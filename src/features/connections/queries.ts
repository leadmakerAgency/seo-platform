import "server-only"

import { hasZernioApiKey, getZernioWebhookSecret } from "@/lib/env.server"
import { requestOrigin } from "@/lib/origin"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { listWebhooks, ZernioError } from "@/lib/zernio/client"
import type { SocialAccountStatus, SocialPlatform } from "./constants"

const nameOf = (m: { full_name: string; email: string } | null) =>
  m ? m.full_name || m.email.split("@")[0] : null

export type ConnectedAccount = {
  id: string
  platform: SocialPlatform
  status: SocialAccountStatus
  name: string
  username: string | null
  avatarUrl: string | null
  profileUrl: string | null
  locationName: string | null
  canPost: boolean | null
  disconnectReason: string | null
  issues: string[]
  connectedAt: string
  connectedBy: string | null
  removedAt: string | null
  removalGraceEndsAt: string | null
  lastCheckedAt: string | null
  alsoOn: { slug: string; name: string }[]
}

export type PendingLink = {
  id: string
  platform: SocialPlatform
  url: string
  createdAt: string
  expiresAt: string
  createdBy: string | null
  reconnect: boolean
}

export type ConnectionHistoryEntry = {
  id: number
  action: string
  meta: Record<string, unknown>
  createdAt: string
  actorName: string | null
}

export type ConnectionsData = {
  hasProfile: boolean
  accounts: ConnectedAccount[]
  links: PendingLink[]
  history: ConnectionHistoryEntry[]
  lastCheckedAt: string | null
  /** True when the mirror is older than 15 minutes (refresh in the background). */
  stale: boolean
}

const STALE_AFTER_MS = 15 * 60 * 1000

/** Everything the client's Connections page shows (RLS: admins and managers). */
export async function getConnectionsData(clientId: string): Promise<ConnectionsData> {
  const supabase = await createSupabaseServerClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [profile, accounts, links, history] = await Promise.all([
    supabase.from("zernio_profiles").select("client_id").eq("client_id", clientId).maybeSingle(),
    supabase
      .from("social_accounts")
      .select(
        `id, platform, status, display_name, username, avatar_url, profile_url, location_name, platform_user_id,
         can_post, disconnect_reason, issues, connected_at, removed_at, removal_grace_ends_at, last_checked_at,
         connector:team_members!social_accounts_connected_by_fkey(full_name, email)`,
      )
      .eq("client_id", clientId)
      .or(`status.neq.removed,removed_at.gte.${since}`)
      .order("connected_at", { ascending: true }),
    supabase
      .from("social_connect_attempts")
      .select(
        "id, platform, invite_url, created_at, expires_at, reconnect_account_id, creator:team_members!social_connect_attempts_created_by_fkey(full_name, email)",
      )
      .eq("client_id", clientId)
      .eq("method", "invite")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("activity_log")
      .select(
        "id, action, meta, created_at, actor:team_members!activity_log_actor_id_fkey(full_name, email)",
      )
      .eq("client_id", clientId)
      .like("action", "connection.%")
      .order("created_at", { ascending: false })
      .limit(30),
  ])
  if (accounts.error)
    throw new Error(`Could not load connected accounts: ${accounts.error.message}`)

  // The same platform account connected to another client (billed twice, posts twice).
  const ids = (accounts.data ?? []).filter((a) => a.platform_user_id && a.status !== "removed")
  const duplicates = new Map<string, { slug: string; name: string }[]>()
  if (ids.length > 0) {
    const { data: others } = await supabase
      .from("social_accounts")
      .select("platform, platform_user_id, client:clients(slug, name)")
      .neq("client_id", clientId)
      .neq("status", "removed")
      .in(
        "platform_user_id",
        ids.map((a) => a.platform_user_id!),
      )
    for (const o of others ?? []) {
      if (!o.client) continue
      const key = `${o.platform}:${o.platform_user_id}`
      duplicates.set(key, [...(duplicates.get(key) ?? []), o.client])
    }
  }

  const rows = (accounts.data ?? []).map<ConnectedAccount>((a) => ({
    id: a.id,
    platform: a.platform,
    status: a.status,
    name: a.location_name || a.display_name || a.username || "Unnamed account",
    username: a.username,
    avatarUrl: a.avatar_url,
    profileUrl: a.profile_url,
    locationName: a.location_name,
    canPost: a.can_post,
    disconnectReason: a.disconnect_reason,
    issues: a.issues,
    connectedAt: a.connected_at,
    connectedBy: nameOf(a.connector),
    removedAt: a.removed_at,
    removalGraceEndsAt: a.removal_grace_ends_at,
    lastCheckedAt: a.last_checked_at,
    alsoOn: duplicates.get(`${a.platform}:${a.platform_user_id}`) ?? [],
  }))

  const checked = rows.map((r) => r.lastCheckedAt).filter(Boolean) as string[]
  return {
    hasProfile: Boolean(profile.data),
    accounts: rows,
    links: (links.data ?? [])
      .filter((l) => l.invite_url)
      .map((l) => ({
        id: l.id,
        platform: l.platform,
        url: l.invite_url!,
        createdAt: l.created_at,
        expiresAt: l.expires_at,
        createdBy: nameOf(l.creator),
        reconnect: Boolean(l.reconnect_account_id),
      })),
    history: (history.data ?? []).map((h) => ({
      id: h.id,
      action: h.action,
      meta: (h.meta ?? {}) as Record<string, unknown>,
      createdAt: h.created_at,
      actorName: nameOf(h.actor),
    })),
    lastCheckedAt: checked.length ? checked.sort().at(0)! : null,
    stale:
      checked.length === 0 || Date.now() - Date.parse([...checked].sort()[0]) > STALE_AFTER_MS,
  }
}

export type IntegrationStatus = {
  apiKey: "ok" | "missing" | "rejected" | "unreachable"
  webhookSecret: boolean
  serviceKey: boolean
  origin: string
  isLocal: boolean
  webhook: { id: string; active: boolean; failureCount: number; lastFiredAt: string | null } | null
  cron: { scheduled: boolean; lastRunAt: string | null; lastStatus: string | null } | null
  connectedAccounts: number
}

export const isLocalOrigin = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(origin) ||
  /\.(local|localhost|test)(:\d+)?$/i.test(origin)

/** The admin-only Zernio card: is everything wired up? */
export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const origin = await requestOrigin()
  const supabase = await createSupabaseServerClient()
  const status: IntegrationStatus = {
    apiKey: hasZernioApiKey() ? "ok" : "missing",
    webhookSecret: Boolean(getZernioWebhookSecret()),
    serviceKey: hasSupabaseSecretKey(),
    origin,
    isLocal: isLocalOrigin(origin),
    webhook: null,
    cron: null,
    connectedAccounts: 0,
  }

  const { count } = await supabase
    .from("social_accounts")
    .select("id", { count: "exact", head: true })
    .neq("status", "removed")
  status.connectedAccounts = count ?? 0

  if (status.apiKey === "ok") {
    try {
      const url = `${origin}/api/webhooks/zernio`
      const hook = (await listWebhooks()).find((w) => w.url === url)
      if (hook) {
        status.webhook = {
          id: hook._id,
          active: hook.isActive !== false,
          failureCount: hook.failureCount ?? 0,
          lastFiredAt: hook.lastFiredAt ?? null,
        }
      }
    } catch (error) {
      if (error instanceof ZernioError && (error.status === 401 || error.status === 403)) {
        status.apiKey = "rejected"
      } else {
        status.apiKey = "unreachable"
      }
    }
  }

  if (status.serviceKey) {
    const admin = createSupabaseAdminClient()
    const { data } = await admin.rpc("zernio_cron_status")
    const s = data as { scheduled?: boolean; last_run_at?: string; last_status?: string } | null
    if (s) {
      status.cron = {
        scheduled: Boolean(s.scheduled),
        lastRunAt: s.last_run_at ?? null,
        lastStatus: s.last_status ?? null,
      }
    }
  }
  return status
}
