# Git sites · 03 · GitHub library (`src/lib/github/`, server only)

> **Built (2026-11-27):**
> - **`core.ts`:** the `GitHub` class, `signAppJwt`, `exchangeOAuthCode`, `verifyGitHubSignature` and `toGitHubError`. It has no server-only import and no environment reads, so the checks can run it with a mocked fetch.
> - **`app.ts`** (server only): `installationToken` (in-memory cache, renewed 5 minutes before expiry), `forInstallation`, `forToken`, `installUrl`, `userCanAccessInstallation`, `isGitHubWebhook`, `gitHubProblem`.
> - **`sha.ts`:** `gitBlobSha`, `commitMessage`, `articleFromCommit`.
> - **Environment:** getters `hasGitHubApp()`, `getGitHubApp()` (restores `\n` in the PEM), `getGitHubWebhookSecret()`.
> - **How `commitFiles` works:**
>   - text files go inline in the tree, so no blob call;
>   - binaries are uploaded as blobs once per publish, and skipped when the caller's `existing` map says the same sha is already there;
>   - **"nothing changed"** = the new tree sha equals the base tree sha, so no commit is made;
>   - a moved branch (422 not a fast forward) rebuilds on the new head, up to 3 times.
> - **Checks:** `scripts/git-cms-check.ts` (15 groups pass).

## Environment (`src/lib/env.server.ts`, read only through getters)

| Variable | Use |
|---|---|
| `GITHUB_APP_ID` | JWT `iss` |
| `GITHUB_APP_SLUG` | Install URL `https://github.com/apps/{slug}/installations/new` |
| `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` | Swapping the install `code` for a user token (proving who owns the installation) |
| `GITHUB_APP_PRIVATE_KEY` | PEM. Line breaks may be written as `\n` in DigitalOcean; the getter restores them |
| `GITHUB_APP_WEBHOOK_SECRET` | HMAC for `/api/webhooks/github` |

`hasGitHubApp()` is true when the first five are set. Without them, only the token option is offered.

## `app.ts`

- `appJwt()`: header `{alg: RS256, typ: JWT}`, payload `{iat: now-60, exp: now+540, iss: APP_ID}`, signed with `crypto.createSign("RSA-SHA256")`. No extra library is needed.
- `installationToken(installationId, repoId)` → `POST /app/installations/{id}/access_tokens {repository_ids:[repoId]}`. Cached in memory, keyed by `id:repo`, until 5 minutes before `expires_at`.
- `installUrl(state)`.
- `exchangeUserCode(code)` → `POST https://github.com/login/oauth/access_token` (JSON) → user token. Used once, never stored.
- `userInstallations(userToken)` → `GET /user/installations` (paged). The callback checks that the `installation_id` is listed.
- `installationRepos(token)` → `GET /installation/repositories` (paged, up to 1,000).

## `client.ts`

- `request(token, method, path, body?)`:
  - base `https://api.github.com`, headers `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: LeadMaker-Publisher`;
  - 30-second timeout;
  - **GETs** retry twice on 5xx and on 403/429 with `retry-after` or `x-ratelimit-remaining: 0` (waiting at most 20 s; otherwise fail with "GitHub is busy, try again in N min").
- `GitHubError { status, code, message }`, with readable messages:
  - 401 → "The connection to GitHub expired. Reconnect the site."
  - 403 (no permission) → "LeadMaker can't write to this repo any more."
  - 404 → "Repo, branch or file not found."
  - 409/422 → conflict (moving the branch is handled by `commitFiles`).
  - Protected branch → "The branch is protected; allow LeadMaker Publisher to push or pick another branch."
- **Reads:**
  - `getRepo(o, r)` → `{id, default_branch, permissions.push, private, html_url}`;
  - `getBranchHead(o, r, branch)` → commit sha + tree sha;
  - `getFile(o, r, path, ref)` → `{sha, content}` or null;
  - `listFolder(o, r, path, ref)`;
  - `tokenExpiry(response)` reads `github-authentication-token-expiration`.
- **`commitFiles({ owner, repo, branch, files, deletes, message, author? })`:**
  1. Read the branch head (commit + tree).
  2. Create a blob for each file: text as utf-8, images as base64 (≤10 MB each).
  3. `POST /git/trees` with `base_tree` and entries (`mode 100644`; deletes are `sha: null`).
  4. `POST /git/commits` with `{message, tree, parents:[head], author?}`.
  5. `PATCH /git/refs/heads/{branch} {sha, force:false}`.
  6. On 422 "not a fast forward", start again from step 1 (up to 3 times).

  Returns `{commitSha, files: {path: blobSha}}`.
- **Deployment checks:**
  - `deploymentsFor(o, r, sha)` → `GET /deployments?sha=` and the latest `GET /deployments/{id}/statuses` → `{state, environment, environment_url, target_url, description}`;
  - `combinedStatus(o, r, sha)` → `GET /commits/{sha}/status`.

## Pure helpers (`src/lib/github/sha.ts`)

- `gitBlobSha(bytes)` = sha1(`"blob " + length + "\0" + bytes`), the same value as `git hash-object`. It's compared with `getFile().sha`, so a commit is skipped when nothing changed and edits made elsewhere are spotted.
- `commitMessage(kind, title, articleId, version)` → `Publish: …` with the trailer `LeadMaker-Article: {id} v{version}`.

## Webhook (`src/app/api/webhooks/github/route.ts`)

- Checks `X-Hub-Signature-256` with a timing-safe compare.
- Handles:
  - `installation` (`deleted` / `suspend`) → every connection with that installation goes to `needs_attention`;
  - `installation_repositories` (`removed`) → the connections for those repo IDs go to `needs_attention`.
- Anything else → 204. The payload is never trusted beyond the IDs; the next health check reads the truth.
