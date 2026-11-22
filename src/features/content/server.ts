import "server-only"

import type { Db } from "@/features/connections/sync"
import type { Json } from "@/lib/supabase/database.types"
import { ZernioError } from "@/lib/zernio/client"
import { getArticle, getPost, listBlogs, presignMedia } from "@/lib/zernio/content"
import { platformResults, type ZernioPost } from "@/lib/zernio/content-schemas"
import type { BodyMedia } from "./body"

/**
 * Server helpers shared by the actions, the webhook and the cron. `admin` is the service
 * client (the zernio_store_* functions are service-role only); callers check the person's
 * permission first.
 */

const REUSE_MS = 6 * 24 * 60 * 60 * 1000
const BUFFER_LIMIT = 25 * 1024 * 1024
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)

/** Words a person can act on, for any Zernio failure. */
export function zernioProblem(error: unknown): string {
  if (!(error instanceof ZernioError)) return error instanceof Error ? error.message : "Something went wrong. Try again."
  if (error.status === 402) {
    return error.code === "insufficient_balance"
      ? "The Zernio balance is empty. An admin needs to top it up (posts to X are paid per post)."
      : "Zernio needs a payment method or a higher plan for this. An admin can check Zernio billing."
  }
  if (error.status === 401) return "Zernio rejected the API key. An admin needs to check ZERNIO_API_KEY."
  if (error.status === 409) return "Zernio says the same post was sent very recently. Change the text or wait a little."
  if (error.status === 429) return "Zernio is busy right now (rate limit). Wait a minute and try again."
  if (error.status === 0 || error.status >= 500) return "Zernio or the platform isn't responding. Try again in a minute."
  return error.message
}

const safeName = (name: string) =>
  name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(-120) || "file"

/**
 * The files of a post at Zernio: reused when uploaded in the last 6 days (Zernio keeps
 * uploads 7 days unless a post uses them), otherwise streamed from Storage to a presigned URL.
 */
export async function pushMediaToZernio(admin: Db, ids: string[]): Promise<Map<string, BodyMedia>> {
  const out = new Map<string, BodyMedia>()
  const unique = [...new Set(ids)]
  if (!unique.length) return out
  const { data: rows, error } = await admin
    .from("content_media")
    .select("id, kind, mime, bytes, storage_path, file_name, alt_text, zernio_url, zernio_uploaded_at")
    .in("id", unique)
  if (error) throw new Error(`Couldn't read the files: ${error.message}`)

  for (const m of rows ?? []) {
    if (m.zernio_url && m.zernio_uploaded_at && Date.now() - Date.parse(m.zernio_uploaded_at) < REUSE_MS) {
      out.set(m.id, { kind: m.kind, url: m.zernio_url, altText: m.alt_text })
      continue
    }
    const { data: signed, error: signError } = await admin.storage
      .from("content-media")
      .createSignedUrl(m.storage_path, 15 * 60)
    if (signError || !signed) throw new Error(`Couldn't read ${m.file_name} from storage.`)
    const source = await fetch(signed.signedUrl, { cache: "no-store" })
    if (!source.ok || !source.body) throw new Error(`Couldn't read ${m.file_name} from storage.`)

    const pre = await presignMedia({ filename: safeName(m.file_name), contentType: m.mime, size: m.bytes })
    const big = m.bytes > BUFFER_LIMIT
    const put = await fetch(pre.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": m.mime, "Content-Length": String(m.bytes) },
      body: big ? source.body : await source.arrayBuffer(),
      // Streams need half-duplex in Node's fetch.
      ...(big ? { duplex: "half" } : {}),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    } as RequestInit)
    if (!put.ok) throw new Error(`Uploading ${m.file_name} to Zernio failed (${put.status}).`)

    await admin
      .from("content_media")
      .update({ zernio_url: pre.publicUrl, zernio_uploaded_at: new Date().toISOString() })
      .eq("id", m.id)
    out.set(m.id, { kind: m.kind, url: pre.publicUrl, altText: m.alt_text })
  }
  for (const id of unique) if (!out.has(id)) throw new Error("A file of this post is no longer in the media library.")
  return out
}

/** Saves what Zernio says about a post (status, each account, links, errors). */
export async function storePost(admin: Db, postId: string, post: ZernioPost | null, extra: Record<string, unknown> = {}) {
  const p: Record<string, unknown> = { ...extra }
  if (post) {
    p.zernio_post_id = post._id
    if (post.status && !("status" in extra)) p.status = post.status
    p.platforms = platformResults(post)
  }
  const { error } = await admin.rpc("zernio_store_post_result", { p_post_id: postId, p: p as Json })
  if (error) console.error("[content] storing a post result failed", postId, error.message)
}

export async function storeArticle(admin: Db, articleId: string, p: Record<string, unknown>) {
  const { error } = await admin.rpc("zernio_store_article_result", { p_article_id: articleId, p: p as Json })
  if (error) console.error("[content] storing an article result failed", articleId, error.message)
}

/** WordPress status words into ours. */
export function articleStatusOf(wpStatus: string | null, scheduled: boolean): "published" | "scheduled" | "draft" | null {
  if (!wpStatus) return scheduled ? "scheduled" : "published"
  const s = wpStatus.toLowerCase()
  if (s === "publish" || s === "published") return "published"
  if (s === "future" || s === "scheduled") return "scheduled"
  if (s === "draft" || s === "pending" || s === "private") return "draft"
  return null
}

// ---------------------------------------------------------------------------
// Webhooks: Zernio says a post changed. The payload is only a hint; we read the post back.
// ---------------------------------------------------------------------------

export async function processPostEvent(admin: Db, payload: unknown): Promise<string | null> {
  const body = (payload ?? {}) as Record<string, unknown>
  const post = (body.post ?? (body.data as Record<string, unknown> | undefined)?.post ?? null) as
    | { _id?: string; id?: string; metadata?: Record<string, unknown> }
    | null
  const zernioId = (post?._id ?? post?.id ?? (typeof body.postId === "string" ? body.postId : null)) as string | null
  const ourId = post?.metadata?.content_post_id

  const query = admin.from("content_posts").select("id, client_id, zernio_post_id")
  const { data: row } = isUuid(ourId)
    ? await query.eq("id", ourId).maybeSingle()
    : zernioId
      ? await query.eq("zernio_post_id", zernioId).maybeSingle()
      : { data: null }
  if (!row) return null
  const id = row.zernio_post_id ?? zernioId
  if (!id || (zernioId && row.zernio_post_id && zernioId !== row.zernio_post_id)) return row.client_id

  const fresh = await getPost(id)
  await storePost(admin, row.id, fresh)
  return row.client_id
}

// ---------------------------------------------------------------------------
// Reconcile: posts whose time passed, articles WordPress should have published
// ---------------------------------------------------------------------------

export async function reconcileContent(admin: Db, opts: { clientId?: string; budget?: number } = {}) {
  let budget = opts.budget ?? 200
  const now = Date.now()
  const ago = (min: number) => new Date(now - min * 60 * 1000).toISOString()
  const totals = { posts: 0, articles: 0, failed: 0 }

  const client = opts.clientId

  // 1. Scheduled or publishing posts whose time is past: the webhook may have been missed.
  let dueQ = admin
    .from("content_posts")
    .select("id, zernio_post_id")
    .in("status", ["scheduled", "publishing"])
    .not("zernio_post_id", "is", null)
    .lt("scheduled_for", ago(15))
    .or(`last_synced_at.is.null,last_synced_at.lt.${ago(30)}`)
  if (client) dueQ = dueQ.eq("client_id", client)
  const { data: due } = await dueQ.order("scheduled_for", { ascending: true }).limit(Math.min(100, budget))

  // Published in the last week: once a day, to notice posts removed on the platform.
  let recentQ = admin
    .from("content_posts")
    .select("id, zernio_post_id")
    .in("status", ["published", "partial"])
    .not("zernio_post_id", "is", null)
    .gt("published_at", ago(7 * 24 * 60))
    .lt("last_synced_at", ago(23 * 60))
  if (client) recentQ = recentQ.eq("client_id", client)
  const { data: recent } = await recentQ.limit(Math.max(1, Math.min(50, budget - (due?.length ?? 0))))

  for (const p of [...(due ?? []), ...(recent ?? [])]) {
    if (budget-- <= 0 || !p.zernio_post_id) break
    try {
      await storePost(admin, p.id, await getPost(p.zernio_post_id))
      totals.posts++
    } catch (error) {
      totals.failed++
      if (error instanceof ZernioError && error.status === 404) {
        await storePost(admin, p.id, null, { status: "cancelled", error: "Zernio no longer has this post." })
      } else console.error("[content] reconcile post failed", p.id, error)
    }
  }

  // 2. Scheduled articles: WordPress publishes them itself (WP-Cron); there are no webhooks.
  let artQ = admin
    .from("content_articles")
    .select("id, publish_at, wp_blog_id, wp_article_id, account:social_accounts!content_articles_wp_account_id_fkey(zernio_account_id)")
    .eq("status", "scheduled")
    .not("wp_article_id", "is", null)
    .lt("publish_at", ago(5))
    .or(`last_synced_at.is.null,last_synced_at.lt.${ago(30)}`)
  if (client) artQ = artQ.eq("client_id", client)
  const { data: articles } = await artQ.limit(Math.max(1, Math.min(50, budget)))

  for (const a of articles ?? []) {
    if (budget-- <= 0) break
    const account = a.account?.zernio_account_id
    if (!account || !a.wp_blog_id || !a.wp_article_id) continue
    try {
      const got = await getArticle(account, a.wp_blog_id, a.wp_article_id)
      const status = articleStatusOf(got.status, false)
      const late = a.publish_at && now - Date.parse(a.publish_at) > 2 * 60 * 60 * 1000
      await storeArticle(admin, a.id, {
        wp_status: got.status,
        wp_url: got.url,
        ...(status === "published"
          ? { status: "published" }
          : late
            ? { error: "WordPress hasn't published it yet. WP-Cron may be off on this site; publish it from WordPress or click Publish now." }
            : {}),
      })
      totals.articles++
    } catch (error) {
      totals.failed++
      console.error("[content] reconcile article failed", a.id, error)
    }
  }
  return totals
}

// ---------------------------------------------------------------------------
// WordPress: after a site is connected, remember it and pick its blog
// ---------------------------------------------------------------------------

export async function setupWordPress(db: Db, clientId: string, accountRowId: string) {
  const { data: account } = await db
    .from("social_accounts")
    .select("id, zernio_account_id, username, display_name, profile_url, platform")
    .eq("id", accountRowId)
    .eq("client_id", clientId)
    .maybeSingle()
  if (!account || account.platform !== "wordpress") return { blogs: [] as { id: string; name: string; url: string | null }[] }

  const blogs = await listBlogs(account.zernio_account_id).catch(() => [])
  const site = account.profile_url ?? (account.username && /^https?:\/\//.test(account.username) ? account.username : null)
  const one = blogs.length === 1 ? blogs[0] : null
  const { error } = await db.rpc("save_content_settings", {
    p_client_id: clientId,
    p: {
      wp_account_id: account.id,
      ...(site ? { wp_site_url: site } : {}),
      ...(one ? { wp_blog_id: one.id, wp_blog_name: one.name, ...(one.url && !site ? { wp_site_url: one.url } : {}) } : {}),
    },
  })
  if (error) console.error("[content] saving the WordPress site failed", error.message)
  return { blogs }
}
