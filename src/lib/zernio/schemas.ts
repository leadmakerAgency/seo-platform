import { z } from "zod"

/**
 * Zernio response shapes, parsed loosely: unknown fields pass through (Zernio
 * adds fields often), missing required ones fail loudly at the boundary.
 */

const str = z.string()
const optStr = z.string().nullish()

export const zProfile = z.looseObject({
  _id: str,
  name: optStr,
  externalId: optStr,
})
export const zProfilesList = z.looseObject({ profiles: z.array(zProfile) })
export const zProfileCreated = z.looseObject({ profile: zProfile })

export const zAccount = z.looseObject({
  _id: str,
  platform: str,
  profileId: z.union([str, z.looseObject({ _id: str })]).nullish(),
  username: optStr,
  displayName: optStr,
  platformUserId: optStr,
  profilePicture: optStr,
  profileUrl: optStr,
  isActive: z.boolean().nullish(),
  needsReconnection: z.boolean().nullish(),
  enabled: z.boolean().nullish(),
  selectedLocationId: optStr,
  selectedLocationName: optStr,
  metadata: z.record(z.string(), z.unknown()).nullish(),
})
export type ZernioAccount = z.infer<typeof zAccount>

export const zAccountsList = z.looseObject({
  accounts: z.array(zAccount),
  pagination: z.looseObject({ nextCursor: optStr }).nullish(),
})

export const zAccountHealth = z.looseObject({
  accountId: str,
  platform: optStr,
  profileId: optStr,
  status: optStr,
  canPost: z.boolean().nullish(),
  canFetchAnalytics: z.boolean().nullish(),
  tokenValid: z.boolean().nullish(),
  tokenExpiresAt: optStr,
  needsReconnect: z.boolean().nullish(),
  issues: z.array(z.string()).nullish(),
  disconnectReason: optStr,
  unhealthySince: optStr,
})
export type ZernioAccountHealth = z.infer<typeof zAccountHealth>
export const zHealthList = z.looseObject({ accounts: z.array(zAccountHealth) })

export const zConnectUrl = z.looseObject({ authUrl: z.url() })

export const zInvite = z.looseObject({
  invite: z.looseObject({ inviteUrl: z.url(), expiresAt: optStr, _id: optStr }),
})

export const zDisconnect = z.looseObject({ gracePeriodEndsAt: optStr, message: optStr })

export const zWebhook = z.looseObject({
  _id: str,
  name: optStr,
  url: str,
  events: z.array(str).nullish(),
  isActive: z.boolean().nullish(),
  failureCount: z.number().nullish(),
  lastFiredAt: optStr,
})
export type ZernioWebhook = z.infer<typeof zWebhook>
export const zWebhooksList = z.looseObject({ webhooks: z.array(zWebhook) })
export const zWebhookSaved = z.looseObject({ webhook: zWebhook.nullish() })

export const zErrorBody = z.looseObject({
  error: optStr,
  type: optStr,
  code: optStr,
  dashboard_url: optStr,
  details: z.record(z.string(), z.unknown()).nullish(),
})

/** The envelope every webhook delivery shares. */
export const zWebhookEnvelope = z.looseObject({
  id: z.string().min(1).max(200),
  event: z.string().min(1).max(100),
  timestamp: optStr,
  test: z.boolean().nullish(),
  profiles: z.array(z.looseObject({ id: str, externalId: optStr })).nullish(),
  account: z.looseObject({ accountId: optStr, profileId: optStr, platform: optStr }).nullish(),
})
export type ZernioWebhookEnvelope = z.infer<typeof zWebhookEnvelope>
