import "server-only"

import type { Db } from "@/lib/dataforseo/client"
import type { DeployStatus } from "@/lib/github/core"
import type { Json } from "@/lib/supabase/database.types"
import { isPublicSiteUrl } from "./files"
import { clientFor } from "./server"

/**
 * After a commit: is the post live? (docs/plans/git-cms/06-pipeline.md)
 * 1. The host's status for the commit: GitHub deployments (Vercel) or commit statuses (Netlify).
 * 2. The page itself: 200 and the article's title in the HTML.
 * Failed builds and posts not live after 30 minutes are marked failed, with the reason.
 */

const GIVE_UP_MS = 30 * 60_000
const NO_STATUS_GRACE_MS = 3 * 60_000
const MAX_PAGE_BYTES = 2_000_000

export type DeployCheck = "live" | "building" | "waiting" | "failed" | "skipped"

/** Collapses whitespace and decodes the HTML entities titles usually contain. */
export function normaliseTitle(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|rdquo|ldquo|ndash|mdash|hellip);/g, (m, e: string) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" })[e] ?? m,
    )
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/** The page answers 200 and shows the title (a stale build or a 404 page doesn't count). */
export async function pageIsLive(url: string, title: string): Promise<{ live: boolean; status: number | null }> {
  if (!isPublicSiteUrl(url)) return { live: false, status: null }
  try {
    const res = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "LeadMaker-Publisher (live check)", Accept: "text/html" },
    })
    if (!res.ok || !res.body) {
      await res.body?.cancel()
      return { live: false, status: res.status }
    }
    // Read at most 2 MB.
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (size < MAX_PAGE_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.length
    }
    await reader.cancel().catch(() => undefined)
    const html = Buffer.concat(chunks).toString("utf8")
    const want = normaliseTitle(title)
    return { live: want.length > 0 && normaliseTitle(html.replace(/<[^>]+>/g, " ")).includes(want), status: res.status }
  } catch {
    return { live: false, status: null }
  }
}

const failMessage = (d: DeployStatus | null, status: number | null) =>
  d?.state === "failure"
    ? `Committed to GitHub, but the site's build failed${d.description ? `: ${d.description}` : "."}`
    : `Committed to GitHub, but the post isn't live after 30 minutes${status ? ` (the page answers ${status})` : ""}. Check the host's dashboard.`

/** Checks one article that is waiting for its build. Safe to call repeatedly. */
export async function checkGitDeploy(admin: Db, articleId: string): Promise<DeployCheck> {
  const { data: a } = await admin
    .from("content_articles")
    .select("id, title, status, git_connection_id, git_commit_sha, git_committed_at, git_deploy_state, live_url")
    .eq("id", articleId)
    .maybeSingle()
  if (!a || !a.git_connection_id || !a.git_commit_sha || !["waiting", "building"].includes(a.git_deploy_state)) return "skipped"
  const { data: c } = await admin
    .from("git_connections")
    .select("id, auth_method, installation_id, repo_id, owner, repo, status")
    .eq("id", a.git_connection_id)
    .maybeSingle()
  if (!c || c.status === "removed") return "skipped"

  const since = Date.now() - Date.parse(a.git_committed_at ?? new Date().toISOString())
  const isUpdate = a.status === "published"
  const store = (p: Record<string, unknown>) => admin.rpc("git_store_article_result", { p_article_id: a.id, p: p as Json })

  let deploy: DeployStatus | null = null
  try {
    const gh = await clientFor(admin, c)
    deploy = (await gh.deploymentsFor(c.owner, c.repo, a.git_commit_sha)) ?? (await gh.combinedStatus(c.owner, c.repo, a.git_commit_sha))
  } catch {
    deploy = null // GitHub unreachable: fall back to the page check.
  }

  if (deploy?.state === "failure") {
    await store({
      git_deploy_state: "failed",
      git_deploy_error: failMessage(deploy, null),
      git_deploy_url: deploy.logUrl ?? "",
      ...(isUpdate ? {} : { status: "failed", error: failMessage(deploy, null) }),
    })
    return "failed"
  }

  const hostDone = deploy?.state === "success" || (!deploy && since > NO_STATUS_GRACE_MS)
  const page = hostDone && a.live_url ? await pageIsLive(a.live_url, a.title) : { live: false, status: null }
  if (page.live) {
    await store({
      git_deploy_state: "live",
      git_deploy_error: "",
      ...(deploy?.logUrl ? { git_deploy_url: deploy.logUrl } : {}),
      ...(isUpdate ? {} : { status: "published" }),
    })
    return "live"
  }
  if (since > GIVE_UP_MS) {
    const message = failMessage(null, page.status)
    await store({ git_deploy_state: "failed", git_deploy_error: message, ...(isUpdate ? {} : { status: "failed", error: message }) })
    return "failed"
  }
  const next = deploy?.state === "building" || deploy?.state === "success" ? "building" : a.git_deploy_state === "building" ? "building" : "waiting"
  if (next !== a.git_deploy_state) await store({ git_deploy_state: next, ...(deploy?.logUrl ? { git_deploy_url: deploy.logUrl } : {}) })
  return next
}

/** After Publish now / Update: check every 15 s for up to ~2 minutes; the cron does the rest. */
export async function followDeploy(admin: Db, articleId: string, budgetMs = 120_000): Promise<DeployCheck> {
  const end = Date.now() + budgetMs
  let last: DeployCheck = "waiting"
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 15_000))
    last = await checkGitDeploy(admin, articleId)
    if (last === "live" || last === "failed" || last === "skipped") return last
  }
  return last
}
