import { NextResponse } from "next/server"

import { checkGitDeploy } from "@/features/git-sites/deploy"
import { runGitSend } from "@/features/git-sites/publish"
import { checkGitConnection } from "@/features/git-sites/server"
import type { Db } from "@/lib/dataforseo/client"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"

/**
 * Every 5 minutes, called by pg_cron (migration 0068) with a bearer token only the database
 * knows (docs/plans/git-cms/06-pipeline.md):
 * 1. Git-site articles whose scheduled time has come are committed (static sites hide future
 *    posts until the next build, so nothing is committed early);
 * 2. builds of recent commits are checked until the post is live (or failed);
 * 3. once a day, each Git site's connection is checked.
 * Each part has a time budget so one run stays well under a minute.
 */
export const maxDuration = 60

const BUDGET_MS = 50_000

export async function POST(request: Request) {
  if (!hasSupabaseSecretKey()) return NextResponse.json({ error: "Not configured" }, { status: 503 })
  const token = /^Bearer\s+([A-Za-z0-9]{16,200})$/.exec(request.headers.get("authorization") ?? "")?.[1]
  const db = createSupabaseAdminClient() as unknown as Db
  const { data: valid } = token ? await db.rpc("verify_content_cron_token", { p_token: token }) : { data: false }
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const started = Date.now()
  const left = () => BUDGET_MS - (Date.now() - started)
  const out = { published: 0, failed: 0, checked: 0, live: 0, sites: 0 }

  // 1. Due scheduled articles (oldest first).
  const { data: due } = await db
    .from("content_articles")
    .select("id")
    .eq("site_kind", "git")
    .eq("status", "scheduled")
    .lte("publish_at", new Date().toISOString())
    .order("publish_at", { ascending: true })
    .limit(10)
  for (const a of due ?? []) {
    if (left() < 15_000) break
    const { data: claim } = await db.rpc("content_claim_send", { p_kind: "article", p_id: a.id })
    const c = claim as { ok: boolean; version: number | null } | null
    if (!c?.ok || !c.version) continue
    const r = await runGitSend(db, a.id, { mode: "scheduled", version: c.version, actor: null }).catch((error) => {
      console.error("[git-sites] scheduled send failed", error)
      return null
    })
    if (r?.ok) out.published++
    else out.failed++
  }

  // 2. Builds waiting to go live.
  const { data: deploying } = await db
    .from("content_articles")
    .select("id")
    .eq("site_kind", "git")
    .in("git_deploy_state", ["waiting", "building"])
    .order("git_committed_at", { ascending: true })
    .limit(20)
  for (const a of deploying ?? []) {
    if (left() < 8_000) break
    const r = await checkGitDeploy(db, a.id).catch(() => "skipped" as const)
    out.checked++
    if (r === "live") out.live++
  }

  // 3. Daily connection health (a few per run).
  const { data: sites } = await db
    .from("git_connections")
    .select("id")
    .in("status", ["connected", "needs_attention"])
    .or(`last_checked_at.is.null,last_checked_at.lt.${new Date(Date.now() - 24 * 3600_000).toISOString()}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(5)
  for (const s of sites ?? []) {
    if (left() < 8_000) break
    await checkGitConnection(db, s.id).catch(() => null)
    out.sites++
  }

  // Old one-time connect states.
  await db.from("git_connect_attempts").delete().lt("expires_at", new Date(Date.now() - 7 * 24 * 3600_000).toISOString())

  return NextResponse.json({ ok: true, ...out, ms: Date.now() - started })
}
