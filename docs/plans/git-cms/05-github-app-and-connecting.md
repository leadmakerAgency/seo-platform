# Git sites · 05 · The GitHub App and connecting a site

> **Built (2026-11-27):**
> - **Server pieces:**
>   - `src/features/git-sites/server.ts`: `clientFor`, `discoverSite` (config, branch, blog collection, field map, URL pattern from `preview_path` or an existing post's `permalink`), `checkGitConnection`;
>   - `connect.ts`: the state cookie, `finishConnect`, `failRedirect`;
>   - `actions.ts`: `startGitConnect`, `connectGitToken` (checked against GitHub before it reaches Vault), `saveGitSite`, `checkGitSite`, `removeGitSite`, `testGitUrl` (public https sites only, `isPublicSiteUrl`);
>   - `queries.ts`: `getGitSites`.
> - **Routes:**
>   - `src/app/integrations/github/callback/route.ts`;
>   - the repo picker `src/app/integrations/github/pick/` (page + server action; the state lives in an httpOnly cookie on `/integrations/github` for 30 minutes);
>   - `src/app/api/webhooks/github/route.ts`.
>
>   `/integrations/github` is public in `src/lib/supabase/proxy.ts`. The route checks the one-time state, the person's own GitHub access to the installation, and for team attempts the signed-in person who started it.
> - **UI:**
>   - `components/git-sites-section.tsx`: the card in Connections → Website, with the token dialog and disconnect;
>   - `components/git-site-sheet.tsx`: Set up site, with the collection, field map, date format, site address and URL pattern + Test, a live front matter preview, and Advanced (file name, file type, media folders, commit identity, deploy hook).
>
>   The card shows even when Zernio isn't set up.
> - **Not yet:** the daily health check runs from the content-publish cron (phase 6). The live tests wait for the GitHub App (phase 0).

## Creating the GitHub App (you, once, about 5 minutes)

Create it under the **agency organisation** so every client can install it: **GitHub → leadmakerAgency → Settings → Developer settings → GitHub Apps → New GitHub App**.

| Setting | Value |
|---|---|
| Name | `LeadMaker Publisher` (must be unique on GitHub; the URL slug follows from it) |
| Homepage URL | The app's public address, for example `https://app.leadmaker.agency` |
| Callback URL | `https://<app>/integrations/github/callback` |
| Expire user authorization tokens | On |
| **Request user authorization (OAuth) during installation** | **On** (we use it to prove the installation belongs to the person installing it) |
| Enable Device Flow | Off |
| Setup URL | Leave empty (GitHub uses the callback URL when "Request user authorization" is on) |
| Redirect on update | On |
| Webhook | Active. URL `https://<app>/api/webhooks/github`. Secret: a long random string (it's `GITHUB_APP_WEBHOOK_SECRET`) |
| Repository permissions | **Contents: Read and write**, **Metadata: Read-only** (forced), **Deployments: Read-only**, **Commit statuses: Read-only** |
| Organization and account permissions | None |
| Subscribe to events | (installation events are automatic.) No others needed |
| Where can this app be installed? | **Any account** (clients install it on their own repos) |

**After creating it:**
1. Note the **App ID**, the **Client ID** and the slug in the URL (`github.com/apps/<slug>`).
2. **Generate a client secret.**
3. **Generate a private key** (downloads a `.pem`).
4. **Install** the app on `leadmakerAgency` → *Only select repositories* → `South-Africa-SDR` (and the phase 0 test repo).

**DigitalOcean → App → Settings → Environment Variables** (encrypted, run time). Add the same lines to `.env.local` for local work. Never put them in `.env.production` or `NEXT_PUBLIC_*`:

```
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=leadmaker-publisher
GITHUB_APP_CLIENT_ID=Iv23…
GITHUB_APP_CLIENT_SECRET=…
GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n…\n-----END RSA PRIVATE KEY-----
GITHUB_APP_WEBHOOK_SECRET=…
```

## Connecting from Connections (team, `connections.manage`)

**Website section → Git-based site card** (Sveltia, Decap, Netlify CMS), shown next to WordPress.

1. **Connect with GitHub:**
   1. `startGitConnect(clientId)` → `start_git_connect` → redirect to `installUrl(state)`, where `state = {attemptId}.{key}`.
   2. GitHub: the person picks the account and repos, approves, and is sent to **`/integrations/github/callback?installation_id&setup_action&code&state`**.
   3. The **callback route**:
      - splits the state;
      - swaps `code` for a user token;
      - checks that `GET /user/installations` lists `installation_id`;
      - lists that installation's repos.
   4. **One repo** → continue. **Several** → `/integrations/github/pick?attempt=…` (a server page; the attempt stays unused until the person picks).
   5. With an installation token for that repo:
      - `getRepo` (push access);
      - read the CMS config (`04`);
      - **`git_finish_connect`** saves the connection with the detected settings and defaults.
   6. Redirect to `…/connections?site=<connection id>`, which opens **Set up site**.
   7. **If it fails:** the state is expired or used, the user can't access the installation, there's no push access, or there's no supported CMS config. Each gives a plain message on the Connections page, and the attempt is marked used.
   8. `setup_action = update` (repos added or removed later) only re-runs the health check.
2. **Use a token instead:** a dialog with **owner/repo** and the **token**, plus these steps:
   - GitHub → Settings → Developer settings → Fine-grained tokens → Generate;
   - Resource owner: the repo's account; Only select repositories: that repo;
   - Repository permissions: Contents read & write, Deployments read-only, Commit statuses read-only;
   - expiry up to one year.

   Then `save_git_token` → the server checks push access and the config → status `connected` or `needs_attention` with the reason.

**Set up site sheet** (opens after connecting, and from the card):
- **Collection** (a select of supported collections; unsupported ones are listed greyed out with the reason).
- **Field map** table: our field → site field (select), "Don't send", plus a **front matter preview** for a sample article.
- **Post URL pattern** + **Test**.
- **Branch.**
- **Commit as** (name and email, optional).
- **Deploy hook** (optional: only when the host doesn't build on push).
- **Site address** (defaults to the client's website).
- Buttons: **Save**, **Check connection**, **Disconnect** (confirm; the published posts stay on the site).

**Card states:**
- Not connected → **Connect with GitHub** / **Use a token**.
- Connected → `owner/repo · branch · collection`, last check, token expiry ("expires in 12 days" in amber).
- Needs attention → the reason + **Reconnect**.

## Health check (daily, from the content-publish cron; also "Check connection")

1. Get the installation token, or check the Vault token: a 401 means expired or revoked.
2. `getRepo`: push access is still there.
3. The branch exists.
4. The config still parses and the collection still exists.
5. The token expires within 14 days → `needs_attention` "Token expires on …", with one notification.

Any failure → `git_set_connection_status(needs_attention, reason)`. The first change notifies the client owner and admins (`site_connection_problem`). Scheduled articles for that site stay scheduled, and fail with the reason when they come due.

## Webhook

`installation.deleted` / `suspend` and `installation_repositories.removed` → `needs_attention` straight away ("The LeadMaker Publisher app was removed from owner/repo").
