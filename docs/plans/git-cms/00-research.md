# Git sites · 00 · Research

Publishing articles to static sites whose blog is edited with a **Git-based CMS** (Sveltia CMS, Decap CMS, formerly Netlify CMS). The posts are Markdown files in a GitHub repo, and the host rebuilds the site on every push.

## The first site: South Africa SDR (`southafricasdr.com`)

The source is in `Desktop\South-Africa-SDR` (a OneDrive copy, not a git checkout). GitHub is the source of truth: `leadmakerAgency/South-Africa-SDR`, branch `main`.

| Piece | Details |
|---|---|
| Build | `npm run build` = `python build_pages.py` (marketing pages), then Eleventy 3 → `_site/`. Vercel builds every push (`vercel.json`: `buildCommand: npm run build`, `outputDirectory: _site`, `cleanUrls`, `trailingSlash: true`) |
| CMS | `admin/index.html` loads `@sveltia/cms` from unpkg. In `admin/config.yml`, `backend: { name: github, repo: leadmakerAgency/South-Africa-SDR, branch: main }`. Editors sign in with GitHub (OAuth app, or a personal token in Sveltia's sign-in). **Every save is a commit to `main`** |
| Collection | `posts` ("Blog Posts"): `folder: content/posts`, `create: true`, `slug: "{{slug}}"` |
| Fields | `title` (string), `slug` (string, optional), `date` (datetime, `format: YYYY-MM-DD`, no time), `draft` (boolean, default false), `excerpt` (text), `featured_image` (image), `hero_emoji` (string, default 📈), `tags` (list), `body` (markdown) |
| Media | `media_folder: content/media`, `public_folder: /media` (Eleventy passthrough-copies `content/media` → `/media`) |
| Defaults | `content/posts/posts.11tydata.json` sets `layout: blog-post.njk` and `tags: ["posts"]` |
| URL | `posts.11tydata.js` → `permalink = /blog/{slugify(data.slug or the file name or the title)}/` |
| Visibility | `lib/post-visibility.js`: in production (`VERCEL_ENV=production` etc.), posts with `draft: true` or a **future `date`** get no permalink and are left out of the collection, **when the site is built**. Nothing rebuilds on a timer, so a future-dated post only appears at the next push. **We must commit when the article is due** |
| Featured image | `lib/resolve-featured-image.js` maps `/media/x.png` to the real file (it copes with n8n's numeric suffixes). Absolute URLs pass through |
| Tags | `lib/post-tags.js` hides `airbnb`, `cambridge` (n8n junk) and `posts` |
| SEO | `_includes/header.njk`: `<title>{{ title }} \| South Africa SDR`, and **`meta description` = `og:description` = `excerpt`**. `og:image` = the featured image (made absolute). `canonical` is used when it's in the front matter. There's no separate SEO title |
| Markdown | `markdownTemplateEngine: "njk"`, so **post bodies are rendered as Nunjucks first**. Text like `{{`, `{%` or `{#` breaks the build or prints wrongly. Per-post fix: `templateEngineOverride: md` |
| Feeds | `feed.xml.njk`, `sitemap.xml.njk` and `llms*.txt.njk` read `collections.posts`, so new posts show up there on the next build |

### Existing automation (n8n)

146 posts. Many were written by an n8n flow, with files named `{slug}-{execution id}.md` and images named `image-{slug}-{id}.png`. Some have broken names (`-223638.md`, `image--223638.png`). Its front matter quotes every string and also writes `layout` and `permalink`:

```yaml
---
layout: "blog-post.njk"
title: "Africa SDR Pipeline Generation Guide for Consistent Leads"
slug: "africa-sdr-pipeline-generation-guide-for-consistent-leads"
date: "2026-10-05T14:02:28.323Z"
excerpt: "There is a moment every sales leader dreads: …"
featured_image: "/media/image-africa-sdr-pipeline-generation-guide-for-consistent-leads.png"
hero_emoji: ""
tags:
  - "airbnb"
  - "cambridge"
permalink: "/blog/africa-sdr-pipeline-generation-guide-for-consistent-leads/"
---
```

Our commits run alongside it. If both push at the same moment, moving `main` fails for one of them, and we retry from the new `main` (see `03`).

## GitHub

- **Git Data API**:
  - `POST /repos/{o}/{r}/git/blobs` (base64 for images), `POST …/git/trees` (with `base_tree`), `POST …/git/commits`, `PATCH …/git/refs/heads/{branch}` (`force: false`).
  - Several files go in one commit. A 422 "not a fast forward" means `main` moved: rebuild on the new head.
  - The Contents API (`PUT /contents/{path}`) is one file per commit, so we don't use it to write.
- **Reads:** `GET /repos/{o}/{r}` (`permissions.push`, `default_branch`, `id`), `GET /contents/{path}?ref=` (base64, `sha` = git blob sha), `GET /git/trees/{sha}?recursive=1`.
- **GitHub Apps:**
  - The app signs a JWT (RS256, `iss` = app ID, `iat` −60 s, `exp` ≤ 10 min) and calls `POST /app/installations/{id}/access_tokens` with `{repository_ids:[…]}` to get a **1-hour token limited to those repos**.
  - Install URL: `https://github.com/apps/{slug}/installations/new?state=…`. GitHub sends the person to the **Setup URL** with `installation_id`, `setup_action` and `state`.
  - With "Request user authorization (OAuth) during installation" on, it also sends `code`. That swaps to a user token (`POST https://github.com/login/oauth/access_token`), and **`GET /user/installations`** proves that this person can access that installation. The `installation_id` in a URL can't be trusted on its own.
- **Fine-grained personal tokens:**
  - Scoped to one repo, with Contents read & write, Metadata read, Deployments read and Commit statuses read.
  - Responses carry `github-authentication-token-expiration`.
  - Organisations may need to approve them.
- **Limits:**
  - 5,000 requests an hour per installation (more for big organisations); secondary limits on bursts of writes. On 403/429 read `retry-after` / `x-ratelimit-reset`.
  - 100 MB per file in Git (we cap images at 10 MB).
- **Deployment status:**
  - Vercel's GitHub integration creates a **GitHub Deployment** per push (environment `Production` for the production branch) and posts statuses (`pending` → `success` / `failure`, with `environment_url` / `target_url`). `GET /repos/{o}/{r}/deployments?sha={sha}` + `GET …/deployments/{id}/statuses`.
  - Netlify posts **commit statuses** (`GET /commits/{sha}/status`).
  - Fallback: fetch the post URL until it answers 200 and contains the title.
- **Webhooks:** `installation` (`deleted`, `suspend`) and `installation_repositories` (`removed`), signed with HMAC SHA-256 (`X-Hub-Signature-256`).

## Open questions (closed in phase 0, see `09`)

1. **Does Vercel deploy commits made by a GitHub App author?** On Vercel Hobby, and on Pro for private repos, commits from authors who aren't team members can be blocked ("commit author is not a member"). Fallbacks: commit as the owner's name and email (the `commit_name`/`commit_email` settings), or call a Vercel **deploy hook** after the commit.
2. **Does Sveltia keep fields it doesn't know** (`templateEngineOverride`) and our quoted YAML when someone edits the post there?
3. **Do Vercel deployment statuses appear for the installation token** (Deployments: read)?
4. How long a build takes, so the live checks can be timed.
