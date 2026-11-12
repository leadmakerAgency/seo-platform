import "server-only"

import type { z } from "zod"

import { getZernioApiBase, getZernioApiKey } from "@/lib/env.server"
import {
  zAccountsList,
  zConnectUrl,
  zDisconnect,
  zErrorBody,
  zHealthList,
  zInvite,
  zProfileCreated,
  zProfilesList,
  zWebhookSaved,
  zWebhooksList,
  type ZernioAccount,
  type ZernioAccountHealth,
  type ZernioWebhook,
} from "./schemas"

/**
 * A small, typed Zernio API client (server only: the API key never reaches the
 * browser). GET requests retry twice on 429/502/503/504; writes never retry
 * automatically, so a timeout can't create something twice.
 */

const TIMEOUT_MS = 10_000
const MAX_GET_RETRIES = 2

export class ZernioError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly type: string | null = null,
    readonly requestId: string | null = null,
    readonly dashboardUrl: string | null = null,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message)
    this.name = "ZernioError"
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Query = Record<string, string | number | boolean | null | undefined>

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  schema: z.ZodType<T>,
  { query, body }: { query?: Query; body?: unknown } = {},
): Promise<T> {
  const url = new URL(`${getZernioApiBase()}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value))
  }

  for (let attempt = 0; ; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${getZernioApiKey()}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      })
    } catch (error) {
      if (method === "GET" && attempt < MAX_GET_RETRIES) {
        await sleep(500 * (attempt + 1))
        continue
      }
      const timedOut = error instanceof Error && error.name === "TimeoutError"
      throw new ZernioError(
        timedOut ? "Zernio didn't answer in time." : "Couldn't reach Zernio.",
        0,
        timedOut ? "timeout" : "network_error",
      )
    }

    const requestId = response.headers.get("x-request-id")
    if (response.ok) {
      const json = response.status === 204 ? {} : await response.json().catch(() => ({}))
      const parsed = schema.safeParse(json)
      if (!parsed.success) {
        throw new ZernioError(
          "Zernio sent a response we didn't expect.",
          502,
          "bad_response",
          null,
          requestId,
        )
      }
      return parsed.data
    }

    const retryable = [429, 502, 503, 504].includes(response.status)
    if (method === "GET" && retryable && attempt < MAX_GET_RETRIES) {
      const retryAfter = Number(response.headers.get("retry-after"))
      await sleep(
        Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 800, 5000),
      )
      continue
    }

    const raw = await response.json().catch(() => ({}))
    const err = zErrorBody.safeParse(raw)
    const e = err.success ? err.data : {}
    throw new ZernioError(
      e.error || `Zernio returned ${response.status}.`,
      response.status,
      e.code ?? null,
      e.type ?? null,
      requestId,
      e.dashboard_url ??
        (typeof e.details?.dashboard_url === "string" ? e.details.dashboard_url : null),
      e.details ?? null,
    )
  }
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** The client's Zernio profile (externalId = our client id), created if missing. */
export async function getOrCreateProfile(clientId: string, name: string): Promise<string> {
  const existing = await request("GET", "/profiles", zProfilesList, {
    query: { externalId: clientId },
  })
  const found = existing.profiles.find((p) => p.externalId === clientId)
  if (found) return found._id

  try {
    const created = await request("POST", "/profiles", zProfileCreated, {
      body: { name: name.slice(0, 100), externalId: clientId, description: "LeadMaker client" },
    })
    return created.profile._id
  } catch (error) {
    // A retry or a parallel click: Zernio hands back the profile it already has.
    if (error instanceof ZernioError && error.status === 409) {
      const id = error.details?.existingProfileId
      if (typeof id === "string") return id
      const again = await request("GET", "/profiles", zProfilesList, {
        query: { externalId: clientId },
      })
      const match = again.profiles.find((p) => p.externalId === clientId)
      if (match) return match._id
    }
    throw error
  }
}

export async function deleteProfile(profileId: string) {
  try {
    await request("DELETE", `/profiles/${encodeURIComponent(profileId)}`, zDisconnect)
  } catch (error) {
    if (error instanceof ZernioError && error.status === 404) return
    throw error
  }
}

// ---------------------------------------------------------------------------
// Connecting
// ---------------------------------------------------------------------------

export async function getConnectUrl(input: {
  platform: string
  profileId: string
  redirectUrl: string
  reconnectAccountId?: string | null
}): Promise<string> {
  const result = await request(
    "GET",
    `/connect/${encodeURIComponent(input.platform)}`,
    zConnectUrl,
    {
      query: {
        profileId: input.profileId,
        redirect_url: input.redirectUrl,
        reconnectAccountId: input.reconnectAccountId,
        welcome: true,
        brandName: "LeadMaker",
      },
    },
  )
  return result.authUrl
}

/** A single-use link the client opens to connect their own account. */
export async function createInvite(input: {
  platform: string
  profileId: string
  accountId?: string | null
  expiresInDays?: number
}): Promise<{ url: string; expiresAt: string | null }> {
  const result = await request("POST", "/platform-invites", zInvite, {
    body: {
      profileId: input.profileId,
      platform: input.platform,
      ...(input.accountId ? { accountId: input.accountId } : {}),
      expiresInDays: input.expiresInDays ?? 7,
    },
  })
  return { url: result.invite.inviteUrl, expiresAt: result.invite.expiresAt ?? null }
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/** Every account (of one profile, or of the whole team), following the cursor. */
export async function listAccounts(profileId?: string): Promise<ZernioAccount[]> {
  const all: ZernioAccount[] = []
  let cursor: string | null | undefined
  for (let page = 0; page < 50; page++) {
    const result = await request("GET", "/accounts", zAccountsList, {
      query: { profileId, limit: 500, cursor },
    })
    all.push(...result.accounts)
    cursor = result.pagination?.nextCursor
    if (!cursor) break
  }
  return all
}

export async function accountsHealth(profileId?: string): Promise<ZernioAccountHealth[]> {
  const result = await request("GET", "/accounts/health", zHealthList, { query: { profileId } })
  return result.accounts
}

/** Disconnects an account. Zernio keeps it for an hour so a reconnect can restore it. */
export async function deleteAccount(accountId: string): Promise<{ graceEndsAt: string | null }> {
  try {
    const result = await request(
      "DELETE",
      `/accounts/${encodeURIComponent(accountId)}`,
      zDisconnect,
    )
    return { graceEndsAt: result.gracePeriodEndsAt ?? null }
  } catch (error) {
    if (error instanceof ZernioError && error.status === 404) return { graceEndsAt: null }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENTS = [
  "account.connected",
  "account.disconnected",
  "account.permissions_changed",
] as const

export async function listWebhooks(): Promise<ZernioWebhook[]> {
  const result = await request("GET", "/webhooks/settings", zWebhooksList)
  return result.webhooks
}

/** Creates the LeadMaker webhook, or updates the one already pointing at this URL. */
export async function saveWebhook(url: string, secret: string): Promise<ZernioWebhook | null> {
  const existing = (await listWebhooks()).find((w) => w.url === url)
  const body = { name: "LeadMaker", url, secret, events: [...WEBHOOK_EVENTS], isActive: true }
  const result = existing
    ? await request("PUT", "/webhooks/settings", zWebhookSaved, {
        body: { webhookId: existing._id, ...body },
      })
    : await request("POST", "/webhooks/settings", zWebhookSaved, { body })
  return result.webhook ?? null
}

export async function testWebhook(webhookId: string) {
  await request("POST", "/webhooks/test", zDisconnect, { body: { webhookId } })
}
