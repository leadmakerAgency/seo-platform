import "server-only"

import { request, ZernioError } from "./client"
import {
  articleFields,
  blogFields,
  zArticleEnvelope,
  zArticlesList,
  zBlogsList,
  zConnectedAccount,
  zOk,
  zPostEnvelope,
  zPostsList,
  zPresign,
  zValidation,
  type ZernioPost,
} from "./content-schemas"

/**
 * Zernio calls for the Content page: posts, media, blogs (docs/plans/content/02-zernio-api.md).
 * Writes never retry automatically; the Idempotency-Key makes a manual retry safe.
 */

const PUBLISH_TIMEOUT_MS = 60_000
const enc = encodeURIComponent

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export type ZernioMediaItem = { type: "image" | "video" | "document"; url: string; altText?: string; thumbnail?: string }

export type ZernioPlatformEntry = {
  platform: string
  accountId: string
  customContent?: string
  customMedia?: ZernioMediaItem[]
  platformSpecificData?: Record<string, unknown>
}

export type ZernioPostBody = {
  content: string
  mediaItems?: ZernioMediaItem[]
  platforms: ZernioPlatformEntry[]
  scheduledFor?: string
  timezone?: string
  publishNow?: boolean
  isDraft?: boolean
  metadata?: Record<string, string>
  externalId?: string
  tiktokSettings?: Record<string, unknown>
}

export function createPost(body: ZernioPostBody, idempotencyKey: string): Promise<ZernioPost> {
  return request("POST", "/posts", zPostEnvelope, {
    body,
    idempotencyKey,
    timeoutMs: body.publishNow ? PUBLISH_TIMEOUT_MS : undefined,
  })
}

export function updatePost(id: string, body: Partial<ZernioPostBody>, idempotencyKey: string): Promise<ZernioPost> {
  return request("PUT", `/posts/${enc(id)}`, zPostEnvelope, { body, idempotencyKey })
}

export async function deletePost(id: string) {
  try {
    await request("DELETE", `/posts/${enc(id)}`, zOk)
  } catch (error) {
    if (error instanceof ZernioError && error.status === 404) return
    throw error
  }
}

export function retryPost(id: string, idempotencyKey: string): Promise<ZernioPost> {
  return request("POST", `/posts/${enc(id)}/retry`, zPostEnvelope, {
    idempotencyKey,
    timeoutMs: PUBLISH_TIMEOUT_MS,
  })
}

/** Changes the text of a published post on one platform (where the platform allows it). */
export function editPublished(id: string, input: { platform: string; accountId: string; content: string }) {
  return request("POST", `/posts/${enc(id)}/edit`, zOk, { body: input, timeoutMs: PUBLISH_TIMEOUT_MS })
}

/** Takes a published post down from one platform. */
export function unpublishPost(id: string, input: { platform: string; accountId: string }) {
  return request("POST", `/posts/${enc(id)}/unpublish`, zOk, { body: input, timeoutMs: PUBLISH_TIMEOUT_MS })
}

export function getPost(id: string): Promise<ZernioPost> {
  return request("GET", `/posts/${enc(id)}`, zPostEnvelope)
}

export async function findPostsByExternalId(externalId: string): Promise<ZernioPost[]> {
  const result = await request("GET", "/posts", zPostsList, { query: { externalId, limit: 10 } })
  return result.posts ?? []
}

export function validatePost(body: ZernioPostBody) {
  return request("POST", "/tools/validate/post", zValidation, { body })
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export function presignMedia(input: { filename: string; contentType: string; size: number }) {
  return request("POST", "/media/presign", zPresign, { body: input })
}

// ---------------------------------------------------------------------------
// WordPress: connect and the Blogs API
// ---------------------------------------------------------------------------

/** Self-hosted WordPress with an application password. Zernio checks and stores it; we don't. */
export async function connectWordPressToken(input: {
  profileId: string
  siteUrl: string
  username: string
  applicationPassword: string
}): Promise<{ accountId: string | null }> {
  const result = await request("POST", "/connect/wordpress/token", zConnectedAccount, {
    body: input,
    timeoutMs: 30_000,
  })
  return { accountId: result.account?._id ?? null }
}

export async function listBlogs(accountId: string) {
  const blogs = await request("GET", `/accounts/${enc(accountId)}/blogs`, zBlogsList)
  return blogs.map(blogFields).filter((b): b is { id: string; name: string; url: string | null } => Boolean(b.id))
}

export type ArticleBody = {
  title?: string
  bodyHtml?: string
  handle?: string
  tags?: string[]
  author?: string
  excerpt?: string
  image?: { url: string }
  isPublished?: boolean
  publishDate?: string
}

const articlesPath = (accountId: string, blogId: string) => `/accounts/${enc(accountId)}/blogs/${enc(blogId)}/articles`

export async function createArticle(accountId: string, blogId: string, body: ArticleBody, idempotencyKey: string) {
  const a = await request("POST", articlesPath(accountId, blogId), zArticleEnvelope, {
    body,
    idempotencyKey,
    timeoutMs: PUBLISH_TIMEOUT_MS,
  })
  return articleFields(a)
}

export async function updateArticle(accountId: string, blogId: string, articleId: string, body: ArticleBody) {
  const a = await request("PATCH", `${articlesPath(accountId, blogId)}/${enc(articleId)}`, zArticleEnvelope, {
    body,
    timeoutMs: PUBLISH_TIMEOUT_MS,
  })
  return articleFields(a)
}

export async function deleteArticle(accountId: string, blogId: string, articleId: string) {
  try {
    await request("DELETE", `${articlesPath(accountId, blogId)}/${enc(articleId)}`, zOk, { timeoutMs: 30_000 })
  } catch (error) {
    if (error instanceof ZernioError && error.status === 404) return
    throw error
  }
}

export async function getArticle(accountId: string, blogId: string, articleId: string) {
  return articleFields(await request("GET", `${articlesPath(accountId, blogId)}/${enc(articleId)}`, zArticleEnvelope))
}

/** After a 502 the article may exist anyway: look it up by its slug. */
export async function findArticleByHandle(accountId: string, blogId: string, handle: string) {
  const list = await request("GET", articlesPath(accountId, blogId), zArticlesList, { query: { handle, limit: 5 } })
  const hit = list.map(articleFields).find((a) => a.id)
  return hit ?? null
}
