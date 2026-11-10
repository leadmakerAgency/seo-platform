import type { NextConfig } from "next"
import { PHASE_PRODUCTION_BUILD } from "next/constants"

/**
 * NEXT_PUBLIC_* values are baked into the JavaScript at build time, so they
 * must exist when `next build` runs, not only when the server starts. In
 * production they come from the committed .env.production (host env vars win).
 * Fail the build straight away with instructions instead of crashing later
 * with a stack trace (or shipping a browser bundle without them).
 */
const REQUIRED_AT_BUILD = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]

function assertBuildEnv() {
  const missing = REQUIRED_AT_BUILD.filter((name) => !process.env[name])
  if (missing.length === 0) return
  throw new Error(
    [
      `Missing build-time environment variables: ${missing.join(", ")}.`,
      "They normally come from the committed .env.production file. Check that it exists",
      "in the deployed commit and isn't excluded by .gitignore.",
      "Locally: copy .env.example to .env.local and fill it in.",
      'On a host you can also set them as environment variables with scope "Build and Run Time".',
      "See docs/deploy.md.",
    ].join("\n"),
  )
}

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) assertBuildEnv()

  return {
    cacheComponents: true,
    partialPrefetching: true,
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  }
}
