import "server-only"

/**
 * Server-only secrets, read lazily (never at module top level).
 * Locally in .env.local; on DigitalOcean as Encrypted, Run Time variables.
 * Never in .env.production or any NEXT_PUBLIC_ variable.
 */

export function hasZernioApiKey() {
  return Boolean(process.env.ZERNIO_API_KEY)
}

export function getZernioApiKey(): string {
  const key = process.env.ZERNIO_API_KEY
  if (!key) {
    throw new Error(
      "Missing ZERNIO_API_KEY. Add it to .env.local (and to the host as an encrypted Run Time variable).",
    )
  }
  return key
}

export function getZernioWebhookSecret(): string | null {
  return process.env.ZERNIO_WEBHOOK_SECRET || null
}

export function getZernioApiBase(): string {
  return (process.env.ZERNIO_API_BASE || "https://zernio.com/api/v1").replace(/\/+$/, "")
}
