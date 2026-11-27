# Git sites · 09 · Checks

Every phase passes `npm run lint`, `npm run typecheck` and `npm run build`.

## Phase 0: live checks (needs your yes; no client posts are touched)

- [ ] The GitHub App is created with the settings in `05`. The 6 `GITHUB_APP_*` variables are in `.env.local` and DigitalOcean.
- [ ] **Test repo:** a private copy of South Africa SDR (for example `leadmakerAgency/south-africa-sdr-test`) on its own **Vercel project** (not the production domain), with the app installed on it.
- [ ] An installation token is limited to that one repo (a call to another repo returns 404).
- [ ] The install `state` comes back on the callback together with `code` (with "Request user authorization during installation" on).
- [ ] A commit through the Git Data API (one post + one image) lands on `main`.
- [ ] **Vercel builds a commit made by the app (bot author).** If not: does setting the author to the Vercel account owner's name and email work? Otherwise, use a deploy hook. Record which.
- [ ] `GET /deployments?sha=` shows Vercel's Production deployment and its statuses with the installation token. Record the build time.
- [ ] The post is live at `/blog/{slug}/`, and a future-dated post is hidden (confirms `00`).
- [ ] **Sveltia:** open our post in `/admin/` on the test site, edit it, save. Does it keep `templateEngineOverride` and the quoted YAML? Record what it changes.
- [ ] A fine-grained token with the documented permissions can do the same commit and read deployments.

## Pure checks (`npx tsx --conditions=react-server scripts/git-cms-check.ts`)

- [ ] **Config:**
  - South Africa SDR's real `admin/config.yml` → one supported collection with the right folder, media, public folder and fields;
  - Decap examples: collection-level `media_folder`, relative media, a `published` boolean;
  - unsupported collections listed (file / i18n / nested / toml);
  - repo mismatch warning;
  - rejected paths (`..`, absolute).
- [ ] **Field map:** South Africa SDR auto map = title, slug, date (date-only), draft, excerpt ← meta description or excerpt, featured_image, tags, hero_emoji default.
- [ ] **Slug template and dates:**
  - `{{slug}}`, `{{year}}-{{month}}-{{day}}-{{slug}}`;
  - the UTC date for a Sydney evening publish (never a future date);
  - collision suffixes.
- [ ] **Markdown:**
  - every tag our sanitizer allows (h2–h4, lists, nested lists, links, bold and italic, underline kept as HTML, blockquote, code, pre, tables, figure, figcaption, img);
  - inline image rewrite;
  - Nunjucks guard on `{{ x }}`, `{% if %}`, `{# #}`.
- [ ] **Front matter:**
  - round-trips through `yaml.parse`;
  - quoting of `:` / `#` / quotes / emoji;
  - order;
  - only mapped fields.
- [ ] **Blob sha** equals `git hash-object` for text and binary samples.
- [ ] **JWT:** header and payload (`iss`, `iat` −60, `exp` +540) and an RS256 signature that verifies with a test key.
- [ ] **commitFiles:** with a mocked fetch, a 422 on moving the ref → it rebuilds on the new head; it stops after 3 tries; nothing changed → no commit.

## Database (rolled-back SQL)

- [ ] `start_git_connect` → `git_finish_connect`:
  - works once;
  - a second use is refused;
  - refused after 30 minutes;
  - a wrong key is refused.
- [ ] Team roles can't read `token_secret_id` / `deploy_hook_secret_id` or `vault.decrypted_secrets`. `git_connection_secret` is refused for `authenticated`.
- [ ] `remove_git_connection` deletes its Vault secrets and clears `content_settings.git_connection_id`.
- [ ] `git_store_article_result(published, live_url)` → a work item with `url = live_url`, the activity and the notification. Unpublish removes the work item.
- [ ] `git_due_articles` returns only Git articles that are due or deploying, and skips locked rows.
- [ ] Onboarding:
  - `onboarding_start_git_connect` with a revoked link is refused;
  - `onboarding_save_git_token` stores the token in Vault only;
  - the website step is done when `git_cms` + connected.
- [ ] Advisors show no new findings.

## Live, on the test repo (your yes)

- [ ] Publish now → commit → Deploying → Live; the post has the right title, meta description, image, tags and URL. The work item is created.
- [ ] Schedule 10 minutes ahead → committed within 5 minutes of the time, then live.
- [ ] Update → one new commit. Update with no changes → no commit.
- [ ] An edit in Sveltia, then Update → the conflict message. Overwrite → commit.
- [ ] Unpublish → `draft: true` → the page is gone after the build. Delete from site → the file is removed.
- [ ] A forced build failure (a broken test commit) → Deploy failed + log link; Retry after fixing → Live.
- [ ] The token path does the same. Uninstalling the app → needs attention plus a notification (webhook).
- [ ] Onboarding: connecting from the link → the website step is done; the team sees it.

## Browser (you sign in)

- [ ] The Connections card states, the Set up site sheet, the repo picker.
- [ ] The editor for a Git target: front matter preview, chips, wording.
- [ ] The onboarding website card at 375 px and in dark mode.

## Before pushing

- [ ] No open runs (rank runs, research, backlinks, AI visibility, scans, content sends).
- [ ] `git add` only this feature's paths.
