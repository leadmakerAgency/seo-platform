import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env"
import type { Database } from "./database.types"

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * It acts as the signed-in user, so every query goes through RLS.
 * Reads cookies, so callers must sit inside a <Suspense> boundary.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component, which can't write cookies.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  })
}
