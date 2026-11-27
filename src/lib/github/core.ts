import { createHmac, createSign, timingSafeEqual } from "node:crypto"

import { gitBlobSha } from "./sha"

/**
 * GitHub REST client for Git sites (docs/plans/git-cms/03-github-library.md). No server-only
 * import and no environment reads, so scripts/git-cms-check.ts can run it with a mocked fetch;
 * the app uses it through ./app.ts (server only).
 *
 * GETs retry on 5xx and short rate limits. Writes don't retry blindly: content-addressed objects
 * (blobs, trees, commits) are safe to send again; moving the branch is retried only by
 * commitFiles, from a fresh head, when someone else pushed first.
 */

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export type GitHubErrorCode =
  | "auth" // 401: token expired or revoked
  | "forbidden" // 403: no permission (app removed, token without access)
  | "not_found" // 404
  | "conflict" // 409 / 422 not a fast forward
  | "protected" // protected branch refused the push
  | "too_large" // 413 / file over the limit
  | "invalid" // 422 other
  | "rate_limited"
  | "network"
  | "server"

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: GitHubErrorCode,
    readonly retryAfterSec: number | null = null,
  ) {
    super(message)
    this.name = "GitHubError"
  }
}

const API = "https://api.github.com"
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_RATE_WAIT_SEC = 20

type Opts = {
  token: string
  fetch?: FetchLike
  sleep?: (ms: number) => Promise<void>
  baseUrl?: string
  timeoutMs?: number
}

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {})
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null)
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** "content/posts/a b.md" → "content/posts/a%20b.md" (each segment encoded). */
export const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/")

/** Waiting time GitHub asks for, in seconds (Retry-After or the reset time), or null. */
function rateWait(res: Response, body: Rec): number | null {
  const after = Number(res.headers.get("retry-after"))
  if (Number.isFinite(after) && after > 0) return after
  const remaining = res.headers.get("x-ratelimit-remaining")
  const reset = Number(res.headers.get("x-ratelimit-reset"))
  const secondary = /secondary rate limit|abuse/i.test(String(body.message ?? ""))
  if (res.status === 429 || remaining === "0" || secondary) {
    if (Number.isFinite(reset) && reset > 0) return Math.max(1, Math.ceil(reset - Date.now() / 1000))
    return 60
  }
  return null
}

/** A readable error for the team (no tokens, no file contents). */
export function toGitHubError(status: number, body: unknown, wait: number | null = null): GitHubError {
  const b = rec(body)
  const msg = String(b.message ?? "")
  if (wait !== null) {
    const mins = Math.max(1, Math.ceil(wait / 60))
    return new GitHubError(`GitHub is busy (rate limited). Try again in about ${mins} min.`, status, "rate_limited", wait)
  }
  if (status === 401) return new GitHubError("The connection to GitHub expired or was revoked. Reconnect the site.", status, "auth")
  if (/protected branch/i.test(msg))
    return new GitHubError("The branch is protected. Allow LeadMaker Publisher to push to it, or pick another branch.", status, "protected")
  if (status === 403) return new GitHubError("LeadMaker can't write to this repo any more. Check that the app or token still has access.", status, "forbidden")
  if (status === 404) return new GitHubError("Repo, branch or file not found on GitHub.", status, "not_found")
  if (status === 409 || (status === 422 && /fast.?forward|reference.*(update|exist)/i.test(msg)))
    return new GitHubError("Someone else pushed to the branch at the same time.", status, "conflict")
  if (status === 413 || /too large|exceeds/i.test(msg)) return new GitHubError("A file is too large for GitHub.", status, "too_large")
  if (status === 422) return new GitHubError(`GitHub refused the change${msg ? `: ${msg.slice(0, 200)}` : "."}`, status, "invalid")
  return new GitHubError(`GitHub had a problem (${status}). Try again in a moment.`, status, "server")
}

export type RepoInfo = { id: number; fullName: string; defaultBranch: string; canPush: boolean; private: boolean; htmlUrl: string }
export type RepoFile = { path: string; sha: string; size: number; content: Buffer }
export type FolderEntry = { name: string; path: string; type: "file" | "dir"; sha: string; size: number }
export type CommitFile = { path: string; content: string | Uint8Array }
export type CommitInput = {
  owner: string
  repo: string
  branch: string
  files: CommitFile[]
  deletes?: string[]
  message: string
  author?: { name: string; email: string } | null
  /** Paths already in the repo with their blob sha: unchanged binaries are not uploaded again. */
  existing?: Map<string, string>
  maxAttempts?: number
}
export type CommitResult = {
  /** null when nothing changed (no commit was made). */
  commitSha: string | null
  /** The commit the branch pointed at before (or the new parent). */
  baseSha: string
  blobs: Record<string, string>
  attempts: number
}
export type DeployStatus = {
  state: "pending" | "building" | "success" | "failure"
  environment: string | null
  url: string | null
  logUrl: string | null
  description: string | null
}

export class GitHub {
  private readonly token: string
  private readonly fetchFn: FetchLike
  private readonly sleep: (ms: number) => Promise<void>
  private readonly base: string
  private readonly timeoutMs: number
  /** From the last response: when a fine-grained token expires (github-authentication-token-expiration). */
  tokenExpiresAt: string | null = null

  constructor(opts: Opts) {
    this.token = opts.token
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init))
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.base = (opts.baseUrl ?? API).replace(/\/+$/, "")
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /** One API call. `retry` (GETs and content-addressed writes): 5xx twice, short rate limits once. */
  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    opts: { retry?: boolean; allow404?: boolean } = {},
  ): Promise<T | null> {
    const retry = opts.retry ?? method === "GET"
    let rateRetried = false
    for (let attempt = 0; ; attempt++) {
      let res: Response
      try {
        res = await this.fetchFn(`${this.base}${path}`, {
          method,
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${this.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "LeadMaker-Publisher",
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
          cache: "no-store",
        })
      } catch {
        if (retry && attempt < 2) {
          await this.sleep(500 * 3 ** attempt)
          continue
        }
        throw new GitHubError("Couldn't reach GitHub. Try again in a moment.", 0, "network")
      }
      const exp = res.headers.get("github-authentication-token-expiration")
      if (exp) {
        const d = new Date(exp.replace(" UTC", "Z").replace(" ", "T"))
        if (!Number.isNaN(d.getTime())) this.tokenExpiresAt = d.toISOString()
      }
      if (res.status === 204) return null
      const text = await res.text()
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      if (res.ok) return json as T
      if (res.status === 404 && opts.allow404) return null

      const wait = res.status === 403 || res.status === 429 ? rateWait(res, rec(json)) : null
      if (wait !== null && retry && !rateRetried && wait <= MAX_RATE_WAIT_SEC) {
        rateRetried = true
        await this.sleep(wait * 1000)
        continue
      }
      if (res.status >= 500 && retry && attempt < 2) {
        await this.sleep(500 * 3 ** attempt)
        continue
      }
      throw toGitHubError(res.status, json, wait)
    }
  }

  private async paged<T>(path: string, key: string | null, max = 1000): Promise<T[]> {
    const out: T[] = []
    for (let page = 1; out.length < max; page++) {
      const sep = path.includes("?") ? "&" : "?"
      const data = await this.request<unknown>("GET", `${path}${sep}per_page=100&page=${page}`)
      const items = arr(key ? rec(data)[key] : data) as T[]
      out.push(...items)
      if (items.length < 100) break
    }
    return out.slice(0, max)
  }

  // ---- Reads --------------------------------------------------------------

  async getRepo(owner: string, repo: string): Promise<RepoInfo> {
    const r = rec(await this.request("GET", `/repos/${owner}/${repo}`))
    const perms = rec(r.permissions)
    return {
      id: num(r.id) ?? 0,
      fullName: str(r.full_name) ?? `${owner}/${repo}`,
      defaultBranch: str(r.default_branch) ?? "main",
      // Installation tokens don't return permissions; the app's grant says it can push.
      canPush: r.permissions === undefined ? true : perms.push === true || perms.admin === true || perms.maintain === true,
      private: r.private === true,
      htmlUrl: str(r.html_url) ?? `https://github.com/${owner}/${repo}`,
    }
  }

  async getBranchHead(owner: string, repo: string, branch: string): Promise<{ commitSha: string; treeSha: string }> {
    const ref = rec(await this.request("GET", `/repos/${owner}/${repo}/git/ref/heads/${encodePath(branch)}`))
    const commitSha = str(rec(ref.object).sha)
    if (!commitSha) throw new GitHubError("Branch not found on GitHub.", 404, "not_found")
    const commit = rec(await this.request("GET", `/repos/${owner}/${repo}/git/commits/${commitSha}`))
    const treeSha = str(rec(commit.tree).sha)
    if (!treeSha) throw new GitHubError("GitHub returned a commit without a tree.", 500, "server")
    return { commitSha, treeSha }
  }

  /** A file's bytes and blob sha, or null when it doesn't exist. */
  async getFile(owner: string, repo: string, path: string, ref: string): Promise<RepoFile | null> {
    const r = await this.request<unknown>(
      "GET",
      `/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      undefined,
      { allow404: true },
    )
    if (r === null || Array.isArray(r)) return null
    const f = rec(r)
    if (f.type !== "file") return null
    const sha = str(f.sha) ?? ""
    let b64 = typeof f.content === "string" ? f.content : ""
    if (f.encoding !== "base64" || (!b64 && num(f.size))) {
      // Over 1 MB: the contents API leaves the body empty; read the blob instead.
      const blob = rec(await this.request("GET", `/repos/${owner}/${repo}/git/blobs/${sha}`))
      b64 = typeof blob.content === "string" ? blob.content : ""
    }
    return { path, sha, size: num(f.size) ?? 0, content: Buffer.from(b64.replace(/\n/g, ""), "base64") }
  }

  /** The entries of a folder (one level), or null when it doesn't exist. Up to 1,000 entries. */
  async listFolder(owner: string, repo: string, path: string, ref: string): Promise<FolderEntry[] | null> {
    const r = await this.request<unknown>(
      "GET",
      `/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      undefined,
      { allow404: true },
    )
    if (!Array.isArray(r)) return null
    return r.map((e) => {
      const x = rec(e)
      return {
        name: str(x.name) ?? "",
        path: str(x.path) ?? "",
        type: x.type === "dir" ? ("dir" as const) : ("file" as const),
        sha: str(x.sha) ?? "",
        size: num(x.size) ?? 0,
      }
    })
  }

  // ---- Writing: one commit for many files --------------------------------

  async commitFiles(input: CommitInput): Promise<CommitResult> {
    const { owner, repo, branch } = input
    const maxAttempts = Math.max(1, Math.min(5, input.maxAttempts ?? 3))
    const blobs: Record<string, string> = {}
    // Binary files become blobs once (re-used on every attempt); text goes inline in the tree.
    const entries: { path: string; mode: "100644"; type: "blob"; sha?: string | null; content?: string }[] = []
    for (const f of input.files) {
      const sha = gitBlobSha(f.content)
      blobs[f.path] = sha
      if (typeof f.content === "string") {
        entries.push({ path: f.path, mode: "100644", type: "blob", content: f.content })
      } else if (input.existing?.get(f.path) === sha) {
        entries.push({ path: f.path, mode: "100644", type: "blob", sha })
      } else {
        const created = rec(
          await this.request("POST", `/repos/${owner}/${repo}/git/blobs`, {
            content: Buffer.from(f.content).toString("base64"),
            encoding: "base64",
          }, { retry: true }),
        )
        entries.push({ path: f.path, mode: "100644", type: "blob", sha: str(created.sha) ?? sha })
      }
    }
    for (const p of input.deletes ?? []) entries.push({ path: p, mode: "100644", type: "blob", sha: null })

    for (let attempt = 1; ; attempt++) {
      const head = await this.getBranchHead(owner, repo, branch)
      const tree = rec(
        await this.request("POST", `/repos/${owner}/${repo}/git/trees`, { base_tree: head.treeSha, tree: entries }, { retry: true }),
      )
      const treeSha = str(tree.sha)
      if (!treeSha) throw new GitHubError("GitHub didn't return the new tree.", 500, "server")
      if (treeSha === head.treeSha) return { commitSha: null, baseSha: head.commitSha, blobs, attempts: attempt }

      const commit = rec(
        await this.request(
          "POST",
          `/repos/${owner}/${repo}/git/commits`,
          {
            message: input.message,
            tree: treeSha,
            parents: [head.commitSha],
            ...(input.author ? { author: { name: input.author.name, email: input.author.email } } : {}),
          },
          { retry: true },
        ),
      )
      const commitSha = str(commit.sha)
      if (!commitSha) throw new GitHubError("GitHub didn't return the new commit.", 500, "server")
      try {
        await this.request("PATCH", `/repos/${owner}/${repo}/git/refs/heads/${encodePath(branch)}`, { sha: commitSha, force: false }, { retry: false })
        return { commitSha, baseSha: head.commitSha, blobs, attempts: attempt }
      } catch (e) {
        if (e instanceof GitHubError && e.code === "conflict" && attempt < maxAttempts) {
          await this.sleep(300 * attempt)
          continue
        }
        throw e
      }
    }
  }

  // ---- Deployment status (Vercel: GitHub deployments; Netlify: commit statuses) ----

  async deploymentsFor(owner: string, repo: string, sha: string): Promise<DeployStatus | null> {
    const list = arr(await this.request("GET", `/repos/${owner}/${repo}/deployments?sha=${sha}&per_page=10`)).map(rec)
    if (!list.length) return null
    const pick =
      list.find((d) => d.production_environment === true) ??
      list.find((d) => /prod/i.test(String(d.environment ?? ""))) ??
      list[0]
    const id = num(pick.id)
    if (id === null) return null
    const statuses = arr(await this.request("GET", `/repos/${owner}/${repo}/deployments/${id}/statuses?per_page=1`)).map(rec)
    const s = statuses[0]
    const raw = String(s?.state ?? "pending")
    const state: DeployStatus["state"] =
      raw === "success" ? "success" : raw === "failure" || raw === "error" ? "failure" : raw === "in_progress" ? "building" : "pending"
    return {
      state,
      environment: str(pick.environment),
      url: str(s?.environment_url),
      logUrl: str(s?.log_url) ?? str(s?.target_url),
      description: str(s?.description),
    }
  }

  async combinedStatus(owner: string, repo: string, sha: string): Promise<DeployStatus | null> {
    const r = rec(await this.request("GET", `/repos/${owner}/${repo}/commits/${sha}/status`))
    const statuses = arr(r.statuses).map(rec)
    if (!statuses.length) return null
    const failed = statuses.find((s) => s.state === "failure" || s.state === "error")
    const main = failed ?? statuses[0]
    const raw = String(r.state ?? "pending")
    return {
      state: raw === "success" ? "success" : raw === "failure" || raw === "error" ? "failure" : "pending",
      environment: str(main.context),
      url: null,
      logUrl: str(main.target_url),
      description: str(main.description),
    }
  }

  // ---- GitHub App (token = app JWT) and installations ---------------------

  /** POST /app/installations/{id}/access_tokens, limited to the given repos. */
  async createInstallationToken(installationId: number, repoIds?: number[]): Promise<{ token: string; expiresAt: string }> {
    const r = rec(
      await this.request(
        "POST",
        `/app/installations/${installationId}/access_tokens`,
        repoIds?.length ? { repository_ids: repoIds } : {},
        { retry: true },
      ),
    )
    const token = str(r.token)
    const expiresAt = str(r.expires_at)
    if (!token || !expiresAt) throw new GitHubError("GitHub didn't return an installation token.", 500, "server")
    return { token, expiresAt }
  }

  /** The installations the signed-in user (user token) can access. */
  async userInstallationIds(): Promise<number[]> {
    const list = await this.paged<Rec>("/user/installations", "installations", 500)
    return list.map((i) => num(i.id)).filter((x): x is number => x !== null)
  }

  /** The repos an installation token can see. */
  async installationRepos(): Promise<RepoInfo[]> {
    const list = await this.paged<Rec>("/installation/repositories", "repositories", 1000)
    return list.map((r) => ({
      id: num(r.id) ?? 0,
      fullName: str(r.full_name) ?? "",
      defaultBranch: str(r.default_branch) ?? "main",
      canPush: true,
      private: r.private === true,
      htmlUrl: str(r.html_url) ?? "",
    }))
  }
}

// ---------------------------------------------------------------------------
// App JWT, OAuth code exchange, webhook signatures
// ---------------------------------------------------------------------------

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")

/** The GitHub App JWT (RS256; issued 60 s ago so clock drift is fine; 9 minutes). */
export function signAppJwt(appId: string, privateKeyPem: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = b64url(JSON.stringify({ iat: nowSec - 60, exp: nowSec + 540, iss: appId }))
  const signer = createSign("RSA-SHA256")
  signer.update(`${header}.${payload}`)
  return `${header}.${payload}.${b64url(signer.sign(privateKeyPem))}`
}

/** Swaps the install/authorize `code` for a short-lived user token (used once, never stored). */
export async function exchangeOAuthCode(
  p: { clientId: string; clientSecret: string; code: string },
  fetchFn: FetchLike = (url, init) => fetch(url, init),
): Promise<string> {
  let res: Response
  try {
    res = await fetchFn("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "LeadMaker-Publisher" },
      body: JSON.stringify({ client_id: p.clientId, client_secret: p.clientSecret, code: p.code }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
  } catch {
    throw new GitHubError("Couldn't reach GitHub. Try again in a moment.", 0, "network")
  }
  const body = rec(await res.json().catch(() => ({})))
  const token = str(body.access_token)
  if (!res.ok || !token) {
    throw new GitHubError(
      body.error === "bad_verification_code"
        ? "The GitHub sign-in expired. Start connecting again."
        : "GitHub didn't confirm the sign-in. Start connecting again.",
      res.status || 400,
      "auth",
    )
  }
  return token
}

/** Checks X-Hub-Signature-256 ("sha256=<hex>") against the raw body. */
export function verifyGitHubSignature(secret: string, rawBody: string | Buffer, header: string | null): boolean {
  if (!header || !header.startsWith("sha256=")) return false
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`)
  const given = Buffer.from(header)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
