import { NextResponse, type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/proxy"

const ONBOARDING_PAGE = /^\/(?:[a-z0-9-]+-)?[A-Za-z0-9]{22}$/
const PRIVATE_HEADERS: Record<string, string> = {
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "private, no-store",
}

/**
 * The client onboarding subdomain (ONBOARDING_HOST, e.g. connect.leadmaker.agency)
 * serves only the onboarding wizard. Nothing else from the app answers there,
 * and team sessions are never touched.
 */
function onboardingHost(request: NextRequest) {
  const { pathname } = request.nextUrl
  let target: string | null = null
  if (pathname === "/") target = "/onboard"
  else if (pathname === "/done") target = "/onboard/done"
  else if (ONBOARDING_PAGE.test(pathname)) target = `/onboard${pathname}`

  if (!target) return new NextResponse("Not found", { status: 404, headers: PRIVATE_HEADERS })
  const url = request.nextUrl.clone()
  url.pathname = target
  const response = NextResponse.rewrite(url)
  for (const [key, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(key, value)
  return response
}

export async function proxy(request: NextRequest) {
  const configured = process.env.ONBOARDING_HOST?.trim().toLowerCase()
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
  if (configured && host === configured) return onboardingHost(request)
  return updateSession(request)
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
