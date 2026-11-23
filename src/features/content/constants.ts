import type { Tone } from "@/components/common/status"
import type { SocialPlatform } from "@/features/connections/constants"
import type { Database } from "@/lib/supabase/database.types"

export type ContentStatus = Database["public"]["Enums"]["content_status"]
export type TargetStatus = Database["public"]["Enums"]["content_target_status"]
export type MediaKind = Database["public"]["Enums"]["content_media_kind"]
export type PostPlatform = Exclude<SocialPlatform, "wordpress">

export const TABS = ["calendar", "posts", "articles", "media", "settings"] as const
export type ContentTab = (typeof TABS)[number]
export const TAB_LABEL: Record<ContentTab, string> = {
  calendar: "Calendar",
  posts: "Posts",
  articles: "Articles",
  media: "Media",
  settings: "Settings",
}

export const STATUS_META: Record<ContentStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info" },
  publishing: { label: "Publishing", tone: "brand" },
  published: { label: "Published", tone: "success" },
  partial: { label: "Partly published", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
}

export const TARGET_META: Record<TargetStatus, { label: string; tone: Tone }> = {
  pending: { label: "Waiting", tone: "info" },
  publishing: { label: "Publishing", tone: "brand" },
  published: { label: "Published", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  deleted: { label: "Removed", tone: "neutral" },
}

/**
 * Posts that can still be edited (the writer); others show what went out. Kept here, not in a
 * "use client" file: a server page importing a value from one gets a reference, not the Set.
 */
export const EDITABLE_STATUSES: ReadonlySet<ContentStatus> = new Set<ContentStatus>(["draft", "cancelled", "scheduled"])

/** Post list status filters. */
export const POST_FILTERS = ["all", "draft", "scheduled", "published", "failed"] as const
export type PostFilter = (typeof POST_FILTERS)[number]
export const POST_FILTER_LABEL: Record<PostFilter, string> = {
  all: "All",
  draft: "Drafts",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Needs attention",
}
export const statusesFor = (f: PostFilter): ContentStatus[] | null =>
  f === "all"
    ? null
    : f === "scheduled"
      ? ["scheduled", "publishing"]
      : f === "published"
        ? ["published"]
        : f === "failed"
          ? ["failed", "partial"]
          : ["draft", "cancelled"]

// ---------------------------------------------------------------------------
// Platform rules (checked here first; Zernio's validate endpoint has the last word)
// ---------------------------------------------------------------------------

export type PlatformRule = {
  /** Text limit in characters. */
  limit: number
  /** Where the platform cuts the text with "see more" (the preview). */
  fold: number
  images: number
  videos: number
  documents: number
  /** Images and a video can't be mixed in one post. */
  noMix: boolean
  needsMedia: boolean
  needsVideo: boolean
  hint: string
}

export const PLATFORM_RULES: Record<PostPlatform, PlatformRule> = {
  googlebusiness: { limit: 1500, fold: 250, images: 1, videos: 0, documents: 0, noMix: true, needsMedia: false, needsVideo: false, hint: "One image at most, no video. A button can link to the site." },
  facebook: { limit: 63206, fold: 480, images: 10, videos: 1, documents: 0, noMix: true, needsMedia: false, needsVideo: false, hint: "Up to 10 images or one video." },
  instagram: { limit: 2200, fold: 125, images: 20, videos: 20, documents: 0, noMix: false, needsMedia: true, needsVideo: false, hint: "Needs an image or video. A single video becomes a Reel." },
  linkedin: { limit: 3000, fold: 210, images: 20, videos: 1, documents: 1, noMix: true, needsMedia: false, needsVideo: false, hint: "Up to 20 images, one video or one PDF." },
  youtube: { limit: 5000, fold: 150, images: 0, videos: 1, documents: 0, noMix: true, needsMedia: true, needsVideo: true, hint: "Needs exactly one video and a title. The text is the description." },
  twitter: { limit: 280, fold: 280, images: 4, videos: 1, documents: 0, noMix: true, needsMedia: false, needsVideo: false, hint: "Up to 4 images or one video. Posting costs from the Zernio balance." },
  tiktok: { limit: 2200, fold: 150, images: 35, videos: 1, documents: 0, noMix: true, needsMedia: true, needsVideo: false, hint: "Needs a video or photos." },
  pinterest: { limit: 500, fold: 100, images: 1, videos: 1, documents: 0, noMix: true, needsMedia: true, needsVideo: false, hint: "Needs one image or video, and a board." },
  threads: { limit: 500, fold: 500, images: 20, videos: 20, documents: 0, noMix: false, needsMedia: false, needsVideo: false, hint: "Up to 20 images or videos." },
}

export const CTA_TYPES = [
  { value: "LEARN_MORE", label: "Learn more" },
  { value: "BOOK", label: "Book" },
  { value: "ORDER", label: "Order online" },
  { value: "SHOP", label: "Buy" },
  { value: "SIGN_UP", label: "Sign up" },
  { value: "CALL", label: "Call now" },
] as const

export const TIKTOK_PRIVACY = [
  { value: "PUBLIC_TO_EVERYONE", label: "Everyone" },
  { value: "MUTUAL_FOLLOW_FRIENDS", label: "Friends" },
  { value: "FOLLOWER_OF_CREATOR", label: "Followers" },
  { value: "SELF_ONLY", label: "Only me" },
] as const

/** Options one account of a post can carry (content_post_targets.settings). */
export type TargetSettings = {
  contentType?: "feed" | "story" | "reel"
  title?: string
  visibility?: "public" | "unlisted" | "private"
  boardId?: string
  link?: string
  ctaType?: string
  ctaUrl?: string
  privacy?: string
  allowComments?: boolean
  consent?: boolean
}

export type MediaLite = { id: string; kind: MediaKind; mime: string; altText: string | null }

export type Issue = { level: "error" | "warning"; message: string }

export const textLength = (s: string) => [...s].length

const hasLink = (s: string) => /https?:\/\/\S+/i.test(s)

/** Problems with one account's version of a post, before anything is sent. */
export function checkTarget(
  platform: PostPlatform,
  text: string,
  media: MediaLite[],
  settings: TargetSettings,
): Issue[] {
  const rule = PLATFORM_RULES[platform]
  const issues: Issue[] = []
  const images = media.filter((m) => m.kind === "image").length
  const videos = media.filter((m) => m.kind === "video").length
  const docs = media.filter((m) => m.kind === "document").length
  const len = textLength(text)

  if (len > rule.limit) issues.push({ level: "error", message: `The text is ${len - rule.limit} characters over the ${rule.limit} limit.` })
  else if (len > rule.limit * 0.9) issues.push({ level: "warning", message: `The text is close to the ${rule.limit} character limit.` })
  if (!text.trim() && media.length === 0) issues.push({ level: "error", message: "Write something or add a file." })
  if (rule.needsMedia && media.length === 0) issues.push({ level: "error", message: "This platform needs an image or video." })
  if (rule.needsVideo && videos === 0) issues.push({ level: "error", message: "This platform needs a video." })
  if (images > rule.images) issues.push({ level: "error", message: rule.images === 0 ? "This platform doesn't take images." : `Up to ${rule.images} ${rule.images === 1 ? "image" : "images"}.` })
  if (videos > rule.videos) issues.push({ level: "error", message: rule.videos === 0 ? "This platform doesn't take videos." : `Up to ${rule.videos} ${rule.videos === 1 ? "video" : "videos"}.` })
  if (docs > rule.documents) issues.push({ level: "error", message: rule.documents === 0 ? "PDFs can only be posted to LinkedIn." : "One PDF at most." })
  if (rule.noMix && [images > 0, videos > 0, docs > 0].filter(Boolean).length > 1) {
    issues.push({ level: "error", message: "Use images, a video or a PDF here, not a mix." })
  }
  if (media.some((m) => m.kind === "image" && !m.altText)) {
    issues.push({ level: "warning", message: "An image has no alt text (Media tab)." })
  }

  if (platform === "youtube" && !settings.title?.trim()) issues.push({ level: "error", message: "Give the video a title." })
  if (platform === "youtube" && (settings.title?.length ?? 0) > 100) issues.push({ level: "error", message: "YouTube titles are 100 characters at most." })
  if (platform === "pinterest" && !settings.boardId?.trim()) issues.push({ level: "error", message: "Pick the board this Pin goes to." })
  if (platform === "pinterest" && settings.link && !/^https:\/\//.test(settings.link)) issues.push({ level: "error", message: "The Pin link must start with https://." })
  if (platform === "googlebusiness" && settings.ctaType && settings.ctaType !== "CALL" && !/^https:\/\//.test(settings.ctaUrl ?? "")) {
    issues.push({ level: "error", message: "The button needs a link starting with https://." })
  }
  if (platform === "tiktok" && !settings.consent) issues.push({ level: "error", message: "Tick the TikTok consent box." })
  if (platform === "instagram" && settings.contentType === "story" && media.length !== 1) {
    issues.push({ level: "error", message: "A story is one image or one video." })
  }
  if (platform === "twitter") {
    issues.push({ level: "warning", message: hasLink(text) ? "Posting to X with a link costs $0.20 from the Zernio balance." : "Posting to X costs $0.015 from the Zernio balance." })
  }
  return issues
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export const SEO_TITLE_MAX = 60
export const META_MAX = 155

export function slugify(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200)
    .replace(/-+$/g, "")
}

export const wordsOf = (html: string) => {
  const text = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim()
  return text ? text.split(" ").length : 0
}

/** Readiness checks for an article (warnings only; nothing blocks publishing). */
export function articleChecks(a: {
  title: string
  bodyHtml: string
  featured: boolean
  focusKeyword: string | null
  seoTitle: string | null
  metaDescription: string | null
}): { ok: boolean; label: string }[] {
  const words = wordsOf(a.bodyHtml)
  const kw = a.focusKeyword?.trim().toLowerCase()
  const firstPara = (/<p[^>]*>([\s\S]*?)<\/p>/i.exec(a.bodyHtml)?.[1] ?? "").replace(/<[^>]*>/g, "").toLowerCase()
  const imgs = [...a.bodyHtml.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
  const meta = a.metaDescription?.trim().length ?? 0
  return [
    { ok: a.title.trim().length > 0, label: "Has a title" },
    { ok: words >= 300, label: `300 words or more (${words} now)` },
    { ok: a.featured, label: "Has a featured image" },
    { ok: Boolean(kw && (a.title.toLowerCase().includes(kw) || firstPara.includes(kw))), label: "Focus keyword in the title or first paragraph" },
    { ok: (a.seoTitle?.trim().length ?? 0) > 0 && (a.seoTitle?.length ?? 0) <= SEO_TITLE_MAX, label: `SEO title of ${SEO_TITLE_MAX} characters or fewer` },
    { ok: meta >= 70 && meta <= META_MAX, label: `Meta description of 70 to ${META_MAX} characters` },
    { ok: imgs.every((i) => /\balt\s*=\s*"[^"]+"/i.test(i)), label: "Every image has alt text" },
    { ok: !/href\s*=\s*"http:\/\//i.test(a.bodyHtml), label: "No links to http:// pages" },
  ]
}
