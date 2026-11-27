import { NextResponse, type NextRequest } from "next/server"

import {
  checkAttempt,
  failRedirect,
  finishConnect,
  installationRepos,
  parseState,
  rememberState,
  type Attempt,
} from "@/features/git-sites/connect"
import type { Db } from "@/lib/dataforseo/client"
import { hasGitHubApp } from "@/lib/env.server"
import { gitHubProblem, userCanAccessInstallation } from "@/lib/github/app"
import { requestOrigin } from "@/lib/origin"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * GitHub sends the browser here after "LeadMaker Publisher" is installed (and the person
 * authorised), with ?installation_id&setup_action&code&state.
 *
 * Nothing in the query is trusted on its own:
 * - `state` must match a pending, unexpired attempt (only its key's sha256 is stored);
 * - `code` is swapped for the person's own GitHub token, and GET /user/installations must list
 *   `installation_id` (so an id passed in from elsewhere can't attach someone else's repo);
 * - a team attempt also needs the person who started it to be signed in here.
 * The redirect target is built from the database, never from the query.
 */
export async function GET(request: NextRequest) {
  const origin = await requestOrigin()
  const go = (path: string) => NextResponse.redirect(new URL(path, origin), { status: 303 })
  const params = request.nextUrl.searchParams
  const state = params.get("state")
  const s = parseState(state)
  if (!s || !hasSupabaseSecretKey() || !hasGitHubApp()) return go("/dashboard?result=git_error&message=This%20connection%20link%20isn%27t%20valid.")

  const admin = createSupabaseAdminClient() as unknown as Db
  const attempt: Attempt = await checkAttempt(admin, s)
  const fail = async (message: string) => go(await failRedirect(admin, attempt, origin, message))
  if (!attempt.ok) return fail("This connection link expired or was already used. Start again.")

  if (attempt.origin === "team") {
    const { data: row } = await admin.from("git_connect_attempts").select("created_by").eq("id", s.attemptId).maybeSingle()
    const supabase = await createSupabaseServerClient()
    const { data: auth } = await supabase.auth.getClaims()
    if (!auth?.claims?.sub || auth.claims.sub !== row?.created_by) {
      return fail("Sign in to LeadMaker as the person who started connecting, then start again.")
    }
  }

  if (params.get("setup_action") === "request") {
    return fail("An owner of that GitHub organisation needs to approve LeadMaker Publisher first. Start again once they have.")
  }
  const installationId = Number(params.get("installation_id"))
  if (!Number.isSafeInteger(installationId) || installationId <= 0) return fail("GitHub didn't say which installation to use. Start again.")
  const code = params.get("code")
  if (!code || code.length > 200) {
    return fail("GitHub didn't confirm who you are. Start again (and approve the access GitHub asks for).")
  }

  try {
    if (!(await userCanAccessInstallation(code, installationId))) {
      return fail("Your GitHub account can't access that installation. Sign in to GitHub with the account that owns the repo.")
    }
    const { data: saved } = await admin.rpc("git_attempt_set_installation", {
      p_attempt_id: s.attemptId,
      p_key: s.key,
      p_installation_id: installationId,
    })
    if (!saved) return fail("This connection link expired. Start again.")

    const { repos } = await installationRepos(installationId)
    if (!repos.length) return fail("No repository was picked. Install the app again and pick the blog's repo.")
    if (repos.length > 1) {
      await rememberState(`${s.attemptId}.${s.key}`)
      return go("/integrations/github/pick")
    }
    const done = await finishConnect(admin, s, { ...attempt, installation_id: installationId }, installationId, repos[0], origin)
    return done.ok ? go(done.redirect) : fail(done.error)
  } catch (e) {
    return fail(gitHubProblem(e))
  }
}
