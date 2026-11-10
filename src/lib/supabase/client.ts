import { createBrowserClient } from "@supabase/ssr"

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env"
import type { Database } from "./database.types"

/** Supabase client for Client Components (sign-in forms, realtime later). */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
}
