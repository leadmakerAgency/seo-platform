# Git sites · 08 · Onboarding link

> **Built (2026-11-27):**
> - **Website step:** a new platform choice, "Sveltia, Decap or Netlify CMS (blog posts stored on GitHub)", shows `components/wizard/git-access.tsx` instead of the usual "Give us access" block. It offers:
>   - **Connect GitHub**, shown when the GitHub App is set up: `startOnboardingGitConnect` → the install page → the callback sends the client back to `…?step=website&git=connected`, or `&result=git_error&message=…`, with toasts in the wizard;
>   - **Send a token instead**, with step-by-step instructions: `saveOnboardingGitToken` checks it against GitHub *before* it reaches Vault, then stores it with `onboarding_save_git_token`;
>   - **Later**;
>   - the connected status from `onboarding_git_status` (via `getOnboarding().git`).
> - **Team onboarding page:** shows each Git site's state (ready / needs attention / finish Set up site).
> - **Migration `0067_onboarding_git_rule.sql` (applied):** with `git_cms` the website step is done **only** when a Git site is really connected, or skipped with "Later". An old "I've invited you" answer, or a client posting `access_status = connected` directly, doesn't count. Tested with rolled-back SQL.
> - The content-publish cron migration moved to `0068`.

## Website step (`src/features/onboarding/components/wizard/website-step.tsx`)

- **New platform card:** "Git-based CMS: Sveltia, Decap or Netlify CMS (your blog posts live in GitHub)", with a short "How do I know?" note: "You sign in to your blog at /admin with GitHub."
- When it's picked, the access choices are:
  1. **Connect GitHub** (recommended):
     - `onboarding_start_git_connect(token)` → `{attemptId, key}`. The client is sent to the GitHub install page with `state = attemptId.key`. **The onboarding token itself is never sent to GitHub.**
     - They install the app on the blog's repo, then come back through `/integrations/github/callback`. The callback sees the onboarding origin, finishes the connection, and redirects to the onboarding link's website step (the link comes from the attempt's `onboarding_link_id`).
     - If several repos are picked, the client sees the repo picker too, styled for onboarding.
     - The step then shows "Connected: owner/repo ✓". If the config isn't a supported CMS, it says so plainly: "We connected the repo but didn't find a Sveltia/Decap config. We'll take it from here."
  2. **Send a token instead:** step-by-step fine-grained token instructions (with screenshots described in text), then owner/repo + token → `onboarding_save_git_token` → checked on the server.
  3. **Later:** sets `access_status = later` (as today).
- **Step done:** `platform = git_cms` and a `connected` connection. A saved token counts once the server check passes.
- **Client wording:** the client never sees field maps or collections. Team-only setup happens in Connections → Set up site, prompted by a "Finish site setup" task on the client overview.

## Database

- `onboarding_website.platform = 'git_cms'`, `access_status = 'connected'` (both new enum values, `0064`).
- `private.onboarding_refresh` (latest in 0063) is redefined so the website step is done for `git_cms` + a connected `git_connections` row, as well as the existing rules.
- Onboarding `onboarding_*` functions stay the only way the client writes. The token goes straight into Vault, never into a table column.

## Team side

- The onboarding review screen and the client overview's onboarding panel show "Website: Git-based CMS · owner/repo · connected" (or "token sent, checking…").
- Once the site is connected, `client_onboarding` drives the "Finish site setup" nudge until a collection and URL pattern are saved.
