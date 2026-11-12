import { createHash, timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { syncClient, type Db } from "@/features/connections/sync"
import { onboardingBase, onboardingLinkUrl } from "@/lib/env.server"
import { requestOrigin } from "@/lib/origin"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"

/**
 * Where Zernio sends the client back after signing in from the onboarding
 * link: ?a=<attempt id>&k=<one-time key> plus Zernio's connected / error params.
 * The key must match the hash stored on a pending onboarding attempt; the
 * accounts themselves come only from Zernio's API (sync), never from the query.
 */
export async function GET(request: NextRequest) {
  const origin = await requestOrigin()
  const params = request.nextUrl.searchParams
  const attemptId = params.get("a") ?? ""
  const key = params.get("k") ?? ""
  const inactive = () => NextResponse.redirect(onboardingBase(origin), { status: 303 })

  if (
    !hasSupabaseSecretKey() ||
    !/^[0-9a-f-]{36}$/i.test(attemptId) ||
    !/^[A-Za-z0-9_-]{20,100}$/.test(key)
  ) {
    return inactive()
  }

  const db = createSupabaseAdminClient() as unknown as Db
  const { data: attempt } = await db
    .from("social_connect_attempts")
    .select("id, client_id, platform, status, expires_at, source, callback_key_hash")
    .eq("id", attemptId)
    .maybeSingle()
  if (!attempt || attempt.source !== "onboarding" || !attempt.callback_key_hash) return inactive()

  const given = createHash("sha256").update(key).digest()
  const stored = Buffer.from(attempt.callback_key_hash, "hex")
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return inactive()

  const { data: link } = await db
    .from("onboarding_links")
    .select("token, expires_at, client:clients(slug)")
    .eq("client_id", attempt.client_id)
    .eq("status", "active")
    .maybeSingle()
  if (!link?.client || Date.parse(link.expires_at) < Date.now()) return inactive()

  const back = (values: Record<string, string>) =>
    NextResponse.redirect(
      `${onboardingLinkUrl(origin, link.client!.slug, link.token)}?${new URLSearchParams({
        step: "social",
        platform: attempt.platform,
        ...values,
      }).toString()}`,
      { status: 303 },
    )

  if (attempt.status !== "pending" || Date.parse(attempt.expires_at) < Date.now()) {
    return back({ result: "stale" })
  }

  const error = params.get("error")
  if (error) {
    await db
      .from("social_connect_attempts")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_code: error.slice(0, 100),
        error_message: (params.get("error_message") ?? "").slice(0, 300) || null,
        zernio_request_id: params.get("request_id")?.slice(0, 200) ?? null,
      })
      .eq("id", attempt.id)
      .eq("status", "pending")
    return back({ result: "error", code: error.slice(0, 100) })
  }

  try {
    await syncClient(db, attempt.client_id, null)
  } catch (e) {
    console.error("[onboarding] sync after connect failed", e)
    return back({ result: "check" })
  }

  const zernioAccountId = params.get("accountId")
  const { data: account } = zernioAccountId
    ? await db
        .from("social_accounts")
        .select("id")
        .eq("client_id", attempt.client_id)
        .eq("zernio_account_id", zernioAccountId)
        .maybeSingle()
    : { data: null }
  if (!account) return back({ result: "pending" })

  await db
    .from("social_connect_attempts")
    .update({
      status: "connected",
      result_account_id: account.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .eq("status", "pending")
  return back({ result: "connected" })
}
