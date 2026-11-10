import { createBrowserClient } from "@supabase/ssr"

import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env"
import type { Database } from "./database.types"

/** Supabase client for Client Components (sign-in forms, realtime later). */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabasePublishableKey())
}
