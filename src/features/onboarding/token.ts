import "server-only"

import { randomInt } from "node:crypto"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

/** A new onboarding link token: 22 base62 characters from the OS random source (~131 bits; unbiased). */
export function newToken() {
  let out = ""
  for (let i = 0; i < 22; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}
