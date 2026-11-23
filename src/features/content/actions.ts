"use server"

import { refresh } from "next/cache"

import { ensureZernioProfile } from "@/features/connections/profile"
import { syncClient, type Db } from "@/features/connections/sync"
import type { ActionResult } from "@/features/tasks/schemas"
import { PermissionError, requirePermission, type CurrentMember } from "@/lib/auth"
import { hasZernioApiKey } from "@/lib/env.server"
import type { Permission } from "@/lib/roles"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import type { Json } from "@/lib/supabase/database.types"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { ZernioError } from "@/lib/zernio/client"
import {
  connectWordPressToken,
  createArticle,
  createPost,
  deleteArticle,
  deletePost as zernioDeletePost,
  editPublished,
  findArticleByHandle,
  listBlogs,
  retryPost as zernioRetryPost,
  unpublishPost,
  updateArticle,
  updatePost,
  validatePost,
  type ArticleBody,
} from "@/lib/zernio/content"
import { issueText } from "@/lib/zernio/content-schemas"
import { buildPostBody, sendKey, type BodyTarget } from "./body"
import { checkTarget, slugify, type Issue, type MediaLite, type PostPlatform, type TargetSettings } from "./constants"
import { cleanArticleHtml, htmlToText } from "./sanitize"
import { articleStatusOf, pushMediaToZernio, setupWordPress, storeArticle, storePost, zernioProblem } from "./server"

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

type Ctx = { member: CurrentMember; db: Db }

async function guard(permission: Permission): Promise<Ctx | { error: string }> {
  try {
    const member = await requirePermission(permission)
    return { member, db: (await createSupabaseServerClient()) as unknown as Db }
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message }
    throw error
  }
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)
const NOT_SET_UP = "Zernio isn't set up yet. An admin needs to add ZERNIO_API_KEY."
const NO_SERVICE = "The server is missing SUPABASE_SECRET_KEY, so it can't record what Zernio says."

/** Postgres raise messages are written for people; other errors aren't. */
const dbMessage = (e: { message: string; code?: string } | null, fallback: string) =>
  e && (e.code === "P0001" || e.code === "22023" || e.code === "42501") ? e.message : fallback

const admin = () => createSupabaseAdminClient() as unknown as Db

function ready(): string | null {
  if (!hasZernioApiKey()) return NOT_SET_UP
  if (!hasSupabaseSecretKey()) return NO_SERVICE
  return null
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export type PostInput = {
  id?: string | null
  title?: string | null
  content: string
  mediaIds: string[]
  scheduledFor: string | null
  timezone: string
  targets: {
    socialAccountId: string
    customContent: string | null
    customMediaIds: string[] | null
    settings: TargetSettings
  }[]
}

const cleanSettings = (s: TargetSettings): TargetSettings => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s ?? {})) {
    if (v === undefined || v === null || v === "") continue
    out[k] = typeof v === "string" ? v.slice(0, 500) : v
  }
  return out as TargetSettings
}

/** Saves the post. A scheduled post's changes go to Zernio straight away. */
export async function savePost(
  clientId: string,
  input: PostInput,
): Promise<ActionResult<{ id: string; version: number; warning?: string }>> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }

  const { data, error } = await g.db.rpc("save_content_post", {
    p_client_id: clientId,
    p: {
      id: input.id ?? null,
      title: input.title ?? null,
      content: input.content ?? "",
      media_ids: input.mediaIds ?? [],
      scheduled_for: input.scheduledFor,
      timezone: input.timezone,
      targets: (input.targets ?? []).map((t) => ({
        social_account_id: t.socialAccountId,
        custom_content: t.customContent,
        custom_media_ids: t.customMediaIds,
        settings: cleanSettings(t.settings),
      })),
    } as unknown as Json,
  })
  if (error) return { ok: false, error: dbMessage(error, "Couldn't save the post. Try again.") }
  const saved = data as { id: string; version: number; status: string }

  if (saved.status === "scheduled") {
    const sent = await sendPost(g, saved.id, "update")
    refresh()
    if (!sent.ok) {
      return { ok: true, data: { id: saved.id, version: saved.version, warning: `Saved here, but Zernio still has the old version: ${sent.error}` } }
    }
  } else refresh()
  return { ok: true, data: { id: saved.id, version: saved.version } }
}

type LoadedPost = {
  id: string
  client_id: string
  content: string
  media_ids: string[]
  status: string
  scheduled_for: string | null
  timezone: string | null
  zernio_post_id: string | null
  version: number
  targets: {
    zernio_account_id: string
    platform: string
    custom_content: string | null
    custom_media_ids: string[] | null
    settings: unknown
    account: { status: string; can_post: boolean | null } | null
  }[]
}

/** The post as the signed-in person can see it (RLS), with its accounts. */
async function loadPost(db: Db, postId: string): Promise<LoadedPost | null> {
  const { data } = await db
    .from("content_posts")
    .select(
      "id, client_id, content, media_ids, status, scheduled_for, timezone, zernio_post_id, version, targets:content_post_targets(zernio_account_id, platform, custom_content, custom_media_ids, settings, account:social_accounts(status, can_post))",
    )
    .eq("id", postId)
    .maybeSingle()
  return (data as unknown as LoadedPost) ?? null
}

async function localIssues(db: Db, post: LoadedPost): Promise<string[]> {
  const ids = [...new Set([...post.media_ids, ...post.targets.flatMap((t) => t.custom_media_ids ?? [])])]
  const { data: media } = ids.length
    ? await db.from("content_media").select("id, kind, mime, alt_text").in("id", ids)
    : { data: [] as { id: string; kind: MediaLite["kind"]; mime: string; alt_text: string | null }[] }
  const byId = new Map((media ?? []).map((m) => [m.id, { id: m.id, kind: m.kind, mime: m.mime, altText: m.alt_text }]))
  const problems: string[] = []
  if (!post.targets.length) problems.push("Pick at least one account.")
  for (const t of post.targets) {
    const label = t.platform
    if (t.account?.status !== "connected") problems.push(`${label}: the account needs reconnecting in Connections.`)
    const items = (t.custom_media_ids ?? post.media_ids).map((id) => byId.get(id)).filter((m): m is MediaLite => Boolean(m))
    const issues: Issue[] = checkTarget(t.platform as PostPlatform, t.custom_content ?? post.content, items, (t.settings ?? {}) as TargetSettings)
    for (const i of issues) if (i.level === "error") problems.push(`${label}: ${i.message}`)
  }
  return problems
}

async function bodyFor(post: LoadedPost, scheduledFor: string | null) {
  const ids = [...post.media_ids, ...post.targets.flatMap((t) => t.custom_media_ids ?? [])]
  const media = await pushMediaToZernio(admin(), ids)
  const targets: BodyTarget[] = post.targets.map((t) => ({
    zernioAccountId: t.zernio_account_id,
    platform: t.platform as PostPlatform,
    customContent: t.custom_content,
    customMediaIds: t.custom_media_ids,
    settings: (t.settings ?? {}) as TargetSettings,
  }))
  return buildPostBody({
    postId: post.id,
    clientId: post.client_id,
    content: post.content,
    mediaIds: post.media_ids,
    targets,
    media,
    timezone: post.timezone ?? "America/Phoenix",
    scheduledFor,
  })
}

/**
 * Sends a post to Zernio: "schedule" (at its time), "now" (publish now) or "update"
 * (a scheduled post's edit). One send at a time per post (content_claim_send).
 */
async function sendPost(g: Ctx, postId: string, mode: "schedule" | "now" | "update"): Promise<ActionResult<{ status: string }>> {
  const problem = ready()
  if (problem) return { ok: false, error: problem }
  const post = await loadPost(g.db, postId)
  if (!post) return { ok: false, error: "Unknown post." }

  if (mode === "update" && post.status !== "scheduled") return { ok: false, error: "Only a scheduled post can be updated." }
  if (mode !== "update" && !["draft", "scheduled", "failed"].includes(post.status)) {
    return { ok: false, error: "This post has already gone out." }
  }
  if (mode === "schedule" || mode === "update") {
    if (!post.scheduled_for) return { ok: false, error: "Pick a date and time first." }
    if (Date.parse(post.scheduled_for) < Date.now() + 2 * 60 * 1000) return { ok: false, error: "Pick a time at least 2 minutes from now, or publish now." }
  }
  const problems = await localIssues(g.db, post)
  if (problems.length) return { ok: false, error: problems.slice(0, 4).join(" ") }

  const db = admin()
  const { data: claim } = await db.rpc("content_claim_send", { p_kind: "post", p_id: postId })
  const c = claim as { ok: boolean; version: number | null } | null
  if (!c?.ok || !c.version) return { ok: false, error: "This post is being sent right now. Give it a moment." }
  const version = c.version
  const actor = g.member.id

  try {
    const body = await bodyFor(post, mode === "now" ? null : post.scheduled_for)
    // Zernio's own check first (free): a refusal stops here with its words, nothing half-sent.
    const check = await validatePost(body).catch((e) => {
      console.warn("[content] Zernio validation unavailable, sending anyway", e instanceof Error ? e.message : e)
      return null
    })
    const refused = (check?.errors ?? []).map(issueText).filter(Boolean)
    if (refused.length) {
      const message = `Zernio found ${refused.length === 1 ? "a problem" : "problems"}: ${refused.slice(0, 4).join(" · ")}`
      await storePost(db, postId, null, { release: true, error: message.slice(0, 1000), actor })
      refresh()
      return { ok: false, error: message }
    }
    let result
    if (mode === "update" && post.zernio_post_id) {
      result = await updatePost(post.zernio_post_id, body, sendKey("post", postId, version, "update"))
    } else {
      // Publishing a post that was scheduled: take the scheduled one down first.
      if (post.zernio_post_id && post.status === "scheduled") await zernioDeletePost(post.zernio_post_id)
      result = await createPost(body, sendKey("post", postId, version, mode))
    }
    await storePost(db, postId, result, {
      release: true,
      sent_version: version,
      force: true,
      actor,
      ...(mode === "now" ? { scheduled_for: null } : {}),
      ...(mode === "now" && !result.status ? { status: "publishing" } : {}),
    })
    refresh()
    return { ok: true, data: { status: result.status ?? "scheduled" } }
  } catch (error) {
    const message = zernioProblem(error)
    // A failed publish-now is a failed post; a refused schedule leaves the draft as it was.
    const failed = mode === "now" && !(error instanceof ZernioError && error.status >= 400 && error.status < 500)
    await storePost(db, postId, null, { release: true, error: message, actor, ...(failed ? { status: "failed", force: true } : {}) })
    console.error("[content] sending a post failed", postId, error)
    refresh()
    return { ok: false, error: message }
  }
}

export async function schedulePost(postId: string, mode: "schedule" | "now"): Promise<ActionResult<{ status: string }>> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(postId)) return { ok: false, error: "Unknown post." }
  return sendPost(g, postId, mode)
}

/** Zernio's own check of the post (limits, media, platform rules). Nothing is posted. */
export async function checkPost(postId: string): Promise<ActionResult<{ errors: string[]; warnings: string[] }>> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const problem = ready()
  if (problem) return { ok: false, error: problem }
  const post = isUuid(postId) ? await loadPost(g.db, postId) : null
  if (!post) return { ok: false, error: "Save the post first." }
  const local = await localIssues(g.db, post)
  if (local.length) return { ok: true, data: { errors: local, warnings: [] } }
  try {
    const when = post.scheduled_for && Date.parse(post.scheduled_for) > Date.now() ? post.scheduled_for : null
    const v = await validatePost(await bodyFor(post, when))
    return { ok: true, data: { errors: (v.errors ?? []).map(issueText), warnings: (v.warnings ?? []).map(issueText) } }
  } catch (error) {
    return { ok: false, error: zernioProblem(error) }
  }
}

export async function cancelPost(postId: string): Promise<ActionResult> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const problem = ready()
  if (problem) return { ok: false, error: problem }
  const post = isUuid(postId) ? await loadPost(g.db, postId) : null
  if (!post) return { ok: false, error: "Unknown post." }
  if (post.status !== "scheduled") return { ok: false, error: "Only a scheduled post can be cancelled." }
  try {
    if (post.zernio_post_id) await zernioDeletePost(post.zernio_post_id)
    await storePost(admin(), postId, null, { status: "cancelled", force: true, release: true, actor: g.member.id, error: "" })
    refresh()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: zernioProblem(error) }
  }
}

export async function retryFailedPost(postId: string): Promise<ActionResult> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const problem = ready()
  if (problem) return { ok: false, error: problem }
  const post = isUuid(postId) ? await loadPost(g.db, postId) : null
  if (!post?.zernio_post_id) return { ok: false, error: "Unknown post." }
  if (!["failed", "partial"].includes(post.status)) return { ok: false, error: "Only a failed post can be tried again." }
  const db = admin()
  const { data: claim } = await db.rpc("content_claim_send", { p_kind: "post", p_id: postId })
  if (!(claim as { ok: boolean } | null)?.ok) return { ok: false, error: "This post is being sent right now." }
  try {
    const minute = Math.floor(Date.now() / 60_000)
    const result = await zernioRetryPost(post.zernio_post_id, sendKey("post", postId, post.version, `retry-${minute}`))
    await storePost(db, postId, result, { retry: true, force: true, release: true, actor: g.member.id, event: "retried", error: "" })
    refresh()
    return { ok: true }
  } catch (error) {
    await storePost(db, postId, null, { release: true })
    return { ok: false, error: zernioProblem(error) }
  }
}

async function loadTarget(db: Db, targetId: string) {
  const { data } = await db
    .from("content_post_targets")
    .select("id, post_id, zernio_account_id, platform, status, post:content_posts(id, zernio_post_id, status)")
    .eq("id", targetId)
    .maybeSingle()
  return data as unknown as {
    id: string
    post_id: string
    zernio_account_id: string
    platform: string
    status: string
    post: { id: string; zernio_post_id: string | null; status: string } | null
  } | null
}

/** Changes the text of a published post on one platform (Zernio says where that's allowed). */
export async function editPublishedText(targetId: string, text: string): Promise<ActionResult> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const problem = ready()
  if (problem) return { ok: false, error: problem }
  const t = isUuid(targetId) ? await loadTarget(g.db, targetId) : null
  if (!t?.post?.zernio_post_id || t.status !== "published") return { ok: false, error: "Only a published post can be edited." }
  if (!text.trim() || text.length > 63206) return { ok: false, error: "Write the new text." }
  try {
    await editPublished(t.post.zernio_post_id, { platform: t.platform, accountId: t.zernio_account_id, content: text })
    const db = admin()
    await db.from("content_post_targets").update({ custom_content: text, updated_at: new Date().toISOString() }).eq("id", t.id)
    await db.from("content_events").insert({
      client_id: (await db.from("content_posts").select("client_id").eq("id", t.post_id).single()).data!.client_id,
      post_id: t.post_id,
      kind: "edited",
      actor_id: g.member.id,
      detail: { platform: t.platform, published: true },
    })
    refresh()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: zernioProblem(error) }
  }
}

/** Takes the post down from one platform. */
export async function unpublishTarget(targetId: string): Promise<ActionResult> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const problem = ready()
  if (problem) return { ok: false, error: problem }
  const t = isUuid(targetId) ? await loadTarget(g.db, targetId) : null
  if (!t?.post?.zernio_post_id || t.status !== "published") return { ok: false, error: "Only a published post can be taken down." }
  try {
    await unpublishPost(t.post.zernio_post_id, { platform: t.platform, accountId: t.zernio_account_id })
    await storePost(admin(), t.post_id, null, {
      platforms: [{ accountId: t.zernio_account_id, status: "deleted" }],
      force: true,
      actor: g.member.id,
      event: "unpublished",
      detail: { platform: t.platform },
    })
    refresh()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: zernioProblem(error) }
  }
}

export async function duplicatePost(postId: string): Promise<ActionResult<{ id: string }>> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const { data: p } = isUuid(postId)
    ? await g.db
        .from("content_posts")
        .select("client_id, title, content, media_ids, timezone, targets:content_post_targets(social_account_id, custom_content, custom_media_ids, settings)")
        .eq("id", postId)
        .maybeSingle()
    : { data: null }
  if (!p) return { ok: false, error: "Unknown post." }
  const { data: accounts } = await g.db.from("social_accounts").select("id").eq("client_id", p.client_id).neq("status", "removed")
  const live = new Set((accounts ?? []).map((a) => a.id))
  const { data, error } = await g.db.rpc("save_content_post", {
    p_client_id: p.client_id,
    p: {
      title: p.title ? `${p.title} (copy)`.slice(0, 120) : null,
      content: p.content,
      media_ids: p.media_ids,
      timezone: p.timezone,
      targets: (p.targets ?? [])
        .filter((t) => t.social_account_id && live.has(t.social_account_id))
        .map((t) => ({ social_account_id: t.social_account_id, custom_content: t.custom_content, custom_media_ids: t.custom_media_ids, settings: t.settings })),
    } as unknown as Json,
  })
  if (error) return { ok: false, error: dbMessage(error, "Couldn't copy the post.") }
  refresh()
  return { ok: true, data: { id: (data as { id: string }).id } }
}

export async function deletePost(postId: string): Promise<ActionResult> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const post = isUuid(postId) ? await loadPost(g.db, postId) : null
  if (!post) return { ok: false, error: "Unknown post." }
  if (post.status === "failed" && post.zernio_post_id && hasZernioApiKey()) {
    try {
      await zernioDeletePost(post.zernio_post_id)
    } catch (error) {
      return { ok: false, error: zernioProblem(error) }
    }
  }
  const { error } = await g.db.rpc("delete_content_post", { p_id: postId })
  if (error) return { ok: false, error: dbMessage(error, "Couldn't delete the post.") }
  refresh()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export async function recordMedia(
  clientId: string,
  input: {
    id: string
    storagePath: string
    fileName: string
    mime: string
    bytes: number
    width?: number | null
    height?: number | null
    durationS?: number | null
    thumbPath?: string | null
  },
): Promise<ActionResult<{ id: string }>> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const { data, error } = await g.db.rpc("save_content_media", {
    p_client_id: clientId,
    p: {
      id: input.id,
      storage_path: input.storagePath,
      file_name: input.fileName,
      mime: input.mime,
      bytes: input.bytes,
      width: input.width ?? null,
      height: input.height ?? null,
      duration_s: input.durationS ?? null,
      thumb_path: input.thumbPath ?? null,
    },
  })
  if (error) return { ok: false, error: dbMessage(error, "Couldn't save the file. Try again.") }
  refresh()
  return { ok: true, data: { id: data as string } }
}

export async function updateMedia(clientId: string, id: string, input: { altText?: string; title?: string }): Promise<ActionResult> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const p: Record<string, string> = { id }
  if (input.altText !== undefined) p.alt_text = input.altText
  if (input.title !== undefined) p.title = input.title
  const { error } = await g.db.rpc("save_content_media", { p_client_id: clientId, p })
  if (error) return { ok: false, error: dbMessage(error, "Couldn't save.") }
  refresh()
  return { ok: true }
}

export async function deleteMedia(id: string): Promise<ActionResult> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const { data, error } = await g.db.rpc("delete_content_media", { p_id: id })
  if (error) return { ok: false, error: dbMessage(error, "Couldn't delete the file.") }
  const paths = (data as string[] | null) ?? []
  if (paths.length) await g.db.storage.from("content-media").remove(paths)
  refresh()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export type ArticleInput = {
  id?: string | null
  title: string
  slug: string | null
  bodyHtml: string
  excerpt: string | null
  tags: string[]
  featuredMediaId: string | null
  seoTitle: string | null
  metaDescription: string | null
  focusKeyword: string | null
  keywordId: string | null
  topic: string | null
  author: string | null
  publishAt: string | null
}

export async function saveArticle(
  clientId: string,
  input: ArticleInput,
): Promise<ActionResult<{ id: string; version: number; status: string }>> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const slug = input.slug?.trim() ? slugify(input.slug) : input.title.trim() ? slugify(input.title) : null
  const { data, error } = await g.db.rpc("save_content_article", {
    p_client_id: clientId,
    p: {
      id: input.id ?? null,
      title: input.title ?? "",
      slug: slug || null,
      body_html: cleanArticleHtml(input.bodyHtml ?? ""),
      excerpt: input.excerpt,
      tags: input.tags ?? [],
      featured_media_id: input.featuredMediaId,
      seo_title: input.seoTitle,
      meta_description: input.metaDescription,
      focus_keyword: input.focusKeyword,
      keyword_id: input.keywordId,
      topic: input.topic,
      author: input.author,
      publish_at: input.publishAt,
    } as unknown as Json,
  })
  if (error) return { ok: false, error: dbMessage(error, "Couldn't save the article. Try again.") }
  return { ok: true, data: data as { id: string; version: number; status: string } }
}

type LoadedArticle = {
  id: string
  client_id: string
  title: string
  slug: string | null
  body_html: string
  excerpt: string | null
  tags: string[]
  author: string | null
  status: string
  publish_at: string | null
  version: number
  wp_account_id: string | null
  wp_blog_id: string | null
  wp_article_id: string | null
  featured: { storage_path: string; bytes: number } | null
}

async function loadArticle(db: Db, id: string): Promise<LoadedArticle | null> {
  const { data } = await db
    .from("content_articles")
    .select(
      "id, client_id, title, slug, body_html, excerpt, tags, author, status, publish_at, version, wp_account_id, wp_blog_id, wp_article_id, featured:content_media!content_articles_featured_media_id_fkey(storage_path, bytes)",
    )
    .eq("id", id)
    .maybeSingle()
  return (data as unknown as LoadedArticle) ?? null
}

/** The WordPress site and blog the article goes to (its own, else the client's settings). */
async function wordpressOf(db: Db, a: LoadedArticle) {
  const { data: s } = await db
    .from("content_settings")
    .select("wp_account_id, wp_blog_id, wp_default_author")
    .eq("client_id", a.client_id)
    .maybeSingle()
  const accountRow = a.wp_account_id ?? s?.wp_account_id ?? null
  const blogId = a.wp_blog_id ?? s?.wp_blog_id ?? null
  if (!accountRow || !blogId) return null
  const { data: acc } = await db
    .from("social_accounts")
    .select("id, zernio_account_id, status")
    .eq("id", accountRow)
    .maybeSingle()
  if (!acc) return null
  return { rowId: acc.id, accountId: acc.zernio_account_id, status: acc.status, blogId, defaultAuthor: s?.wp_default_author ?? null }
}

async function articleBody(a: LoadedArticle, author: string | null): Promise<ArticleBody> {
  const body: ArticleBody = {
    title: a.title.trim() || "Untitled",
    bodyHtml: cleanArticleHtml(a.body_html),
    ...(a.slug ? { handle: a.slug } : {}),
    ...(a.tags.length ? { tags: a.tags } : {}),
    ...(a.excerpt?.trim() ? { excerpt: a.excerpt.trim() } : { excerpt: htmlToText(a.body_html).slice(0, 300) }),
    ...(author ? { author } : {}),
  }
  if (a.featured) {
    if (a.featured.bytes > 10 * 1024 * 1024) throw new Error("WordPress takes featured images up to 10 MB. Pick a smaller one.")
    const { data } = await admin().storage.from("content-media").createSignedUrl(a.featured.storage_path, 60 * 60)
    if (data?.signedUrl) body.image = { url: data.signedUrl }
  }
  return body
}

/** Sends the article to WordPress: published now, or scheduled for its time (WordPress publishes it). */
export async function publishArticle(articleId: string, mode: "now" | "schedule"): Promise<ActionResult<{ status: string; url: string | null }>> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const problem = ready()
  if (problem) return { ok: false, error: problem }
  const a = isUuid(articleId) ? await loadArticle(g.db, articleId) : null
  if (!a) return { ok: false, error: "Unknown article." }
  if (!a.title.trim()) return { ok: false, error: "Give the article a title first." }
  if (!["draft", "failed", "scheduled", "cancelled"].includes(a.status)) {
    return { ok: false, error: "This article is already published. Use Update on WordPress." }
  }
  if (mode === "schedule" && (!a.publish_at || Date.parse(a.publish_at) < Date.now() + 2 * 60 * 1000)) {
    return { ok: false, error: "Pick a publish time at least 2 minutes from now." }
  }
  const wp = await wordpressOf(g.db, a)
  if (!wp) return { ok: false, error: "Connect the client's WordPress site in Connections and pick its blog in Content settings first." }
  if (wp.status !== "connected") return { ok: false, error: "The WordPress site needs reconnecting in Connections." }

  const db = admin()
  const { data: claim } = await db.rpc("content_claim_send", { p_kind: "article", p_id: articleId })
  const c = claim as { ok: boolean; version: number | null } | null
  if (!c?.ok || !c.version) return { ok: false, error: "This article is being sent right now. Give it a moment." }
  const base = { release: true, actor: g.member.id, wp_account_id: wp.rowId, wp_blog_id: wp.blogId, sent_version: c.version, force: true }

  try {
    const body = await articleBody(a, a.author ?? wp.defaultAuthor)
    body.isPublished = true
    if (mode === "schedule") body.publishDate = new Date(a.publish_at!).toISOString()
    // Already on WordPress (scheduled before, or a retry): update instead of a second copy.
    const res = a.wp_article_id
      ? await updateArticle(wp.accountId, wp.blogId, a.wp_article_id, body)
      : await createArticle(wp.accountId, wp.blogId, body, sendKey("article", articleId, c.version, mode))
    const status = articleStatusOf(res.status, mode === "schedule") ?? (mode === "schedule" ? "scheduled" : "published")
    await storeArticle(db, articleId, {
      ...base,
      status,
      wp_article_id: res.id ?? a.wp_article_id,
      wp_url: res.url,
      wp_status: res.status,
      ...(mode === "now" ? { publish_at: null } : {}),
      error: "",
    })
    refresh()
    return { ok: true, data: { status, url: res.url } }
  } catch (error) {
    // A 502 can mean WordPress saved it anyway: look for it by its slug.
    if (error instanceof ZernioError && error.status === 502 && a.slug && !a.wp_article_id) {
      const found = await findArticleByHandle(wp.accountId, wp.blogId, a.slug).catch(() => null)
      if (found?.id) {
        const status = articleStatusOf(found.status, mode === "schedule") ?? "published"
        await storeArticle(db, articleId, { ...base, status, wp_article_id: found.id, wp_url: found.url, wp_status: found.status, error: "" })
        refresh()
        return { ok: true, data: { status, url: found.url } }
      }
    }
    const message = error instanceof ZernioError && error.status === 502 ? "WordPress didn't answer. Try again." : zernioProblem(error)
    await storeArticle(db, articleId, { release: true, actor: g.member.id, error: message, ...(a.status === "draft" || a.status === "failed" ? { status: "failed", force: true } : {}) })
    refresh()
    return { ok: false, error: message }
  }
}

/** Sends the article's current text and fields to WordPress (published or scheduled). */
export async function updateArticleOnWordPress(articleId: string): Promise<ActionResult> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const problem = ready()
  if (problem) return { ok: false, error: problem }
  const a = isUuid(articleId) ? await loadArticle(g.db, articleId) : null
  if (!a?.wp_article_id) return { ok: false, error: "This article isn't on WordPress yet." }
  const wp = await wordpressOf(g.db, a)
  if (!wp) return { ok: false, error: "The WordPress site isn't set up any more. Check Content settings." }
  const db = admin()
  const { data: claim } = await db.rpc("content_claim_send", { p_kind: "article", p_id: articleId })
  const c = claim as { ok: boolean; version: number | null } | null
  if (!c?.ok || !c.version) return { ok: false, error: "This article is being sent right now." }
  try {
    const body = await articleBody(a, a.author ?? wp.defaultAuthor)
    const res = await updateArticle(wp.accountId, wp.blogId, a.wp_article_id, body)
    await storeArticle(db, articleId, { release: true, actor: g.member.id, sent_version: c.version, wp_url: res.url, wp_status: res.status, event: "edited", error: "" })
    refresh()
    return { ok: true }
  } catch (error) {
    await storeArticle(db, articleId, { release: true })
    return { ok: false, error: zernioProblem(error) }
  }
}

/** Moves a published or scheduled article back to a WordPress draft. */
export async function unpublishArticle(articleId: string): Promise<ActionResult> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const problem = ready()
  if (problem) return { ok: false, error: problem }
  const a = isUuid(articleId) ? await loadArticle(g.db, articleId) : null
  if (!a?.wp_article_id) return { ok: false, error: "This article isn't on WordPress." }
  const wp = await wordpressOf(g.db, a)
  if (!wp) return { ok: false, error: "The WordPress site isn't set up any more. Check Content settings." }
  try {
    const res = await updateArticle(wp.accountId, wp.blogId, a.wp_article_id, { isPublished: false })
    await storeArticle(admin(), articleId, { status: "draft", force: true, actor: g.member.id, wp_status: res.status ?? "draft", event: "unpublished", error: "" })
    refresh()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: zernioProblem(error) }
  }
}

/** Deletes the WordPress copy (permanent there); the article stays here as a draft. */
export async function deleteArticleFromWordPress(articleId: string): Promise<ActionResult> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const problem = ready()
  if (problem) return { ok: false, error: problem }
  const a = isUuid(articleId) ? await loadArticle(g.db, articleId) : null
  if (!a?.wp_article_id) return { ok: false, error: "This article isn't on WordPress." }
  const wp = await wordpressOf(g.db, a)
  if (!wp) return { ok: false, error: "The WordPress site isn't set up any more. Check Content settings." }
  try {
    await deleteArticle(wp.accountId, wp.blogId, a.wp_article_id)
    const db = admin()
    await storeArticle(db, articleId, { status: "draft", force: true, actor: g.member.id, event: "unpublished", detail: { deleted: true } })
    await db.from("content_articles").update({ wp_article_id: null, wp_url: null, wp_status: null, sent_version: null }).eq("id", articleId)
    refresh()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: zernioProblem(error) }
  }
}

export async function deleteArticleDraft(articleId: string): Promise<ActionResult> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const a = isUuid(articleId) ? await loadArticle(g.db, articleId) : null
  if (!a) return { ok: false, error: "Unknown article." }
  if (a.wp_article_id) return { ok: false, error: "Delete the WordPress copy first." }
  const { error } = await g.db.rpc("delete_content_article", { p_id: articleId })
  if (error) return { ok: false, error: dbMessage(error, "Couldn't delete the article.") }
  refresh()
  return { ok: true }
}

export async function markSeoPasted(articleId: string, done: boolean): Promise<ActionResult> {
  const g = await guard("content.write")
  if ("error" in g) return { ok: false, error: g.error }
  const { error } = await g.db.rpc("set_content_article_seo", { p_id: articleId, p_done: done })
  if (error) return { ok: false, error: dbMessage(error, "Couldn't save.") }
  refresh()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Settings and WordPress
// ---------------------------------------------------------------------------

export type SettingsInput = {
  timezone?: string
  defaultCtaUrl?: string | null
  signature?: string | null
  wpAccountId?: string | null
  wpBlogId?: string | null
  wpBlogName?: string | null
  wpDefaultAuthor?: string | null
  wpDefaultTags?: string[]
}

export async function saveContentSettings(clientId: string, input: SettingsInput): Promise<ActionResult> {
  const g = await guard("content.settings")
  if ("error" in g) return { ok: false, error: g.error }
  const p: Record<string, unknown> = {}
  if (input.timezone !== undefined) p.timezone = input.timezone
  if (input.defaultCtaUrl !== undefined) p.default_cta_url = input.defaultCtaUrl
  if (input.signature !== undefined) p.signature = input.signature
  if (input.wpAccountId !== undefined) p.wp_account_id = input.wpAccountId
  if (input.wpBlogId !== undefined) p.wp_blog_id = input.wpBlogId
  if (input.wpBlogName !== undefined) p.wp_blog_name = input.wpBlogName
  if (input.wpDefaultAuthor !== undefined) p.wp_default_author = input.wpDefaultAuthor
  if (input.wpDefaultTags !== undefined) p.wp_default_tags = input.wpDefaultTags
  const { error } = await g.db.rpc("save_content_settings", { p_client_id: clientId, p: p as Json })
  if (error) return { ok: false, error: dbMessage(error, "Couldn't save the settings.") }
  refresh()
  return { ok: true }
}

/** The blogs of the client's WordPress site (usually one). */
export async function loadBlogs(clientId: string, accountRowId: string): Promise<ActionResult<{ blogs: { id: string; name: string; url: string | null }[] }>> {
  const g = await guard("content.settings")
  if ("error" in g) return { ok: false, error: g.error }
  if (!hasZernioApiKey()) return { ok: false, error: NOT_SET_UP }
  const { data: acc } = await g.db
    .from("social_accounts")
    .select("zernio_account_id, platform")
    .eq("id", accountRowId)
    .eq("client_id", clientId)
    .maybeSingle()
  if (!acc || acc.platform !== "wordpress") return { ok: false, error: "Unknown WordPress site." }
  try {
    return { ok: true, data: { blogs: await listBlogs(acc.zernio_account_id) } }
  } catch (error) {
    return { ok: false, error: zernioProblem(error) }
  }
}

/**
 * Connects a self-hosted WordPress site with an application password. The password goes
 * straight to Zernio (which checks and stores it encrypted); we never save or log it.
 */
export async function connectWordPress(
  clientId: string,
  input: { siteUrl: string; username: string; applicationPassword: string },
): Promise<ActionResult<{ blogs: number; blogName: string | null }>> {
  const g = await guard("connections.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!hasZernioApiKey()) return { ok: false, error: NOT_SET_UP }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }

  let site: URL
  try {
    site = new URL(input.siteUrl.trim().replace(/\/+$/, ""))
  } catch {
    return { ok: false, error: "Enter the site address, like https://example.com." }
  }
  if (site.protocol !== "https:") return { ok: false, error: "The site must use https://." }
  const username = input.username.trim()
  const password = input.applicationPassword.replace(/\s+/g, " ").trim()
  if (!username || username.length > 200) return { ok: false, error: "Enter the WordPress username." }
  if (password.replace(/ /g, "").length < 16 || password.length > 200) {
    return { ok: false, error: "Paste the application password WordPress showed (24 letters, with spaces)." }
  }

  const { data: client } = await g.db.from("clients").select("id, name").eq("id", clientId).maybeSingle()
  if (!client) return { ok: false, error: "Unknown client." }
  try {
    const profileId = await ensureZernioProfile(g.db, client, g.member.id)
    const { accountId } = await connectWordPressToken({
      profileId,
      siteUrl: site.origin + (site.pathname === "/" ? "" : site.pathname),
      username,
      applicationPassword: password,
    })
    await syncClient(g.db, clientId, g.member.id)
    const { data: row } = accountId
      ? await g.db.from("social_accounts").select("id").eq("client_id", clientId).eq("zernio_account_id", accountId).maybeSingle()
      : await g.db
          .from("social_accounts")
          .select("id")
          .eq("client_id", clientId)
          .eq("platform", "wordpress")
          .neq("status", "removed")
          .order("connected_at", { ascending: false })
          .limit(1)
          .maybeSingle()
    if (!row) return { ok: false, error: "Zernio connected the site, but it isn't listed yet. Click Check now in a moment." }
    const { blogs } = await setupWordPress(g.db, clientId, row.id)
    refresh()
    return { ok: true, data: { blogs: blogs.length, blogName: blogs.length === 1 ? blogs[0].name : null } }
  } catch (error) {
    if (error instanceof ZernioError && (error.status === 400 || error.status === 401)) {
      return {
        ok: false,
        error:
          "WordPress didn't accept that. Check the address, the username and the application password, that the site uses https, and that its REST API is on.",
      }
    }
    console.error("[content] WordPress connect failed", error instanceof ZernioError ? error.status : "", error instanceof Error ? error.message : "")
    return { ok: false, error: zernioProblem(error) }
  }
}
