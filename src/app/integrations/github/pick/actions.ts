"use server"

import { redirect } from "next/navigation"

import { checkAttempt, failRedirect, finishConnect, forgetState, installationRepos, readState } from "@/features/git-sites/connect"
import type { Db } from "@/lib/dataforseo/client"
import { gitHubProblem } from "@/lib/github/app"
import { requestOrigin } from "@/lib/origin"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * The repo picker's Continue button. The state comes from the httpOnly cookie the callback set;
 * the repo must be one the (already verified) installation can see.
 */
export async function pickRepo(formData: FormData) {
  const origin = await requestOrigin()
  const admin = createSupabaseAdminClient() as unknown as Db
  const s = await readState()
  if (!s) redirect("/dashboard?result=git_error&message=This%20connection%20link%20expired.")
  const attempt = await checkAttempt(admin, s)
  if (!attempt.ok || !attempt.installation_id) {
    await forgetState()
    redirect(await failRedirect(admin, attempt, origin, "This connection link expired or was already used. Start again."))
  }
  const repoId = Number(formData.get("repo"))
  let target: string
  try {
    const { repos } = await installationRepos(attempt.installation_id)
    const repo = repos.find((r) => r.id === repoId)
    if (!repo) {
      target = await failRedirect(admin, attempt, origin, "Pick one of the repositories in the list.")
    } else {
      const done = await finishConnect(admin, s, attempt, attempt.installation_id, repo, origin)
      target = done.ok ? done.redirect : await failRedirect(admin, attempt, origin, done.error)
    }
  } catch (e) {
    target = await failRedirect(admin, attempt, origin, gitHubProblem(e))
  }
  await forgetState()
  redirect(target)
}
