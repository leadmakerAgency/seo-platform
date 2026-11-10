/**
 * Public environment variables, read lazily.
 *
 * NEXT_PUBLIC_* values are inlined into the bundle at build time, so each one
 * must be read with a literal `process.env.NEXT_PUBLIC_…` expression (no
 * dynamic lookups). Reading happens when a Supabase client is created, not
 * when a module is imported, so importing this file never crashes a build.
 * A missing value is caught up front by the check in next.config.ts.
 */

export const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const

function missing(name: string): never {
  throw new Error(
    `Missing environment variable ${name}. Locally, copy .env.example to .env.local. ` +
      `On a host (DigitalOcean App Platform), add it under Settings > Environment Variables ` +
      `with scope "Build and Run Time", then redeploy.`,
  )
}

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || missing("NEXT_PUBLIC_SUPABASE_URL")
}

export function getSupabasePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    missing("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  )
}
