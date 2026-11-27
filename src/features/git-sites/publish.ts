import "server-only"

import { cleanArticleHtml } from "@/features/content/sanitize"
import type { Db } from "@/lib/dataforseo/client"
import { getSupabaseUrl } from "@/lib/env"
import { gitHubProblem, GitHubError } from "@/lib/github/app"
import { commitMessage, gitBlobSha, type CommitKind } from "@/lib/github/sha"
import type { Json } from "@/lib/supabase/database.types"
import type { CmsCollection } from "./config"
import { readFieldMap } from "./field-map"
import {
  imageExtension,
  liveUrl,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  mediaPath,
  postPath,
  publicUrl,
  renderSlugTemplate,
  slugify,
} from "./files"
import { composePost } from "./frontmatter"
import { htmlToMarkdown, imageSources, rewriteImages } from "./markdown"
import { clientFor } from "./server"

/**
 * Publishing a Content article to a Git site (docs/plans/git-cms/06-pipeline.md): one commit
 * with the post and its images, then the host builds and deploy.ts confirms it's live.
 * Server only, with the admin client, after the action checked `content.write`.
 */

export type GitSendMode = "now" | "scheduled" | "update" | "unpublish" | "delete"

export type GitSendResult =
  | { ok: true; status: string; url: string | null; committed: boolean; commitSha: string | null }
  | { ok: false; error: string; conflict?: "changed" | "missing" | "exists" }

type Article = {
  id: string
  client_id: string
  title: string
  slug: string | null
  body_html: string
  excerpt: string | null
  meta_description: string | null
  seo_title: string | null
  tags: string[]
  author_name: string | null
  status: string
  publish_at: string | null
  published_at: string | null
  version: number
  site_kind: string
  git_connection_id: string | null
  git_path: string | null
  git_blob_sha: string | null
  git_commit_sha: string | null
  git_media: string[]
  live_url: string | null
  featured: { storage_path: string; bytes: number; mime: string; alt_text: string | null } | null
}

type Connection = {
  id: string
  client_id: string
  auth_method: "github_app" | "token"
  installation_id: number | null
  repo_id: number | null
  owner: string
  repo: string
  branch: string
  status: string
  collection: string | null
  folder: string | null
  extension: string
  slug_template: string
  media_folder: string | null
  public_folder: string | null
  date_format: string | null
  field_map: unknown
  url_pattern: string | null
  site_url: string | null
  commit_name: string | null
  commit_email: string | null
  detected: unknown
}

const ARTICLE_COLUMNS =
  "id, client_id, title, slug, body_html, excerpt, meta_description, seo_title, tags, author_name, status, publish_at, published_at, version, site_kind, git_connection_id, git_path, git_blob_sha, git_commit_sha, git_media, live_url, featured:content_media!content_articles_featured_media_id_fkey(storage_path, bytes, mime, alt_text)"
const CONNECTION_COLUMNS =
  "id, client_id, auth_method, installation_id, repo_id, owner, repo, branch, status, collection, folder, extension, slug_template, media_folder, public_folder, date_format, field_map, url_pattern, site_url, commit_name, commit_email, detected"

export async function loadGitArticle(admin: Db, id: string): Promise<Article | null> {
  const { data } = await admin.from("content_articles").select(ARTICLE_COLUMNS).eq("id", id).maybeSingle()
  return (data as unknown as Article) ?? null
}

async function loadConnection(admin: Db, id: string | null): Promise<Connection | null> {
  if (!id) return null
  const { data } = await admin.from("git_connections").select(CONNECTION_COLUMNS).eq("id", id).maybeSingle()
  return (data as unknown as Connection) ?? null
}

/** The collection from the stored config summary, with the connection's own date format. */
function collectionOf(c: Connection): CmsCollection {
  const d = (c.detected ?? {}) as { collections?: { name: string; fields?: CmsCollection["fields"] }[] }
  const found = d.collections?.find((x) => x.name === c.collection)
  const fieldMap = readFieldMap(c.field_map)
  const fields = (found?.fields ?? []).map((f) => (f.name === fieldMap.date ? { ...f, format: c.date_format ?? undefined } : f))
  // With no field list (no CMS config), the map's own names are the fields.
  if (!fields.length) {
    for (const v of Object.values(fieldMap)) {
      const name = typeof v === "string" ? v : v?.name
      if (name) fields.push({ name, label: name, widget: name === fieldMap.date ? "datetime" : "string", required: false, ...(name === fieldMap.date && c.date_format ? { format: c.date_format } : {}) })
    }
  }
  return {
    name: c.collection ?? "posts",
    label: c.collection ?? "Posts",
    folder: c.folder ?? "",
    extension: c.extension,
    format: "frontmatter",
    slug: c.slug_template,
    previewPath: null,
    mediaFolder: c.media_folder,
    publicFolder: c.public_folder,
    fields,
    hasBody: true,
    supported: true,
    reason: null,
  }
}

/** "content-inline" public URL → its storage path, or null for other images. */
function inlinePath(src: string): string | null {
  const prefix = `${getSupabaseUrl().replace(/\/+$/, "")}/storage/v1/object/public/content-inline/`
  if (!src.startsWith(prefix)) return null
  const p = decodeURIComponent(src.slice(prefix.length).split(/[?#]/)[0])
  return /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(p) ? p : null
}

async function download(admin: Db, bucket: string, path: string): Promise<{ bytes: Uint8Array; mime: string | null }> {
  const { data, error } = await admin.storage.from(bucket).download(path)
  if (error || !data) throw new Error("An image couldn't be read from the media library.")
  if (data.size > MAX_IMAGE_BYTES) throw new Error("An image is over 10 MB. Use a smaller one.")
  return { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type || null }
}

const settingsFor = async (admin: Db, clientId: string) => {
  const { data } = await admin
    .from("content_settings")
    .select("git_default_author, git_default_tags")
    .eq("client_id", clientId)
    .maybeSingle()
  return { author: data?.git_default_author ?? null, tags: data?.git_default_tags ?? [] }
}

/** True once setup has the folder, URL pattern and site address. */
export const connectionReady = (c: Pick<Connection, "folder" | "url_pattern" | "site_url" | "status">) =>
  c.status === "connected" && Boolean(c.folder && c.url_pattern && c.site_url)

async function store(admin: Db, articleId: string, p: Record<string, unknown>) {
  await admin.rpc("git_store_article_result", { p_article_id: articleId, p: p as Json })
}

/**
 * One send. The caller holds the content_claim_send lock and passes its version; the lock is
 * released here (release: true on every store).
 */
export async function runGitSend(
  admin: Db,
  articleId: string,
  opts: { mode: GitSendMode; version: number; actor: string | null; force?: boolean },
): Promise<GitSendResult> {
  const { mode, version, actor } = opts
  const a = await loadGitArticle(admin, articleId)
  const fail = async (error: string, extra: Record<string, unknown> = {}): Promise<GitSendResult> => {
    await store(admin, articleId, { release: true, actor, error, ...extra })
    return { ok: false, error }
  }
  if (!a || a.site_kind !== "git") return { ok: false, error: "Unknown article." }
  const c = await loadConnection(admin, a.git_connection_id)
  if (!c || c.status === "removed") return fail("The Git site for this article was disconnected. Pick another site.")
  if (!connectionReady(c)) {
    return fail(
      c.status !== "connected"
        ? "The Git site needs attention in Connections before anything can be published."
        : "Finish Set up site in Connections (post folder, site address and URL pattern) first.",
      mode === "scheduled" ? { status: "failed", force: true } : {},
    )
  }

  try {
    const gh = await clientFor(admin, c)
    const author = c.commit_name && c.commit_email ? { name: c.commit_name, email: c.commit_email } : null

    // ---- Delete from site: remove the post file (images stay; other posts may use them).
    if (mode === "delete") {
      if (!a.git_path) return fail("This article isn't on the site.")
      const res = await gh.commitFiles({
        owner: c.owner,
        repo: c.repo,
        branch: c.branch,
        files: [],
        deletes: [a.git_path],
        message: commitMessage("delete", a.title, a.id, version),
        author,
      })
      await store(admin, articleId, {
        release: true,
        actor,
        status: "draft",
        force: true,
        event: "unpublished",
        detail: { deleted: true },
        git_path: "",
        git_blob_sha: "",
        git_commit_sha: res.commitSha ?? "",
        git_deploy_state: "none",
        live_url: "",
        error: "",
      })
      await admin.from("content_articles").update({ sent_version: null }).eq("id", articleId)
      return { ok: true, status: "draft", url: null, committed: Boolean(res.commitSha), commitSha: res.commitSha }
    }

    const map = readFieldMap(c.field_map)
    const collection = collectionOf(c)
    const settings = await settingsFor(admin, a.client_id)
    const slug = a.slug || slugify(a.title) || `post-${a.id.slice(0, 8)}`
    // The date on the post: when it went live first (kept on updates), else now / the scheduled time.
    const date =
      mode === "update" || mode === "unpublish"
        ? new Date(a.published_at ?? a.publish_at ?? Date.now())
        : mode === "scheduled" && a.publish_at
          ? new Date(Math.min(Date.parse(a.publish_at), Date.now()))
          : new Date()
    const name = renderSlugTemplate(c.slug_template, { slug, title: a.title, date })
    const path = postPath(c.folder!, name, c.extension)
    if (!path) return fail("The post folder in Set up site isn't valid.")

    // ---- Conflicts: edited or deleted on the site since we wrote it; or the address is taken.
    if (a.git_path && a.git_blob_sha && !opts.force) {
      const onSite = await gh.getFile(c.owner, c.repo, a.git_path, c.branch)
      if (!onSite) {
        await store(admin, articleId, { release: true, actor, error: "The post was deleted on the site. Publish it again to bring it back." })
        return { ok: false, error: "The post was deleted on the site since it was published.", conflict: "missing" }
      }
      if (onSite.sha !== a.git_blob_sha) {
        await store(admin, articleId, { release: true, actor })
        return { ok: false, error: "The post was changed on the site (for example in the CMS) since it was published.", conflict: "changed" }
      }
    }
    if (path !== a.git_path) {
      const taken = await gh.getFile(c.owner, c.repo, path, c.branch)
      if (taken) {
        await store(admin, articleId, { release: true, actor, error: `The site already has ${path}. Change the article's web address (slug).` })
        return { ok: false, error: `The site already has a post at ${path}. Change the article's web address (slug).`, conflict: "exists" }
      }
    }

    // ---- Images: the featured image and our inline images go into the media folder.
    const html = cleanArticleHtml(a.body_html)
    const files: { path: string; content: string | Uint8Array }[] = []
    const media: string[] = []
    const existing = new Map<string, string>()
    let featuredUrl: string | null = null
    const rewrite: Record<string, string> = {}
    const inline = imageSources(html).map((src) => ({ src, path: inlinePath(src) })).filter((x) => x.path)
    if ((a.featured ? 1 : 0) + inline.length > MAX_IMAGES) return fail(`An article can have up to ${MAX_IMAGES} images on a Git site.`)
    if ((a.featured || inline.length) && c.media_folder === null) return fail("Set the image folder in Set up site first.")

    if (a.featured || inline.length) {
      const folder = c.media_folder ?? ""
      const listed = (await gh.listFolder(c.owner, c.repo, folder, c.branch)) ?? []
      const taken = new Map(listed.filter((e) => e.type === "file").map((e) => [e.path, e.sha]))
      let n = 0
      const place = (bytes: Uint8Array, ext: string) => {
        const sha = gitBlobSha(bytes)
        for (let tries = 0; tries < 50; tries++) {
          n++
          const p = mediaPath(folder, slug, n, ext)
          if (!p) throw new Error("The image folder in Set up site isn't valid.")
          const there = taken.get(p)
          // Free, ours from an earlier send, or the very same file.
          if (!there || there === sha || a.git_media.includes(p)) {
            if (there === sha) existing.set(p, sha)
            files.push({ path: p, content: bytes })
            media.push(p)
            return publicUrl(c.public_folder, p.split("/").pop()!)
          }
        }
        throw new Error("Couldn't find a free image file name.")
      }
      if (a.featured) {
        const ext = imageExtension(a.featured.mime, a.featured.storage_path)
        if (!ext) return fail("The featured image must be a PNG, JPG, WebP, GIF or AVIF.")
        if (a.featured.bytes > MAX_IMAGE_BYTES) return fail("The featured image is over 10 MB. Use a smaller one.")
        const img = await download(admin, "content-media", a.featured.storage_path)
        featuredUrl = place(img.bytes, ext)
      }
      for (const x of inline) {
        const img = await download(admin, "content-inline", x.path!)
        const ext = imageExtension(img.mime, x.path)
        if (!ext) continue
        rewrite[x.src] = place(img.bytes, ext)
      }
    }

    const markdown = htmlToMarkdown(rewriteImages(html, rewrite))
    const post = composePost(
      {
        title: a.title,
        slug,
        excerpt: a.excerpt,
        metaDescription: a.meta_description,
        seoTitle: a.seo_title,
        tags: a.tags.length ? a.tags : settings.tags,
        author: a.author_name ?? settings.author,
        featuredImage: featuredUrl,
        imageAlt: a.featured?.alt_text ?? null,
        date,
        draft: mode === "unpublish",
        markdown,
      },
      collection,
      map,
    )
    files.unshift({ path, content: post.text })

    const kind: CommitKind = mode === "unpublish" ? "unpublish" : a.git_path ? "update" : "publish"
    const res = await gh.commitFiles({
      owner: c.owner,
      repo: c.repo,
      branch: c.branch,
      files,
      deletes: a.git_path && a.git_path !== path ? [a.git_path] : [],
      message: commitMessage(kind, a.title, a.id, version),
      author,
      existing,
    })
    if (res.commitSha) await callDeployHook(admin, c.id)

    const url = liveUrl(c.site_url, c.url_pattern, { slug, date })
    const blob = res.blobs[path]
    const committedMeta = {
      git_path: path,
      git_blob_sha: blob,
      git_media: [...new Set(media)],
      live_url: url ?? "",
      sent_version: version,
    }

    if (mode === "unpublish") {
      await store(admin, articleId, {
        release: true,
        actor,
        status: "draft",
        force: true,
        event: "unpublished",
        ...committedMeta,
        ...(res.commitSha ? { git_commit_sha: res.commitSha } : {}),
        git_deploy_state: "none",
        error: "",
      })
      return { ok: true, status: "draft", url, committed: Boolean(res.commitSha), commitSha: res.commitSha }
    }

    const wasLive = a.status === "published"
    // Nothing changed and it's already live: done. Otherwise wait for (or re-check) the build.
    const deployState = !res.commitSha && wasLive ? null : "waiting"
    await store(admin, articleId, {
      release: true,
      actor,
      ...(wasLive ? { event: "edited" } : { status: "publishing" }),
      ...committedMeta,
      ...(res.commitSha ? { git_commit_sha: res.commitSha } : {}),
      ...(deployState ? { git_deploy_state: deployState, git_deploy_error: "" } : {}),
      ...(mode === "now" ? { publish_at: null } : {}),
      error: "",
    })
    return { ok: true, status: wasLive ? "published" : "publishing", url, committed: Boolean(res.commitSha), commitSha: res.commitSha ?? a.git_commit_sha }
  } catch (e) {
    const message = e instanceof GitHubError ? e.message : e instanceof Error && !/GITHUB_APP_/.test(e.message) ? e.message : gitHubProblem(e)
    const auth = e instanceof GitHubError && (e.code === "auth" || e.code === "forbidden")
    if (auth) {
      await admin.rpc("git_set_connection_status", { p_id: c.id, p_status: "needs_attention", p_error: message, p: {} })
    }
    return fail(message, a.status === "draft" || a.status === "failed" || mode === "scheduled" ? { status: "failed", force: true } : {})
  }
}

/** The optional Vercel / Netlify build hook (hosts that don't build on push). */
async function callDeployHook(admin: Db, connectionId: string) {
  const { data: hook } = await admin.rpc("git_connection_secret", { p_id: connectionId, p_kind: "deploy_hook" })
  if (!hook || !/^https:\/\/(api\.vercel\.com|api\.netlify\.com)\//.test(hook)) return
  await fetch(hook, { method: "POST", signal: AbortSignal.timeout(10_000), cache: "no-store" }).catch(() => null)
}
