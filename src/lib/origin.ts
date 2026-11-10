import "server-only"

import { headers } from "next/headers"

/** The public origin of the current request ("https://app.example.com"), proxy-aware. */
export async function requestOrigin() {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${protocol}://${host}`
}
