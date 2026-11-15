import { gunzipSync } from "node:zlib"

import { after, NextResponse, type NextRequest } from "next/server"

import type { Db } from "@/lib/dataforseo/client"
import { applyTaskResult } from "@/features/rankings/tracker"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"

/**
 * DataForSEO postback: POST /api/webhooks/dataforseo?t=<token>&id=<task id>
 * with the task's advanced result (often gzip). The token is a Vault secret; only task
 * ids we posted are accepted, and each is stored once (public.dfs_store_rank).
 * Answers within 10 s: 200 for handled, duplicate and unknown tasks; 500 only when we
 * couldn't store a result, so DataForSEO keeps it in tasks_ready for the cron to collect.
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseSecretKey()) return NextResponse.json({ error: "Not configured" }, { status: 503 })
  const db = createSupabaseAdminClient() as Db

  const token = request.nextUrl.searchParams.get("t") ?? ""
  if (!/^[A-Za-z0-9]{16,200}$/.test(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { data: valid } = await db.rpc("verify_rankings_token", { p_kind: "postback", p_token: token })
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { tasks?: { id?: string; status_code?: number; status_message?: string; cost?: number; result?: unknown[] | null }[] }
  try {
    const bytes = Buffer.from(await request.arrayBuffer())
    const text = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes).toString("utf8") : bytes.toString("utf8")
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "Unreadable body" }, { status: 400 })
  }

  const queryId = request.nextUrl.searchParams.get("id")
  const outcomes: string[] = []
  try {
    for (const task of body.tasks ?? []) {
      const id = task.id ?? queryId
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) continue
      const { data: row } = await db
        .from("serp_tasks")
        .select("id, client_id, engine, status")
        .eq("id", id)
        .maybeSingle()
      if (!row) {
        outcomes.push("unknown")
        continue
      }
      if (row.status !== "posted") {
        outcomes.push("duplicate")
        continue
      }
      const cost = typeof task.cost === "number" ? task.cost : null
      if (task.status_code === 20000) {
        const result = (task.result?.[0] ?? null) as Record<string, unknown> | null
        outcomes.push(await applyTaskResult(db, row, result, cost))
      } else if (task.status_code === 40102) {
        outcomes.push(await applyTaskResult(db, row, { items: [] }, cost))
      } else {
        const { data } = await db.rpc("dfs_fail_task", {
          p_task_id: id,
          p_status: "failed",
          p_code: task.status_code ?? 0,
          p_message: task.status_message ?? "Task failed",
        })
        outcomes.push(String(data))
      }
    }
  } catch (e) {
    console.error("[dataforseo] postback could not be stored", e)
    return NextResponse.json({ error: "Could not store" }, { status: 500 })
  }

  after(async () => {
    const { error } = await db.rpc("dfs_finalize_runs")
    if (error) console.error("[dataforseo] finalize failed", error.message)
  })
  return NextResponse.json({ ok: true, outcomes })
}
