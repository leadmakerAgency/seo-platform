import { createClient } from "@supabase/supabase-js"

import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env"
import type { Database } from "./database.types"

/**
 * A client with no session at all (the "anon" role). Used by the client portal,
 * where the private link's token is the only key and every call goes through
 * the token-checked portal_* database functions. Safe on the server and in the
 * browser; it never reads or writes cookies.
 */
export function createSupabasePublicClient() {
  return createClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
