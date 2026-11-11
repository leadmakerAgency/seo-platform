import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env"
import type { Database } from "./database.types"

/** Routes that work without a session. Everything else requires sign-in. */
/** "/c/<token>" is the client portal: no sign-in, the token is the key. */
const PUBLIC_PATHS = ["/login", "/setup", "/auth", "/c"]
/** Routes a signed-in user has no reason to see. */
const SIGNED_OUT_ONLY = ["/login", "/setup"]

function matches(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Refreshes the Supabase session cookie on every request and does the
 * optimistic auth redirects. Real authorization happens in lib/auth.ts and RLS.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  // Keep getClaims() directly after creating the client: it refreshes the token.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)
  const { pathname, search } = request.nextUrl

  // API routes answer with JSON, never a redirect to the login page, so callers
  // (like the Ctrl/Cmd+K switcher) get an error they can handle.
  if (!signedIn && matches(pathname, ["/api"])) {
    const unauthorized = NextResponse.json({ error: "Not signed in" }, { status: 401 })
    response.cookies.getAll().forEach((cookie) => unauthorized.cookies.set(cookie))
    return unauthorized
  }

  if (!signedIn && !matches(pathname, PUBLIC_PATHS)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = ""
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`)
    return redirectWithCookies(url, response)
  }

  if (signedIn && matches(pathname, SIGNED_OUT_ONLY)) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    url.search = ""
    return redirectWithCookies(url, response)
  }

  return response
}

function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url)
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}
