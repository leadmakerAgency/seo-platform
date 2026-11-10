import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { safeNextPath } from "@/features/auth/schemas"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Email confirmation callback. Handles both link styles Supabase can send:
 * PKCE (?code=) from the default template, and ?token_hash=&type= from a
 * custom template.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = safeNextPath(searchParams.get("next"))

  const supabase = await createSupabaseServerClient()
  let ok = false

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    ok = !error
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    ok = !error
  }

  const url = request.nextUrl.clone()
  url.search = ""
  if (ok) {
    url.pathname = next
  } else {
    url.pathname = "/login"
    url.searchParams.set("error", "link")
  }
  return NextResponse.redirect(url)
}
