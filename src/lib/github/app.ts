import "server-only"

import { getGitHubApp, getGitHubWebhookSecret } from "@/lib/env.server"
import { exchangeOAuthCode, GitHub, GitHubError, signAppJwt, verifyGitHubSignature } from "./core"

/**
 * The GitHub App "LeadMaker Publisher" (docs/plans/git-cms/05-github-app-and-connecting.md).
 * Installation tokens last an hour and are limited to one repo; they're cached in memory per
 * process and renewed 5 minutes before they expire. Tokens are never logged or stored.
 */

export { GitHub, GitHubError } from "./core"

const cache = new Map<string, { token: string; expiresAt: number }>()

function appClient(): GitHub {
  const app = getGitHubApp()
  return new GitHub({ token: signAppJwt(app.appId, app.privateKey) })
}

/** A 1-hour token for one installation, limited to `repoId` when given. */
export async function installationToken(installationId: number, repoId?: number | null): Promise<string> {
  const key = `${installationId}:${repoId ?? "*"}`
  const hit = cache.get(key)
  if (hit && hit.expiresAt - Date.now() > 5 * 60_000) return hit.token
  const { token, expiresAt } = await appClient().createInstallationToken(installationId, repoId ? [repoId] : undefined)
  cache.set(key, { token, expiresAt: new Date(expiresAt).getTime() })
  return token
}

/** A client for one connected repo through the app. */
export async function forInstallation(installationId: number, repoId?: number | null): Promise<GitHub> {
  return new GitHub({ token: await installationToken(installationId, repoId) })
}

/** A client for a fine-grained personal token (read from Vault by the caller). */
export function forToken(token: string): GitHub {
  return new GitHub({ token })
}

/** Where "Connect with GitHub" sends people; GitHub hands `state` back on the callback. */
export function installUrl(state: string): string {
  const { slug } = getGitHubApp()
  return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`
}

/**
 * Proves the person coming back from GitHub can access `installationId`: swaps the `code` for a
 * user token and checks GET /user/installations. Returns false when they can't.
 */
export async function userCanAccessInstallation(code: string, installationId: number): Promise<boolean> {
  const app = getGitHubApp()
  const userToken = await exchangeOAuthCode({ clientId: app.clientId, clientSecret: app.clientSecret, code })
  const ids = await new GitHub({ token: userToken }).userInstallationIds()
  return ids.includes(installationId)
}

/** The webhook body is genuine (false when no secret is configured). */
export function isGitHubWebhook(rawBody: string, signature: string | null): boolean {
  const secret = getGitHubWebhookSecret()
  return secret ? verifyGitHubSignature(secret, rawBody, signature) : false
}

/** Readable text for any error from the GitHub calls. */
export function gitHubProblem(error: unknown): string {
  if (error instanceof GitHubError) return error.message
  if (error instanceof Error && /GITHUB_APP_/.test(error.message)) return "The GitHub App isn't set up on the server yet."
  return "Something went wrong talking to GitHub. Try again in a moment."
}
