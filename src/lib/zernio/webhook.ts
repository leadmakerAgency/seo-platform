import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Zernio signs each delivery: X-Zernio-Signature is the lowercase hex
 * HMAC-SHA256 of the raw request body with our webhook secret.
 */
export function verifyZernioSignature(rawBody: string, header: string | null, secret: string) {
  if (!header || !/^[0-9a-f]{64}$/i.test(header.trim())) return false
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest()
  const given = Buffer.from(header.trim().toLowerCase(), "hex")
  return given.length === expected.length && timingSafeEqual(given, expected)
}
