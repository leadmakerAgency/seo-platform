# Git sites · 01 · Overview

## Goal

Publish now, schedule, update, unpublish and delete Content articles on **Git-based CMS sites** (Sveltia / Decap on GitHub, any host that builds on push), next to WordPress. Clients can connect their site from the **onboarding link**.

## Decisions

| Topic | Decision |
|---|---|
| Access | **GitHub App** "LeadMaker Publisher", installed per repo (1-hour tokens limited to the repo). **Fallback:** a fine-grained personal token, kept in Supabase Vault |
| Images | Committed into the site's media folder **in the same commit** as the post |
| Flow | Straight to the configured branch (`main`). The host builds, and we confirm the post is live |
| Scheduling | Our own cron commits when the article is due (every 5 minutes). Static sites hide future-dated posts until the next build, so we never commit ahead |
| Format | Markdown with YAML front matter first. TOML and JSON front matter later |
| Where it lives | New `git_connections` table, not `social_accounts` (the Zernio sync would mark a GitHub row removed) |

## How it fits

```
Connections ─ Git-based site card ─► GitHub App install (or token) ─► repo picked ─► CMS config read ─► Set up site (collection, field map, URL)
Onboarding  ─ Website step: "Git-based CMS" ─► same install flow (onboarding origin) ─┘
Content     ─ article (HTML) ─► Markdown + front matter + images ─► one commit ─► host builds ─► live check ─► published
Cron (5 min) ─► due scheduled Git articles + deployment checks + daily connection health
```

- **WordPress** keeps working exactly as today, through Zernio.
- `content_settings.site_kind` picks the default destination. Each article stores its own `site_kind` and `git_connection_id`.
- Triggers keep doing events, activity, notifications and `work_items`. The work item URL becomes `coalesce(wp_url, live_url)`.

## Phases

| # | Phase | Ends with |
|---|---|---|
| 0 | GitHub App created (`05`), environment variables, test repo; live checks (`00` open questions) | Answers recorded |
| 1 | These docs | Written |
| 2 | Database `0064`–`0066` | Live, types regenerated |
| 3 | `src/lib/github/` + pure checks | Checks pass |
| 4 | Discovery and mapping (`src/features/git-sites/` pure modules) + `scripts/git-cms-check.ts` | Checks pass |
| 5 | Connections: card, install callback, token dialog, Set up site sheet, health checks, webhooks | Test repo connects |
| 6 | Pipeline: publish now, deployment check, cron, schedule, update, unpublish, delete, conflicts | A test post goes live |
| 7 | Content UI | Usable |
| 8 | Onboarding | A client connects from the link |
| 9 | Wording, `CLAUDE.md`, `docs/architecture.md`, real site switched on, push | Shipped |

## Later

- GitLab and Bitbucket backends.
- TOML/JSON front matter, i18n, nested and file collections.
- Importing a site's existing posts (for internal links and keyword cannibalisation).
- Pull-request mode per site.
- Hugo and Astro presets.
