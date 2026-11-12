import { NextResponse, type NextRequest } from "next/server"

import { syncClient, type Db } from "@/features/connections/sync"
import { requestOrigin } from "@/lib/origin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Zernio sends the browser here after its hosted sign-in, with
 * ?attempt=<our id> plus either connected=…&accountId=… or error=….
 *
 * Nothing in the query is trusted: the attempt must be pending, unexpired and
 * started by this user, and the accounts come from Zernio's own API (sync).
 * The redirect target is built from the database, never from the query.
 */
export async function GET(request: NextRequest) {
  const origin = await requestOrigin()
  const params = request.nextUrl.searchParams
  const attemptId = params.get("attempt") ?? ""
  const go = (path: string) => NextResponse.redirect(new URL(path, origin), { status: 303 })

  const supabase = (await createSupabaseServerClient()) as unknown as Db
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) return go("/login")
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) return go("/dashboard")

  const { data: attempt } = await supabase
    .from("social_connect_attempts")
    .select("id, client_id, platform, status, expires_at, created_by, client:clients(slug)")
    .eq("id", attemptId)
    .maybeSingle()
  if (!attempt?.client) return go("/dashboard")

  const page = `/clients/${attempt.client.slug}/connections`
  const result = (values: Record<string, string>) =>
    go(`${page}?${new URLSearchParams({ platform: attempt.platform, ...values }).toString()}`)

  const stale =
    attempt.status !== "pending" ||
    attempt.created_by !== userId ||
    Date.parse(attempt.expires_at) < Date.now()
  if (stale) return result({ result: "stale" })

  const error = params.get("error")
  if (error) {
    const message = (params.get("error_message") ?? "").slice(0, 300)
    await supabase
      .from("social_connect_attempts")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_code: error.slice(0, 100),
        error_message: message || null,
        zernio_request_id: params.get("request_id")?.slice(0, 200) ?? null,
      })
      .eq("id", attempt.id)
      .eq("status", "pending")
    return result({ result: "error", code: error.slice(0, 100), ...(message ? { message } : {}) })
  }

  try {
    await syncClient(supabase, attempt.client_id, userId)
  } catch (e) {
    console.error("[zernio] callback sync failed", e)
    return result({ result: "check" })
  }

  // Only an account that sync found in this client's own profile counts.
  const zernioAccountId = params.get("accountId")
  const { data: account } = zernioAccountId
    ? await supabase
        .from("social_accounts")
        .select("id")
        .eq("client_id", attempt.client_id)
        .eq("zernio_account_id", zernioAccountId)
        .maybeSingle()
    : { data: null }

  if (!account) return result({ result: "pending" })

  await supabase
    .from("social_connect_attempts")
    .update({
      status: "connected",
      result_account_id: account.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .eq("status", "pending")
  return result({ result: "connected" })
}
