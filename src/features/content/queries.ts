import "server-only"

import type { SocialAccountStatus, SocialPlatform } from "@/features/connections/constants"
import { agencyMonth } from "@/lib/dates"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { ContentStatus, MediaKind, PostPlatform, TargetSettings, TargetStatus } from "./constants"

/** Everything the Content page reads (RLS: the team on clients they can see). */

const nameOf = (m: { full_name: string; email: string } | null) => (m ? m.full_name || m.email.split("@")[0] : null)

export type ContentSettings = {
  timezone: string
  defaultCtaUrl: string | null
  signature: string | null
  wpAccountId: string | null
  wpBlogId: string | null
  wpBlogName: string | null
  wpSiteUrl: string | null
  wpDefaultAuthor: string | null
  wpDefaultTags: string[]
}

export type ContentAccount = {
  id: string
  zernioAccountId: string
  platform: SocialPlatform
  status: SocialAccountStatus
  name: string
  username: string | null
  avatarUrl: string | null
  profileUrl: string | null
  canPost: boolean | null
}

export type ContentBase = {
  settings: ContentSettings
  accounts: ContentAccount[]
  wordpress: ContentAccount[]
  progress: {
    month: string
    articles: number
    articlesTarget: number
    gbpPosts: number
    gbpTarget: number
    scheduledPosts: number
    scheduledArticles: number
    failed: number
  }
}

export async function getContentBase(clientId: string): Promise<ContentBase> {
  const db = await createSupabaseServerClient()
  const month = agencyMonth()
  const [settings, accounts, client, work, scheduledPosts, scheduledArticles, failedPosts, failedArticles] =
    await Promise.all([
      db.from("content_settings").select("*").eq("client_id", clientId).maybeSingle(),
      db
        .from("social_accounts")
        .select("id, zernio_account_id, platform, status, display_name, username, location_name, avatar_url, profile_url, can_post")
        .eq("client_id", clientId)
        .neq("status", "removed")
        .order("connected_at", { ascending: true }),
      db.from("clients").select("articles_target, gbp_posts_target").eq("id", clientId).maybeSingle(),
      db.from("work_items").select("kind, quantity").eq("client_id", clientId).eq("month", month).in("kind", ["articles", "gbp_posts"]),
      db.from("content_posts").select("id", { count: "exact", head: true }).eq("client_id", clientId).in("status", ["scheduled", "publishing"]),
      db.from("content_articles").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "scheduled"),
      db.from("content_posts").select("id", { count: "exact", head: true }).eq("client_id", clientId).in("status", ["failed", "partial"]),
      db.from("content_articles").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "failed"),
    ])
  if (accounts.error) throw new Error(`Could not load the client's accounts: ${accounts.error.message}`)

  const s = settings.data
  const all = (accounts.data ?? []).map<ContentAccount>((a) => ({
    id: a.id,
    zernioAccountId: a.zernio_account_id,
    platform: a.platform,
    status: a.status,
    name: a.location_name || a.display_name || a.username || "Unnamed account",
    username: a.username,
    avatarUrl: a.avatar_url,
    profileUrl: a.profile_url,
    canPost: a.can_post,
  }))
  const sum = (k: string) => (work.data ?? []).filter((w) => w.kind === k).reduce((n, w) => n + w.quantity, 0)
  return {
    settings: {
      timezone: s?.timezone ?? "America/Phoenix",
      defaultCtaUrl: s?.default_cta_url ?? null,
      signature: s?.signature ?? null,
      wpAccountId: s?.wp_account_id ?? null,
      wpBlogId: s?.wp_blog_id ?? null,
      wpBlogName: s?.wp_blog_name ?? null,
      wpSiteUrl: s?.wp_site_url ?? null,
      wpDefaultAuthor: s?.wp_default_author ?? null,
      wpDefaultTags: s?.wp_default_tags ?? [],
    },
    accounts: all.filter((a) => a.platform !== "wordpress"),
    wordpress: all.filter((a) => a.platform === "wordpress"),
    progress: {
      month,
      articles: sum("articles"),
      articlesTarget: client.data?.articles_target ?? 0,
      gbpPosts: sum("gbp_posts"),
      gbpTarget: client.data?.gbp_posts_target ?? 0,
      scheduledPosts: scheduledPosts.count ?? 0,
      scheduledArticles: scheduledArticles.count ?? 0,
      failed: (failedPosts.count ?? 0) + (failedArticles.count ?? 0),
    },
  }
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export type PostTarget = {
  id: string
  socialAccountId: string | null
  zernioAccountId: string
  platform: PostPlatform
  accountName: string | null
  customContent: string | null
  customMediaIds: string[] | null
  settings: TargetSettings
  status: TargetStatus
  url: string | null
  error: string | null
  errorCategory: string | null
}

export type PostRow = {
  id: string
  title: string | null
  content: string
  mediaIds: string[]
  status: ContentStatus
  scheduledFor: string | null
  timezone: string | null
  zernioPostId: string | null
  version: number
  sentVersion: number | null
  sending: boolean
  lastError: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  targets: PostTarget[]
}

const POST_SELECT = `id, title, content, media_ids, status, scheduled_for, timezone, zernio_post_id, version, sent_version,
  sending_at, last_error, published_at, created_at, updated_at,
  creator:team_members!content_posts_created_by_fkey(full_name, email),
  targets:content_post_targets(id, social_account_id, zernio_account_id, platform, account_name, custom_content,
    custom_media_ids, settings, status, platform_post_url, error_message, error_category)`

type PostDb = {
  id: string
  title: string | null
  content: string
  media_ids: string[]
  status: ContentStatus
  scheduled_for: string | null
  timezone: string | null
  zernio_post_id: string | null
  version: number
  sent_version: number | null
  sending_at: string | null
  last_error: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  creator: { full_name: string; email: string } | null
  targets: {
    id: string
    social_account_id: string | null
    zernio_account_id: string
    platform: SocialPlatform
    account_name: string | null
    custom_content: string | null
    custom_media_ids: string[] | null
    settings: unknown
    status: TargetStatus
    platform_post_url: string | null
    error_message: string | null
    error_category: string | null
  }[]
}

function postOf(p: PostDb): PostRow {
  return {
    id: p.id,
    title: p.title,
    content: p.content,
    mediaIds: p.media_ids,
    status: p.status,
    scheduledFor: p.scheduled_for,
    timezone: p.timezone,
    zernioPostId: p.zernio_post_id,
    version: p.version,
    sentVersion: p.sent_version,
    sending: Boolean(p.sending_at && Date.now() - Date.parse(p.sending_at) < 3 * 60 * 1000),
    lastError: p.last_error,
    publishedAt: p.published_at,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    createdBy: nameOf(p.creator),
    targets: (p.targets ?? []).map((t) => ({
      id: t.id,
      socialAccountId: t.social_account_id,
      zernioAccountId: t.zernio_account_id,
      platform: t.platform as PostPlatform,
      accountName: t.account_name,
      customContent: t.custom_content,
      customMediaIds: t.custom_media_ids,
      settings: (t.settings ?? {}) as TargetSettings,
      status: t.status,
      url: t.platform_post_url,
      error: t.error_message,
      errorCategory: t.error_category,
    })),
  }
}

export async function getPosts(
  clientId: string,
  opts: { statuses?: ContentStatus[] | null; from?: string; to?: string; limit?: number } = {},
): Promise<PostRow[]> {
  const db = await createSupabaseServerClient()
  let q = db.from("content_posts").select(POST_SELECT).eq("client_id", clientId)
  if (opts.statuses) q = q.in("status", opts.statuses)
  if (opts.from && opts.to) {
    q = q.or(
      `and(scheduled_for.gte.${opts.from},scheduled_for.lt.${opts.to}),and(scheduled_for.is.null,published_at.gte.${opts.from},published_at.lt.${opts.to})`,
    )
  }
  const { data, error } = await q
    .order("scheduled_for", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 300)
  if (error) throw new Error(`Could not load posts: ${error.message}`)
  return ((data ?? []) as unknown as PostDb[]).map(postOf)
}

export async function getPost(clientId: string, postId: string): Promise<PostRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return null
  const db = await createSupabaseServerClient()
  const { data } = await db.from("content_posts").select(POST_SELECT).eq("client_id", clientId).eq("id", postId).maybeSingle()
  return data ? postOf(data as unknown as PostDb) : null
}

export type ContentEvent = { id: number; kind: string; at: string; actor: string | null; detail: Record<string, unknown> }

export async function getEvents(kind: "post" | "article", id: string): Promise<ContentEvent[]> {
  const db = await createSupabaseServerClient()
  const { data } = await db
    .from("content_events")
    .select("id, kind, at, detail, actor:team_members!content_events_actor_id_fkey(full_name, email)")
    .eq(kind === "post" ? "post_id" : "article_id", id)
    .order("at", { ascending: false })
    .limit(50)
  return (data ?? []).map((e) => ({
    id: e.id,
    kind: e.kind,
    at: e.at,
    actor: nameOf(e.actor),
    detail: (e.detail ?? {}) as Record<string, unknown>,
  }))
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export type ArticleRow = {
  id: string
  title: string
  slug: string | null
  excerpt: string | null
  tags: string[]
  featuredMediaId: string | null
  seoTitle: string | null
  metaDescription: string | null
  focusKeyword: string | null
  keywordId: string | null
  topic: string | null
  author: string | null
  wordCount: number
  status: ContentStatus
  publishAt: string | null
  wpArticleId: string | null
  wpUrl: string | null
  wpStatus: string | null
  version: number
  sentVersion: number | null
  sending: boolean
  seoPastedAt: string | null
  lastError: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

export type ArticleFull = ArticleRow & { bodyHtml: string }

const ARTICLE_SELECT = `id, title, slug, excerpt, tags, featured_media_id, seo_title, meta_description, focus_keyword,
  keyword_id, topic, author, word_count, status, publish_at, wp_article_id, wp_url, wp_status, version, sent_version,
  sending_at, seo_pasted_at, last_error, published_at, created_at, updated_at,
  creator:team_members!content_articles_created_by_fkey(full_name, email)`

type ArticleDb = {
  id: string
  title: string
  slug: string | null
  excerpt: string | null
  tags: string[]
  featured_media_id: string | null
  seo_title: string | null
  meta_description: string | null
  focus_keyword: string | null
  keyword_id: string | null
  topic: string | null
  author: string | null
  word_count: number
  status: ContentStatus
  publish_at: string | null
  wp_article_id: string | null
  wp_url: string | null
  wp_status: string | null
  version: number
  sent_version: number | null
  sending_at: string | null
  seo_pasted_at: string | null
  last_error: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  creator: { full_name: string; email: string } | null
  body_html?: string
}

function articleOf(a: ArticleDb): ArticleRow {
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    excerpt: a.excerpt,
    tags: a.tags,
    featuredMediaId: a.featured_media_id,
    seoTitle: a.seo_title,
    metaDescription: a.meta_description,
    focusKeyword: a.focus_keyword,
    keywordId: a.keyword_id,
    topic: a.topic,
    author: a.author,
    wordCount: a.word_count,
    status: a.status,
    publishAt: a.publish_at,
    wpArticleId: a.wp_article_id,
    wpUrl: a.wp_url,
    wpStatus: a.wp_status,
    version: a.version,
    sentVersion: a.sent_version,
    sending: Boolean(a.sending_at && Date.now() - Date.parse(a.sending_at) < 3 * 60 * 1000),
    seoPastedAt: a.seo_pasted_at,
    lastError: a.last_error,
    publishedAt: a.published_at,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    createdBy: nameOf(a.creator),
  }
}

export async function getArticles(
  clientId: string,
  opts: { statuses?: ContentStatus[] | null; from?: string; to?: string } = {},
): Promise<ArticleRow[]> {
  const db = await createSupabaseServerClient()
  let q = db.from("content_articles").select(ARTICLE_SELECT).eq("client_id", clientId)
  if (opts.statuses) q = q.in("status", opts.statuses)
  if (opts.from && opts.to) {
    q = q.or(
      `and(publish_at.gte.${opts.from},publish_at.lt.${opts.to}),and(publish_at.is.null,published_at.gte.${opts.from},published_at.lt.${opts.to})`,
    )
  }
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(300)
  if (error) throw new Error(`Could not load articles: ${error.message}`)
  return ((data ?? []) as unknown as ArticleDb[]).map(articleOf)
}

export async function getArticle(clientId: string, id: string): Promise<ArticleFull | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const db = await createSupabaseServerClient()
  const { data } = await db
    .from("content_articles")
    .select(`${ARTICLE_SELECT}, body_html`)
    .eq("client_id", clientId)
    .eq("id", id)
    .maybeSingle()
  if (!data) return null
  const a = data as unknown as ArticleDb
  return { ...articleOf(a), bodyHtml: a.body_html ?? "" }
}

export async function getKeywordChoices(clientId: string) {
  const db = await createSupabaseServerClient()
  const { data } = await db
    .from("keywords")
    .select("id, phrase")
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("phrase")
    .limit(300)
  return (data ?? []).map((k) => ({ id: k.id, phrase: k.phrase }))
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export type MediaRow = {
  id: string
  kind: MediaKind
  mime: string
  fileName: string
  bytes: number
  width: number | null
  height: number | null
  durationS: number | null
  altText: string | null
  title: string | null
  createdAt: string
  createdBy: string | null
  /** Signed for an hour: the image itself, or a video's preview frame. */
  previewUrl: string | null
  usedIn: number
}

export async function getMedia(clientId: string): Promise<MediaRow[]> {
  const db = await createSupabaseServerClient()
  const [{ data, error }, posts, articles] = await Promise.all([
    db
      .from("content_media")
      .select("id, kind, mime, file_name, bytes, width, height, duration_s, alt_text, title, storage_path, thumb_path, created_at, creator:team_members!content_media_created_by_fkey(full_name, email)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(500),
    db.from("content_posts").select("media_ids, targets:content_post_targets(custom_media_ids)").eq("client_id", clientId).limit(2000),
    db.from("content_articles").select("featured_media_id").eq("client_id", clientId).not("featured_media_id", "is", null),
  ])
  if (error) throw new Error(`Could not load the media library: ${error.message}`)
  const rows = data ?? []

  const used = new Map<string, number>()
  const bump = (id: string) => used.set(id, (used.get(id) ?? 0) + 1)
  for (const p of posts.data ?? []) {
    const ids = new Set<string>(p.media_ids)
    for (const t of (p.targets ?? []) as { custom_media_ids: string[] | null }[]) for (const id of t.custom_media_ids ?? []) ids.add(id)
    ids.forEach(bump)
  }
  for (const a of articles.data ?? []) if (a.featured_media_id) bump(a.featured_media_id)

  const paths = rows.map((m) => (m.kind === "image" ? m.storage_path : m.thumb_path)).filter((p): p is string => Boolean(p))
  const signed = new Map<string, string>()
  if (paths.length) {
    const { data: urls } = await db.storage.from("content-media").createSignedUrls(paths, 60 * 60)
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl)
  }
  return rows.map((m) => ({
    id: m.id,
    kind: m.kind,
    mime: m.mime,
    fileName: m.file_name,
    bytes: m.bytes,
    width: m.width,
    height: m.height,
    durationS: m.duration_s === null ? null : Number(m.duration_s),
    altText: m.alt_text,
    title: m.title,
    createdAt: m.created_at,
    createdBy: nameOf(m.creator),
    previewUrl: signed.get(m.kind === "image" ? m.storage_path : (m.thumb_path ?? "")) ?? null,
    usedIn: used.get(m.id) ?? 0,
  }))
}

/** True when posts or articles are waiting on Zernio and the page should look again soon. */
export async function needsReconcile(clientId: string): Promise<boolean> {
  const db = await createSupabaseServerClient()
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const past = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const [p, a] = await Promise.all([
    db
      .from("content_posts")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .in("status", ["scheduled", "publishing"])
      .lt("scheduled_for", past)
      .or(`last_synced_at.is.null,last_synced_at.lt.${stale}`),
    db
      .from("content_articles")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("status", "scheduled")
      .lt("publish_at", past)
      .or(`last_synced_at.is.null,last_synced_at.lt.${stale}`),
  ])
  return (p.count ?? 0) + (a.count ?? 0) > 0
}
