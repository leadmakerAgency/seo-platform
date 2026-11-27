import "server-only"

import { cookies } from "next/headers"

import { onboardingLinkUrl } from "@/lib/env.server"
import type { Db } from "@/lib/dataforseo/client"
import { forInstallation, gitHubProblem, type GitHub } from "@/lib/github/app"
import type { RepoInfo } from "@/lib/github/core"
import type { Json } from "@/lib/supabase/database.types"
import { clientSiteUrl, discoverSite } from "./server"
import { parseState } from "./state"

export { parseState }

/**
 * The "Connect with GitHub" flow after GitHub sends the person back (callback route and repo
 * picker). The install state is `<attempt id>.<key>`; between the callback and the picker it
 * lives in a short-lived httpOnly cookie, never in a URL we build.
 */

export const STATE_COOKIE = "lm_git_connect"
const STATE_PATH = "/integrations/github"


export async function rememberState(state: string) {
  ;(await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: STATE_PATH,
    maxAge: 30 * 60,
  })
}

export async function readState() {
  return parseState((await cookies()).get(STATE_COOKIE)?.value)
}

export async function forgetState() {
  ;(await cookies()).delete({ name: STATE_COOKIE, path: STATE_PATH })
}

export type Attempt = {
  ok: boolean
  client_id?: string
  origin?: "team" | "onboarding"
  installation_id?: number | null
  onboarding_link_id?: string | null
}

export async function checkAttempt(admin: Db, s: { attemptId: string; key: string }): Promise<Attempt> {
  const { data } = await admin.rpc("git_check_connect_attempt", { p_attempt_id: s.attemptId, p_key: s.key })
  return (data ?? { ok: false }) as Attempt
}

/** The repos the person picked when installing (limited to 1,000). */
export async function installationRepos(installationId: number): Promise<{ gh: GitHub; repos: RepoInfo[] }> {
  const gh = await forInstallation(installationId)
  return { gh, repos: await gh.installationRepos() }
}

/**
 * Reads the repo and saves the connection. Returns where to send the browser next
 * (Connections for the team, the onboarding link for a client).
 */
export async function finishConnect(
  admin: Db,
  s: { attemptId: string; key: string },
  attempt: Attempt,
  installationId: number,
  repo: RepoInfo,
  appOrigin: string,
): Promise<{ ok: true; redirect: string } | { ok: false; error: string }> {
  const [owner, name] = repo.fullName.split("/")
  if (!owner || !name) return { ok: false, error: "GitHub returned a repo without a name." }

  let discovery: Awaited<ReturnType<typeof discoverSite>> | null = null
  let problem: string | null = null
  try {
    discovery = await discoverSite(await forInstallation(installationId, repo.id), owner, name)
    problem = discovery.problem
  } catch (e) {
    problem = gitHubProblem(e)
  }
  const siteUrl = await clientSiteUrl(admin, attempt.client_id!)
  const p = {
    owner,
    repo: name,
    repo_id: repo.id,
    branch: discovery?.branch ?? repo.defaultBranch,
    config_path: discovery?.configPath ?? null,
    detected: discovery?.detected ?? { problem },
    site_url: siteUrl,
    ...(discovery?.defaults ?? {}),
  }
  const { data, error } = await admin.rpc("git_finish_connect", { p_attempt_id: s.attemptId, p_key: s.key, p: p as Json })
  const r = (data ?? {}) as { ok?: boolean; reason?: string; connection_id?: string; onboarding_token?: string | null }
  if (error || !r.ok || !r.connection_id) {
    return {
      ok: false,
      error: r.reason === "link" ? "This onboarding link isn't active any more." : "This connection link expired. Start again.",
    }
  }
  if (problem) {
    await admin.rpc("git_set_connection_status", { p_id: r.connection_id, p_status: "needs_attention", p_error: problem, p: {} })
  }

  const { data: client } = await admin.from("clients").select("slug").eq("id", attempt.client_id!).maybeSingle()
  const slug = client?.slug ?? ""
  if (attempt.origin === "onboarding" && r.onboarding_token) {
    return { ok: true, redirect: `${onboardingLinkUrl(appOrigin, slug, r.onboarding_token)}?step=website&git=connected` }
  }
  return { ok: true, redirect: `/clients/${slug}/connections?site=${r.connection_id}&result=git_connected` }
}

/** Where to send someone when the flow fails (the attempt says team or onboarding). */
export async function failRedirect(admin: Db, attempt: Attempt | null, appOrigin: string, message: string): Promise<string> {
  const q = new URLSearchParams({ result: "git_error", message: message.slice(0, 300) }).toString()
  if (attempt?.ok && attempt.client_id) {
    if (attempt.origin === "onboarding" && attempt.onboarding_link_id) {
      const { data } = await admin
        .from("onboarding_links")
        .select("token, client:clients(slug)")
        .eq("id", attempt.onboarding_link_id)
        .maybeSingle()
      const slug = (data?.client as { slug?: string } | null)?.slug
      if (data?.token && slug) return `${onboardingLinkUrl(appOrigin, slug, data.token)}?step=website&${q}`
    }
    const { data: c } = await admin.from("clients").select("slug").eq("id", attempt.client_id).maybeSingle()
    if (c?.slug) return `/clients/${c.slug}/connections?${q}`
  }
  return `/dashboard?${q}`
}
