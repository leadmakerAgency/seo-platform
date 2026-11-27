# Git sites · 06 · Publishing pipeline (`src/features/git-sites/publish.ts`)

> **Built (2026-11-27):**
> - **`publish.ts`:** `runGitSend(admin, id, { mode: now | scheduled | update | unpublish | delete, version, actor, force })`.
> - **`deploy.ts`:** `checkGitDeploy`, `followDeploy` (in `after()`, every 15 s for about 2 minutes), `pageIsLive` (public https only, reads at most 2 MB, the title must be on the page).
> - **`article.ts`:** the Git branch of `publishArticle` / `updateArticleOnWordPress` / `unpublishArticle` / `deleteArticleFromWordPress` in `content/actions.ts`, which now take `{ force }`. A conflict comes back as `fieldErrors.conflict` (`changed` / `missing` / `exists`).
> - **Cron:** `src/app/api/cron/content-publish/route.ts` handles due articles, builds and the daily site health check, with a 50-second budget.
> - **Choices made while building:**
>   - a new article whose file or address already exists on the site is **refused** ("change the slug") instead of getting a `-2` file, because the site builds the URL from the front matter `slug`, so a suffix wouldn't avoid the clash;
>   - updates of a published article keep `status = published` (the work item stays) and only track the build;
>   - images from other websites stay as links;
>   - our own inline images (`content-inline`) and the featured image are committed.
> - **Migration `0068_content_publish_cron.sql`** (the 5-minute pg_cron job) was applied right after the push that shipped the route (`81ff543`, 2026-11-27).
> - **Checks:** `scripts/git-cms-check.ts` runs the whole pipeline against a fake GitHub repo and a fake database (publish → no-change update → conflict → overwrite → unpublish → address taken → delete), 29 groups.

`publishArticle(id, mode)` and the other article actions in `src/features/content/actions.ts` branch on `article.site_kind`. WordPress code is unchanged.

## Publish now

1. **Checks:**
   - `guard("content.write")`, `SUPABASE_SECRET_KEY`;
   - the connection is `connected`, and the collection and URL pattern are set ("Finish Set up site first");
   - `content_claim_send('article', id)`, so only one send runs at a time.
2. **Load:** the article (with the person's session, so RLS applies) and the connection. Get the installation token (`installationToken`) or the Vault token (`git_connection_secret`).
3. **Build** (`buildPost`, pure apart from downloads):
   - `cleanArticleHtml(body_html)` → turndown → Markdown;
   - images:
     - the featured image comes from `content-media` (admin client download);
     - inline `<img>` from `content-inline` (our public bucket) are downloaded;
     - other https images are left as links (not fetched; we don't pull arbitrary URLs);
     - each one gets a media path and its public URL is rewritten;
   - front matter from the field map (`04`):
     - `date` = now;
     - `draft: false`;
     - the excerpt / meta rule;
     - tags = article tags or the settings defaults;
     - author = `author_name` or the settings default;
   - path: `git_path` when the article was published before and the slug hasn't changed; otherwise the rendered slug template, with the collision check.
4. **Conflict check** (only when `git_blob_sha` is set): read the file at `git_path`.
   - **Missing:** "The post was deleted on the site". Offer **Publish again**.
   - **Sha differs from `git_blob_sha`:** "Changed on the site since it was published (for example in Sveltia)". Offer **Overwrite** (passes `force`) or **Cancel**.
5. **Nothing changed:** if every file's blob sha equals what's in the repo, skip the commit and go to step 7.
6. **Commit:**
   - `commitFiles`: the post, new media, and a delete of the old path when the slug changed;
   - message `Publish: {title}` (or `Update: …`) + trailer;
   - author = the connection's commit identity, if set;
   - then call the deploy hook if there is one (POST, 10 s);
   - store `git_store_article_result`: `status publishing`, `git_deploy_state waiting`, path, blob sha, commit sha, media, `live_url`, `sent_version = version`, `release`.
7. **Deployment check** in `after()`: every 15 s for up to 2 minutes, then the cron takes over.

## Deployment check (`deploy.ts`, `checkDeploy(article)`)

| Source | Rule |
|---|---|
| GitHub deployments for `git_commit_sha` (Vercel) | Latest status `success` → live candidate; `failure` / `error` → **failed** (description + `target_url` = the build log); `pending` / `in_progress` / `queued` → `building` |
| Combined commit status (Netlify, others) | `success` / `failure` / `pending`, the same way |
| Neither within 3 minutes | Go straight to the page check |
| Page check | `GET live_url` (10 s timeout, follow redirects, at most 2 MB read). **Live** when 200 and the HTML contains the title (case-insensitive, HTML entities decoded) |

- **Live** → `git_store_article_result(status published, published_at now, git_deploy_state live)`. Triggers then write the event, activity `content.article_published`, the notification and the work item (URL = `live_url`).
- **Failed, or 30 minutes since the commit with no live page** → `status failed`, `git_deploy_state failed`, with the error:
  - "Committed to GitHub, but the site build failed: {reason}", with the log link;
  - or "Committed, but the post isn't live after 30 minutes. Check the host."

  **Retry** runs publish again: nothing changed means no commit, just a new check.

## Schedule

- **Schedule** stores `status scheduled` and `publish_at` (`save_content_article` + claim / release). Nothing is sent to GitHub.
- **Cron** (`/api/cron/content-publish`, every 5 minutes, token from `verify_zernio_cron_token`):
  1. `git_due_articles(10)` → for each scheduled one, the publish pipeline above, with `date = publish_at` (UTC);
  2. deployment checks for `publishing` articles;
  3. once a day, the connection health checks (`05`);
  4. a budget of about 50 seconds per run; leftovers wait for the next run.
- **Unschedule / cancel** works until the cron picks it up (the claim prevents races).
- The editor shows "Publishes at {local time} ({zone}). The site goes live about a minute later."

## After publishing

| Action | Commit | Result |
|---|---|---|
| **Update on site** (enabled when `version > sent_version`) | Same pipeline, same path (conflict check). The `date` is kept from the first publish | Published again after the deployment check |
| **Unpublish** | Front matter `draft: true` (same path) | `draft`; the work item is removed; the site hides it at the next build |
| **Delete from site** (confirm) | Delete the post file (media stays) | `draft`, `git_path` etc. cleared, event `unpublished` |
| **Delete draft** | None | As today |

## Errors and safety

- **One send at a time** (`content_claim_send`); the claim is released in `finally`.
- **Writes are never retried blindly.** `commitFiles` only rebuilds on a fresh head when the branch moved.
- **Double clicks and retries are harmless:** identical content means no commit, and the trailer carries `{id} v{version}`.
- **Readable errors** are stored in `last_error`: access removed, branch protected, file too large, too many images, rate limited, build failed, not live.
- **Every outside call has a timeout**, and image downloads have size caps.
- Logs never include tokens, deploy hooks or file contents.
