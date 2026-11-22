import type { ZernioMediaItem, ZernioPlatformEntry, ZernioPostBody } from "@/lib/zernio/content"
import type { PostPlatform, TargetSettings } from "./constants"
import { wallClock } from "./time"

/**
 * Builds Zernio's POST /v1/posts body from our post (pure, so it can be checked without
 * Zernio). Field names follow docs/plans/content/02-zernio-api.md.
 */

export type BodyTarget = {
  zernioAccountId: string
  platform: PostPlatform
  customContent: string | null
  customMediaIds: string[] | null
  settings: TargetSettings
}

export type BodyMedia = { kind: "image" | "video" | "document"; url: string; altText: string | null }

export function platformData(platform: PostPlatform, s: TargetSettings): Record<string, unknown> | undefined {
  const d: Record<string, unknown> = {}
  if (platform === "instagram" && s.contentType === "story") d.contentType = "story"
  if (platform === "facebook" && s.contentType === "reel") d.contentType = "reel"
  if (platform === "facebook" && s.contentType === "story") d.contentType = "story"
  if (platform === "youtube") {
    if (s.title?.trim()) d.title = s.title.trim().slice(0, 100)
    d.visibility = s.visibility ?? "public"
  }
  if (platform === "pinterest") {
    if (s.boardId?.trim()) d.boardId = s.boardId.trim()
    if (s.title?.trim()) d.title = s.title.trim().slice(0, 100)
    if (s.link?.trim()) d.link = s.link.trim()
  }
  if (platform === "googlebusiness" && s.ctaType) {
    d.callToAction = s.ctaType === "CALL" ? { type: "CALL" } : { type: s.ctaType, url: s.ctaUrl?.trim() }
  }
  return Object.keys(d).length ? d : undefined
}

const item = (m: BodyMedia): ZernioMediaItem => ({
  type: m.kind,
  url: m.url,
  ...(m.altText ? { altText: m.altText.slice(0, 500) } : {}),
})

export function buildPostBody(input: {
  postId: string
  clientId: string
  content: string
  mediaIds: string[]
  targets: BodyTarget[]
  media: Map<string, BodyMedia>
  timezone: string
  /** UTC instant, or null to publish now. */
  scheduledFor: string | null
}): ZernioPostBody {
  const pick = (ids: string[]) => ids.map((id) => input.media.get(id)).filter((m): m is BodyMedia => Boolean(m)).map(item)

  const platforms: ZernioPlatformEntry[] = input.targets.map((t) => {
    const entry: ZernioPlatformEntry = { platform: t.platform, accountId: t.zernioAccountId }
    if (t.customContent !== null && t.customContent !== input.content) entry.customContent = t.customContent
    if (t.customMediaIds) entry.customMedia = pick(t.customMediaIds)
    const data = platformData(t.platform, t.settings)
    if (data) entry.platformSpecificData = data
    return entry
  })

  const body: ZernioPostBody = {
    content: input.content,
    platforms,
    metadata: { content_post_id: input.postId, client_id: input.clientId },
    externalId: input.postId,
  }
  const media = pick(input.mediaIds)
  if (media.length) body.mediaItems = media

  const tiktok = input.targets.find((t) => t.platform === "tiktok")
  if (tiktok) {
    body.tiktokSettings = {
      privacy_level: tiktok.settings.privacy ?? "PUBLIC_TO_EVERYONE",
      allow_comment: tiktok.settings.allowComments ?? true,
      allow_duet: false,
      allow_stitch: false,
      content_preview_confirmed: Boolean(tiktok.settings.consent),
      express_consent_given: Boolean(tiktok.settings.consent),
    }
  }

  if (input.scheduledFor) {
    body.scheduledFor = wallClock(input.scheduledFor, input.timezone)
    body.timezone = input.timezone
  } else {
    body.publishNow = true
  }
  return body
}

/** The Idempotency-Key for one version of a post or article. */
export const sendKey = (kind: "post" | "article", id: string, version: number, action = "send") =>
  `lm-${kind}-${id}-v${version}-${action}`
