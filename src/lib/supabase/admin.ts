import "server-only"

import { createClient } from "@supabase/supabase-js"

import { getSupabaseUrl } from "@/lib/env"
import type { Database } from "./database.types"

/**
 * Service client: bypasses RLS and can manage auth users. Server only, and
 * only for actions that already checked the caller's permission
 * (inviting, activating and removing team members).
 *
 * Needs SUPABASE_SECRET_KEY (Supabase > Project Settings > API keys, the
 * `sb_secret_…` key). Locally in .env.local; on DigitalOcean as an Encrypted
 * Run Time variable. Never in .env.production or any NEXT_PUBLIC_ variable.
 */
export function hasSupabaseSecretKey() {
  return Boolean(process.env.SUPABASE_SECRET_KEY)
}

export function createSupabaseAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!secretKey) {
    throw new Error(
      "Missing SUPABASE_SECRET_KEY. Add it to .env.local (and to the host as an encrypted Run Time variable).",
    )
  }
  return createClient<Database>(getSupabaseUrl(), secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
