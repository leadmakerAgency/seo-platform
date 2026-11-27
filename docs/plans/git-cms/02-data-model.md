# Git sites · 02 · Data model

> **Built (2026-11-27)**: `0064`, `0065` and `0066` (+ `0066_git_sites_functions_fix_media`) are applied. How it differs from the first draft below:
> - **Secrets:** the Vault ids live in their **own table**, `git_connection_secrets` (RLS on, no policies, revoked from anon and authenticated), not in `git_connections` columns.
> - **Unique key:** `(client_id, lower(owner), lower(repo))` among rows that aren't removed. `repo_id` is filled once known.
> - **Attempts:** `git_connect_attempts` also stores the `installation_id` the person proved access to.
>   - `git_check_connect_attempt` validates the state without using it, for the repo picker.
>   - `git_attempt_set_installation` records the installation.
>   - `git_finish_connect` requires that installation and uses up the state.
> - **Cron:** its own Vault token `content_cron_token` + `verify_content_cron_token(p_token)`. **The pg_cron job is scheduled in phase 6**, together with the route, so it doesn't call a missing URL.
> - **No `git_due_articles` function:** the service role reads the due rows directly (partial index `content_articles_git_due_idx`), and `content_claim_send` prevents double sends.
> - **New `onboarding_git_status(p_token)`:** what the website step shows (repo and status, no secrets).
> - **`git_set_connection_status`** also fills empty Set up site defaults. On reconnect it marks the onboarding website step `connected`.
> - **Tested** (rolled-back SQL, all passed):
>   - one-time states (wrong key, expired, used twice, no installation);
>   - path checks;
>   - token in Vault, unreadable by team and anon roles, deleted on disconnect;
>   - the problem notification;
>   - the article destination and its lock after sending;
>   - work item URL = `live_url`;
>   - onboarding origin → website step done;
>   - 7 of 7 refusals for someone who isn't a team member.

New migrations. As in 0058 and 0061, new enum values get **their own migration**, because a value added in a transaction can't be used in that same transaction.

## 0064_git_sites_kinds.sql (enums only)

```sql
alter type public.website_platform add value if not exists 'git_cms';          -- onboarding website step
alter type public.website_access_status add value if not exists 'connected';   -- the site is connected through GitHub
alter type public.notification_kind add value if not exists 'site_connection_problem';
create type public.git_auth_method as enum ('github_app', 'token');
create type public.git_connection_status as enum ('connected', 'needs_attention', 'removed');
create type public.content_site_kind as enum ('wordpress', 'git');
create type public.git_deploy_state as enum ('none', 'waiting', 'building', 'live', 'failed');
```

## 0065_git_sites.sql (tables)

### `git_connections` (one row per client and repo)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `client_id` | uuid → clients, cascade | |
| `auth_method` | git_auth_method | |
| `installation_id` | bigint | GitHub App; required when `auth_method = 'github_app'` |
| `token_secret_id` | uuid | Vault; required when `auth_method = 'token'`. **Never selectable by team roles** (column grant) |
| `token_expires_at` | timestamptz | From `github-authentication-token-expiration` |
| `owner`, `repo` | text | `^[A-Za-z0-9_.-]{1,100}$` |
| `repo_id` | bigint | Stable even if the repo is renamed |
| `branch` | text | Default: the repo's default branch, or the CMS `backend.branch` |
| `config_path` | text | For example `admin/config.yml` |
| `collection` | text | Collection `name` |
| `folder` | text | For example `content/posts`; relative, no `..` |
| `extension` | text | `md` (default) / `markdown` |
| `format` | text | `yaml-frontmatter` (only this for now) |
| `slug_template` | text | For example `{{slug}}` |
| `media_folder` | text | Repo path, for example `content/media` |
| `public_folder` | text | URL prefix, for example `/media` |
| `date_format` | text | `YYYY-MM-DD`, ISO, … (from the date field) |
| `field_map` | jsonb | `{ title: "title", date: "date", draft: {name:"draft"} \| {name:"published", invert:true}, excerpt: "excerpt", … }` (see `04`) |
| `url_pattern` | text | For example `/blog/{slug}/` |
| `site_url` | text | `https://…`, from `clients.website` by default |
| `commit_name`, `commit_email` | text | Optional commit author (see `00`, open question 1) |
| `deploy_hook_secret_id` | uuid | Vault; optional. Called after each commit |
| `status` | git_connection_status | |
| `last_error` | text | |
| `last_checked_at` | timestamptz | |
| `detected` | jsonb | What we read: collections, fields, the backend block (shown in Set up site) |
| `created_by`, `created_at`, `updated_at` | | |

- **Indexes:** unique `(client_id, repo_id) where status <> 'removed'`; `(status, last_checked_at)`.
- **RLS:** select for team members who can see the client (`private.can_see_client`). No direct writes.

### `git_connect_attempts`

`id, client_id, origin text check (origin in ('team','onboarding')), key_hash bytea, onboarding_link_id → onboarding_links, created_by → team_members, created_at, expires_at (now() + 30 min), used_at, result jsonb`.
- RLS: none for clients; the team can read its own attempts.
- The one-time key is shown only once, inside the install `state`.

### `content_settings` (new columns)

- `site_kind content_site_kind not null default 'wordpress'`
- `git_connection_id uuid → git_connections on delete set null`
- `git_default_author text (≤100)`
- `git_default_tags text[] default '{}' (≤20)`

### `content_articles` (new columns)

| Column | Notes |
|---|---|
| `site_kind content_site_kind not null default 'wordpress'` | Copied from settings when the article is created; changeable while it has never been sent |
| `git_connection_id` | → git_connections, on delete set null |
| `git_path` | The file in the repo (for example `content/posts/my-post.md`) |
| `git_blob_sha` | Sha of the file we last wrote (conflict check) |
| `git_commit_sha` | Last commit |
| `git_media text[]` | Media paths we committed |
| `git_deploy_state git_deploy_state not null default 'none'` | |
| `git_deploy_checked_at`, `git_deploy_error` | |
| `live_url` | The post's public URL |
| `author_name` | Free-text author for Git sites |

- The existing `author` check (`^[0-9]{1,12}$`) stays; it only matters for WordPress.
- **Triggers** (0060 `content_article_after_write`):
  - the work item URL becomes `coalesce(wp_url, live_url)`;
  - event, activity and notification text name the destination: the WordPress site, or the Git site's domain.

### Cron

`configure_content_publish_cron()` (service role) reuses the Vault `app_base_url` and the existing cron token. It schedules **`content-publish` every 5 minutes** (`*/5 * * * *`) → `POST {app}/api/cron/content-publish`. The route checks the token with `verify_zernio_cron_token`.

## 0066_git_sites_functions.sql (functions)

**Team** (security definer, `private.require_content_admin` / connections manager, `search_path = ''`):

| Function | Does |
|---|---|
| `start_git_connect(p_client_id)` | Creates an attempt (origin team); returns `{attempt_id, key}` (key = 32 random bytes, hex; only its sha256 is stored) |
| `save_git_connection(p_id, p jsonb)` | Collection, folder, slug template, media and public folders, date format, field map, URL pattern, site URL, branch, commit name and email. Paths are checked: relative, no `..`, ≤200 characters |
| `save_git_token(p_client_id, p_connection_id, p_owner, p_repo, p_token)` | Stores the token in Vault and creates or updates a token connection with status `connected` **pending the server check** (the action checks it right after and sets the status) |
| `save_git_deploy_hook(p_id, p_url)` | Vault; `https://api.vercel.com/v1/integrations/deploy/…` or `https://api.netlify.com/build_hooks/…` |
| `remove_git_connection(p_id)` | Status `removed`, deletes its Vault secrets, clears the content settings link |
| `save_content_article` / `save_content_settings` | Gain `site_kind`, `git_connection_id`, `author_name` / `git_default_*` |

**Onboarding** (anon; `private.onboarding_client(p_token, true)`):
- `onboarding_start_git_connect(p_token)` → `{attempt_id, key}` (origin onboarding, linked to the onboarding link).
- `onboarding_save_git_token(p_token, p_owner, p_repo, p_token_value)`.
- Both return `private.onboarding_refresh(cid, true)`. The website step counts as done when the platform is `git_cms` and a connection is `connected`.

**Service role only:**

| Function | Does |
|---|---|
| `git_finish_connect(p_attempt_id, p_key, p jsonb)` | Unused, unexpired, key hash matches → upsert the connection (installation, owner, repo, repo_id, branch, detected, defaults); marks the attempt used; for onboarding, sets `onboarding_website.platform = git_cms` and `access_status = connected` |
| `git_connection_secret(p_id, p_kind)` | Returns the decrypted token or deploy hook (`vault.decrypted_secrets`) |
| `git_set_connection_status(p_id, p_status, p_error)` | On the first change to `needs_attention`, notifies the client owner and admins (`site_connection_problem`) and writes activity `connection.site_problem` |
| `git_store_article_result(p_article_id, p jsonb)` | Like `zernio_store_article_result`: `{release, status, git_path, git_blob_sha, git_commit_sha, git_media, git_deploy_state, git_deploy_error, live_url, sent_version, published_at, error, event, actor}` |
| `git_due_articles(p_limit)` | Scheduled Git articles with `publish_at <= now()`, plus those in `publishing` whose deployment is `waiting`/`building`, oldest first, `for update skip locked` |

After the migrations: `get_advisors` (security + performance), regenerate `database.types.ts`, rolled-back SQL tests (`09`).
