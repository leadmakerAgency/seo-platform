import "server-only"

import { after } from "next/server"

import type { ActionResult } from "@/features/tasks/schemas"
import type { Db } from "@/lib/dataforseo/client"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { followDeploy } from "./deploy"
import { runGitSend, type GitSendMode, type GitSendResult } from "./publish"

/**
 * The Git-site side of the Content article actions (publish now, schedule, update, unpublish,
 * delete). content/actions.ts checks `content.write` and calls these when the article's
 * destination is a Git site. A conflict (edited or deleted on the site, address taken) comes
 * back as fieldErrors.conflict so the editor can offer Overwrite.
 */

const NO_SERVICE = "The server is missing SUPABASE_SECRET_KEY, so it can't publish to the site."
const admin = () => createSupabaseAdminClient() as unknown as Db

type Visible = { id: string; status: string; title: string; publish_at: string | null; git_path: string | null; version: number }

/** The article as the person sees it (RLS), so nobody acts on an article they can't see. */
async function visible(db: Db, id: string): Promise<Visible | null> {
  const { data } = await db
    .from("content_articles")
    .select("id, status, title, publish_at, git_path, version")
    .eq("id", id)
    .eq("site_kind", "git")
    .maybeSingle()
  return (data as Visible | null) ?? null
}

async function claim(db: Db, id: string): Promise<number | null> {
  const { data } = await db.rpc("content_claim_send", { p_kind: "article", p_id: id })
  const c = data as { ok: boolean; version: number | null } | null
  return c?.ok && c.version ? c.version : null
}

function asAction(r: GitSendResult): ActionResult<{ status: string; url: string | null }> {
  if (r.ok) return { ok: true, data: { status: r.status, url: r.url } }
  return { ok: false, error: r.error, ...(r.conflict ? { fieldErrors: { conflict: r.conflict } } : {}) }
}

async function send(
  userDb: Db,
  memberId: string,
  articleId: string,
  mode: GitSendMode,
  opts: { force?: boolean; allowed: string[]; notAllowed: string },
): Promise<ActionResult<{ status: string; url: string | null }>> {
  if (!hasSupabaseSecretKey()) return { ok: false, error: NO_SERVICE }
  const a = await visible(userDb, articleId)
  if (!a) return { ok: false, error: "Unknown article." }
  if (!a.title.trim()) return { ok: false, error: "Give the article a title first." }
  if (!opts.allowed.includes(a.status)) return { ok: false, error: opts.notAllowed }
  const db = admin()
  const version = await claim(db, articleId)
  if (!version) return { ok: false, error: "This article is being sent right now. Give it a moment." }
  const r = await runGitSend(db, articleId, { mode, version, actor: memberId, force: opts.force })
  if (r.ok && r.status !== "draft") after(() => followDeploy(createSupabaseAdminClient() as unknown as Db, articleId).then(() => undefined))
  return asAction(r)
}

export function gitPublishNow(userDb: Db, memberId: string, articleId: string, force = false) {
  return send(userDb, memberId, articleId, "now", {
    force,
    allowed: ["draft", "failed", "scheduled", "cancelled"],
    notAllowed: "This article is already on the site. Use Update on the site.",
  })
}

export function gitUpdate(userDb: Db, memberId: string, articleId: string, force = false) {
  return send(userDb, memberId, articleId, "update", {
    force,
    allowed: ["published"],
    notAllowed: "Only published articles can be updated on the site.",
  })
}

export async function gitUnpublish(userDb: Db, memberId: string, articleId: string, force = false) {
  if (!hasSupabaseSecretKey()) return { ok: false as const, error: NO_SERVICE }
  const a = await visible(userDb, articleId)
  if (!a) return { ok: false as const, error: "Unknown article." }
  // Scheduled but never sent: nothing is on the site yet.
  if (!a.git_path) {
    if (a.status !== "scheduled") return { ok: false as const, error: "This article isn't on the site." }
    const db = admin()
    const version = await claim(db, articleId)
    if (!version) return { ok: false as const, error: "This article is being sent right now. Give it a moment." }
    await db.rpc("git_store_article_result", {
      p_article_id: articleId,
      p: { release: true, actor: memberId, status: "draft", event: "unpublished" },
    })
    return { ok: true as const, data: { status: "draft", url: null } }
  }
  return send(userDb, memberId, articleId, "unpublish", {
    force,
    allowed: ["published", "failed", "publishing"],
    notAllowed: "This article isn't published on the site.",
  })
}

export function gitDelete(userDb: Db, memberId: string, articleId: string) {
  return send(userDb, memberId, articleId, "delete", {
    allowed: ["published", "failed", "draft", "publishing"],
    notAllowed: "This article can't be removed from the site right now.",
  })
}

/** Schedule: nothing goes to GitHub yet; the content-publish cron commits it when it's due. */
export async function gitSchedule(userDb: Db, memberId: string, articleId: string): Promise<ActionResult<{ status: string; url: string | null }>> {
  if (!hasSupabaseSecretKey()) return { ok: false, error: NO_SERVICE }
  const a = await visible(userDb, articleId)
  if (!a) return { ok: false, error: "Unknown article." }
  if (!a.title.trim()) return { ok: false, error: "Give the article a title first." }
  if (!["draft", "failed", "cancelled", "scheduled"].includes(a.status)) {
    return { ok: false, error: "This article is already on the site. Use Update on the site." }
  }
  if (!a.publish_at || Date.parse(a.publish_at) < Date.now() + 2 * 60 * 1000) {
    return { ok: false, error: "Pick a publish time at least 2 minutes from now." }
  }
  const db = admin()
  const { data: c } = await db
    .from("content_articles")
    .select("git:git_connections!content_articles_git_connection_id_fkey(status, folder, url_pattern, site_url)")
    .eq("id", articleId)
    .maybeSingle()
  const site = (c?.git ?? null) as { status: string; folder: string | null; url_pattern: string | null; site_url: string | null } | null
  if (!site || site.status === "removed") return { ok: false, error: "Pick the Git site for this article first." }
  if (!site.folder || !site.url_pattern || !site.site_url) {
    return { ok: false, error: "Finish Set up site in Connections (post folder, site address and URL pattern) first." }
  }
  const version = await claim(db, articleId)
  if (!version) return { ok: false, error: "This article is being sent right now. Give it a moment." }
  await db.rpc("git_store_article_result", {
    p_article_id: articleId,
    p: { release: true, actor: memberId, status: "scheduled", force: true, error: "" },
  })
  return { ok: true, data: { status: "scheduled", url: null } }
}
