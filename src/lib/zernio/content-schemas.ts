import { z } from "zod"

/**
 * Zernio shapes for posts, media and blogs (docs/plans/content/02-zernio-api.md). Parsed
 * loosely: Zernio adds fields often, and a few names are confirmed in the phase 0 check, so
 * the normalisers below accept the spellings we have seen in the docs.
 */

const optStr = z.string().nullish()
const idLike = z.union([z.string(), z.number(), z.looseObject({ _id: z.string() })]).nullish()

export const zPostPlatform = z.looseObject({
  platform: optStr,
  accountId: idLike,
  status: optStr,
  platformPostId: z.union([z.string(), z.number()]).nullish(),
  platformPostUrl: optStr,
  errorMessage: optStr,
  errorCategory: optStr,
  errorSource: optStr,
  publishedAt: optStr,
})

export const zPost = z.looseObject({
  _id: z.string(),
  status: optStr,
  scheduledFor: optStr,
  platforms: z.array(zPostPlatform).nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  externalId: optStr,
})
export type ZernioPost = z.infer<typeof zPost>

/** POST/PUT/GET answer: `{ post }`, or the post itself. */
export const zPostEnvelope = z.union([z.looseObject({ post: zPost }), zPost]).transform((v) =>
  "post" in v && v.post && typeof v.post === "object" ? (v.post as ZernioPost) : (v as ZernioPost),
)

export const zPostsList = z.looseObject({ posts: z.array(zPost).nullish() })

const zIssue = z.union([
  z.string(),
  z.looseObject({ message: optStr, platform: optStr, field: optStr, code: optStr }),
])
export const zValidation = z.looseObject({
  valid: z.boolean().nullish(),
  errors: z.array(zIssue).nullish(),
  warnings: z.array(zIssue).nullish(),
})

export const zPresign = z.looseObject({
  uploadUrl: z.url(),
  publicUrl: z.url(),
  expiresIn: z.number().nullish(),
})

export const zOk = z.looseObject({ success: z.boolean().nullish(), message: optStr })

export const zBlog = z.looseObject({
  id: z.union([z.string(), z.number()]).nullish(),
  _id: optStr,
  title: optStr,
  name: optStr,
  url: optStr,
  handle: optStr,
})
export const zBlogsList = z.union([
  z.looseObject({ blogs: z.array(zBlog) }),
  z.array(zBlog),
]).transform((v) => (Array.isArray(v) ? v : v.blogs))

export const zArticle = z.looseObject({
  id: z.union([z.string(), z.number()]).nullish(),
  _id: optStr,
  articleId: z.union([z.string(), z.number()]).nullish(),
  title: optStr,
  handle: optStr,
  url: optStr,
  link: optStr,
  permalink: optStr,
  status: optStr,
  isPublished: z.boolean().nullish(),
  publishedAt: optStr,
  publishDate: optStr,
})
export type ZernioArticle = z.infer<typeof zArticle>
export const zArticleEnvelope = z
  .union([z.looseObject({ article: zArticle }), zArticle])
  .transform((v) =>
    "article" in v && v.article && typeof v.article === "object" ? (v.article as ZernioArticle) : (v as ZernioArticle),
  )
export const zArticlesList = z.union([
  z.looseObject({ articles: z.array(zArticle) }),
  z.array(zArticle),
]).transform((v) => (Array.isArray(v) ? v : v.articles))

export const zConnectedAccount = z.looseObject({
  account: z.looseObject({ _id: z.string(), platform: optStr, username: optStr, displayName: optStr }).nullish(),
})

// ---------------------------------------------------------------------------
// Normalisers
// ---------------------------------------------------------------------------

export const idOf = (v: unknown): string | null => {
  if (typeof v === "string" && v) return v
  if (typeof v === "number") return String(v)
  if (v && typeof v === "object" && typeof (v as { _id?: unknown })._id === "string") return (v as { _id: string })._id
  return null
}

export type PlatformResult = {
  accountId: string
  status: string | null
  platformPostId: string | null
  platformPostUrl: string | null
  errorMessage: string | null
  errorCategory: string | null
  errorSource: string | null
  publishedAt: string | null
}

export function platformResults(post: Pick<ZernioPost, "platforms">): PlatformResult[] {
  return (post.platforms ?? []).flatMap((p) => {
    const accountId = idOf(p.accountId)
    if (!accountId) return []
    return [
      {
        accountId,
        status: p.status ?? null,
        platformPostId: p.platformPostId === null || p.platformPostId === undefined ? null : String(p.platformPostId),
        platformPostUrl: p.platformPostUrl ?? null,
        errorMessage: p.errorMessage ?? null,
        errorCategory: p.errorCategory ?? null,
        errorSource: p.errorSource ?? null,
        publishedAt: p.publishedAt ?? null,
      },
    ]
  })
}

export const issueText = (i: z.infer<typeof zIssue>) =>
  typeof i === "string" ? i : [i.platform, i.message ?? i.code ?? "Problem"].filter(Boolean).join(": ")

export function articleFields(a: ZernioArticle) {
  return {
    id: idOf(a.id) ?? idOf(a.articleId) ?? a._id ?? null,
    url: a.url ?? a.link ?? a.permalink ?? null,
    status: a.status ?? (a.isPublished === true ? "publish" : a.isPublished === false ? "draft" : null),
  }
}

export function blogFields(b: z.infer<typeof zBlog>) {
  return { id: idOf(b.id) ?? b._id ?? null, name: b.title ?? b.name ?? b.handle ?? "Blog", url: b.url ?? null }
}
