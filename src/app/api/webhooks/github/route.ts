import { NextResponse, type NextRequest } from "next/server"

import type { Db } from "@/lib/dataforseo/client"
import { isGitHubWebhook } from "@/lib/github/app"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"

/**
 * GitHub App webhooks (docs/plans/git-cms/03-github-library.md). Signed with
 * GITHUB_APP_WEBHOOK_SECRET (X-Hub-Signature-256). Only the ids are used from the payload:
 * when the app is removed or a repo is taken away, those sites need attention straight away.
 * Everything else is answered 204; the daily health check reads the real state from GitHub.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text()
  if (raw.length > 5_000_000) return new NextResponse(null, { status: 413 })
  if (!isGitHubWebhook(raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 })
  }
  if (!hasSupabaseSecretKey()) return new NextResponse(null, { status: 503 })

  const event = request.headers.get("x-github-event") ?? ""
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  const action = String(body.action ?? "")
  const installationId = Number((body.installation as { id?: unknown } | undefined)?.id)
  if (!Number.isSafeInteger(installationId) || installationId <= 0) return new NextResponse(null, { status: 204 })

  const admin = createSupabaseAdminClient() as unknown as Db
  const mark = async (ids: string[], reason: string) => {
    for (const id of ids) {
      await admin.rpc("git_set_connection_status", { p_id: id, p_status: "needs_attention", p_error: reason, p: {} })
    }
  }

  if (event === "installation" && (action === "deleted" || action === "suspend")) {
    const { data } = await admin
      .from("git_connections")
      .select("id")
      .eq("installation_id", installationId)
      .neq("status", "removed")
    await mark(
      (data ?? []).map((r) => r.id),
      action === "deleted"
        ? "The LeadMaker Publisher app was uninstalled on GitHub. Reconnect the site."
        : "The LeadMaker Publisher app was suspended on GitHub.",
    )
  } else if (event === "installation_repositories" && action === "removed") {
    const removed = Array.isArray(body.repositories_removed) ? body.repositories_removed : []
    const repoIds = removed
      .map((r) => Number((r as { id?: unknown }).id))
      .filter((n) => Number.isSafeInteger(n) && n > 0)
      .slice(0, 500)
    if (repoIds.length) {
      const { data } = await admin
        .from("git_connections")
        .select("id")
        .eq("installation_id", installationId)
        .in("repo_id", repoIds)
        .neq("status", "removed")
      await mark(
        (data ?? []).map((r) => r.id),
        "The repository was removed from the LeadMaker Publisher app on GitHub. Add it back, or reconnect.",
      )
    }
  }
  return new NextResponse(null, { status: 204 })
}
