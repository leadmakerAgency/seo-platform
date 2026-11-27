import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"

import { LeadMakerMark } from "@/components/brand/leadmaker-mark"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { checkAttempt, installationRepos, readState } from "@/features/git-sites/connect"
import type { Db } from "@/lib/dataforseo/client"
import { gitHubProblem } from "@/lib/github/app"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { pickRepo } from "./actions"

export const metadata: Metadata = {
  title: { absolute: "Pick the blog's repository" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
}

/**
 * Shown after installing LeadMaker Publisher on more than one repository: pick the one that
 * holds the blog. Used by the team and by clients from the onboarding link (no app menu).
 */
export default function PickRepoPage() {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-[640px] items-center px-4">
          <LeadMakerMark />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 pt-8 pb-20">
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
          <Picker />
        </Suspense>
      </main>
    </div>
  )
}

async function Picker() {
  // Per request: the state is in a cookie, and the server key may be missing at build time.
  await connection()
  const s = hasSupabaseSecretKey() ? await readState() : null
  const attempt = s ? await checkAttempt(createSupabaseAdminClient() as unknown as Db, s) : null
  if (!s || !attempt?.ok || !attempt.installation_id) {
    return (
      <Message title="This link expired">
        Connecting takes up to 30 minutes from the moment you click Connect. Go back and start again.
      </Message>
    )
  }

  let repos: Awaited<ReturnType<typeof installationRepos>>["repos"] = []
  let problem: string | null = null
  try {
    repos = (await installationRepos(attempt.installation_id)).repos
  } catch (e) {
    problem = gitHubProblem(e)
  }
  if (problem) return <Message title="GitHub didn't answer">{problem}</Message>

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Which repository holds the blog?</h1>
        <p className="text-sm text-muted-foreground">
          LeadMaker Publisher can see {repos.length} repositories. Pick the one with the website and its CMS
          (it usually has an <code className="rounded bg-muted px-1">admin/config.yml</code> file).
        </p>
      </div>
      <form action={pickRepo} className="flex flex-col gap-4">
        <fieldset className="flex max-h-[60svh] flex-col divide-y overflow-y-auto rounded-lg border bg-card">
          <legend className="sr-only">Repositories</legend>
          {repos.map((r, i) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50">
              <input type="radio" name="repo" value={r.id} defaultChecked={i === 0} className="size-4 accent-[var(--brand)]" required />
              <span className="min-w-0 flex-1 truncate font-medium">{r.fullName}</span>
              {r.private && <span className="text-xs text-muted-foreground">Private</span>}
            </label>
          ))}
        </fieldset>
        <Button type="submit" className="self-start">
          Continue
        </Button>
      </form>
    </>
  )
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{children}</p>
      <Link href="/" className="text-sm font-medium text-brand hover:underline">
        Back to LeadMaker
      </Link>
    </div>
  )
}
