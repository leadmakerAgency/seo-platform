import { after, NextResponse } from "next/server"

import { processResearchRuns } from "@/features/rankings/research"
import { syncAndResolve } from "@/features/rankings/setup"
import { recoverTasks, startQueuedRuns } from "@/features/rankings/tracker"
import { accountBalance } from "@/lib/dataforseo/api"
import type { Db } from "@/lib/dataforseo/client"
import { hasDataForSeo } from "@/lib/env.server"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"

/**
 * Every 10 minutes (pg_cron, migration 0027), with a bearer token only the database knows:
 * 1. queue clients whose weekly check is due, 2. start queued runs (weekly, Check now, new
 * keywords), 3. recover results DataForSEO couldn't deliver, 4. finish runs, 5. run queued
 * keyword research in the background, 6. once a day: balance check and location look-ups.
 */
export async function POST(request: Request) {
  if (!hasSupabaseSecretKey()) return NextResponse.json({ error: "Not configured" }, { status: 503 })
  const token = /^Bearer\s+([A-Za-z0-9]{16,200})$/.exec(request.headers.get("authorization") ?? "")?.[1]
  const db = createSupabaseAdminClient() as Db
  const { data: valid } = token
    ? await db.rpc("verify_rankings_token", { p_kind: "cron", p_token: token })
    : { data: false }
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!hasDataForSeo()) {
    return NextResponse.json({ ok: true, skipped: "DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are missing" })
  }

  const report: Record<string, unknown> = {}
  try {
    const { data: queued } = await db.rpc("dfs_queue_due_runs", { p_limit: 25 })
    report.queued = queued
    report.started = await startQueuedRuns(db, 10)
    report.recovered = await recoverTasks(db)
    const { data: finished } = await db.rpc("dfs_finalize_runs")
    report.finished = (finished as string[] | null)?.length ?? 0
  } catch (e) {
    console.error("[rankings] cron tick failed", e)
    report.error = e instanceof Error ? e.message : String(e)
  }

  // Slow work after the response (research makes several Live calls).
  after(async () => {
    try {
      await processResearchRuns(db, 1)
      await dailyChecks(db)
    } catch (e) {
      console.error("[rankings] background work failed", e)
    }
  })

  return NextResponse.json({ ok: true, ...report })
}

async function dailyChecks(db: Db) {
  const { data: settings } = await db
    .from("dfs_settings")
    .select("last_balance_at, low_balance_usd")
    .eq("id", true)
    .single()
  const due = !settings?.last_balance_at || Date.parse(settings.last_balance_at) < Date.now() - 86_400_000
  if (!due) return

  const balance = await accountBalance(db)
  await db
    .from("dfs_settings")
    .update({ last_balance_usd: balance, last_balance_at: new Date().toISOString() })
    .eq("id", true)
  if (balance !== null && settings && balance < Number(settings.low_balance_usd)) {
    const { data: admins } = await db
      .from("team_members")
      .select("id")
      .eq("role", "admin")
      .eq("status", "active")
    if (admins?.length) {
      await db.from("notifications").insert(admins.map((a) => ({ recipient_id: a.id, kind: "dfs_low_balance" as const })))
    }
  }

  // Clients whose location couldn't be looked up yet (a few per day).
  const { data: pending } = await db
    .from("rank_settings")
    .select("client_id, client:clients!inner(country_code)")
    .is("location_code", null)
    .limit(3)
  for (const p of pending ?? []) {
    const iso = (p.client as { country_code: string } | null)?.country_code
    if (iso) await syncAndResolve(db, p.client_id, iso).catch((e) => console.error("[rankings] location", e))
  }
}
