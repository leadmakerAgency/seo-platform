# Git sites · 04 · Discovery and mapping (`src/features/git-sites/`, pure)

> **Built (2026-11-27):**
> - **Modules:**
>   - `config.ts`: `parseCmsConfig`, `safeRepoPath` / `safePublicPath`, `configLinkFromIndexHtml`, `guessBlogCollection`, `CONFIG_PATHS`;
>   - `field-map.ts`: `autoFieldMap`, `readFieldMap`, `fieldDefaults`, `emptyRequired`, `excerptIsMeta`;
>   - `files.ts`: slug templates, paths, media names, UTC `formatDate`, `liveUrl`, URL patterns from `permalink` / `preview_path`;
>   - `markdown.ts`: turndown + GFM tables and strikethrough; `- item` lists; `u` and `figure` kept as HTML; `imageSources`, `rewriteImages`, `needsTemplateGuard`;
>   - `frontmatter.ts`: `composePost`, `frontMatterFor`, `parseFrontMatter`.
> - **Packages:** `yaml` 2.9.1, `turndown` 7.2.5, `turndown-plugin-gfm` 1.0.2 (types in `src/types/turndown-plugin-gfm.d.ts`), `@types/turndown` 5.0.6.
> - **Changed from the draft:**
>   - **defaults of every unmapped field** are written (Sveltia fills them on new posts too, for example `hero_emoji: "📈"`), not only those of required or hidden fields;
>   - tags may map to a comma-separated text field.
> - **Checks:** `scripts/git-cms-check.ts`, 25 groups, with the real South Africa SDR config and post in `scripts/fixtures/git-cms/`. Also checked once by rendering our Markdown with the site's own markdown-it: the HTML structure comes back unchanged (lists, nested lists, table, figure, code, line breaks).

Everything read from a repo is **untrusted data**. It only fills the Set up site form, and paths are checked before use.

## Finding the CMS config (`config.ts`)

1. **Look for the file:** `admin/config.yml`, `admin/config.yaml`, `public/admin/config.yml`, `static/admin/config.yml`, `src/admin/config.yml`, `site/admin/config.yml`, `app/admin/config.yml`. If none exists, read `admin/index.html` for `<link rel="cms-config-url" href="…">`.
2. **Parse it** with `yaml` (`parse`, max 1 MB, no custom tags).
3. **Check the backend:** it must be `github`. If `backend.repo` is set, it must match the connected repo (otherwise warn "This config points at another repo"). `backend.branch` becomes the default branch.
4. **Collections:** keep only **folder collections** (`folder` set) whose format is Markdown (`format` missing or `frontmatter` / `yaml-frontmatter`, and `extension` missing / `md` / `markdown`).
   - Others are listed as "not supported yet": file collections, `i18n`, `nested`, `path` with subfolders, TOML or JSON.
5. **Per collection:** `{name, label, folder, extension, slug, preview_path, media_folder, public_folder, fields[{name, label, widget, required, default, format, date_format, time_format}], hasBody}`.
   - A collection-level `media_folder` / `public_folder` wins over the global one.
   - Relative values (`""` or `./images`) mean next to the post: `folder/…` and a relative public path.
6. **Path rules:** strip a leading `/`; reject `..`, absolute paths, and anything outside a normal repo path (`^[A-Za-z0-9._/@ -]{1,200}$`).

**South Africa SDR result:** collection `posts`, folder `content/posts`, slug `{{slug}}`, media `content/media` → `/media`. Fields: title, slug, date (`YYYY-MM-DD`), draft, excerpt, featured_image, hero_emoji (default 📈), tags, body.

## The field map (`field-map.ts`)

The first match wins, by **name**, then by widget. It's shown in Set up site, where each row can be changed or set to "Don't send".

| Ours | Looks for | Sent as |
|---|---|---|
| title | `title` | string |
| slug | `slug`, `permalink_slug` | string; if missing, the slug only names the file |
| date | `date`, `pubDate`, `publishDate`, `published_at`, `publish_date` (widget datetime / date) | in the field's `format`: date-only → **UTC date** of the publish moment; otherwise ISO 8601 UTC |
| draft | `draft` (boolean) → value; `published` / `publish` (boolean) → inverted | boolean |
| excerpt | `excerpt`, `summary`, `description`, `lead` | the article's excerpt. If the site has **no** separate meta description field, send the **meta description when set, otherwise the excerpt** (South Africa SDR uses `excerpt` as the meta description) |
| meta description | `meta_description`, `metaDescription`, `seo_description`, `description` (when the excerpt took another field) | string |
| SEO title | `seo_title`, `meta_title`, `metaTitle` | string |
| featured image | `featured_image`, `featuredImage`, `image`, `thumbnail`, `cover`, `cover_image`, `hero_image`, `banner` (widget image) | `{public_folder}/{file}` |
| image alt | `image_alt`, `featured_image_alt`, `alt` | the article title |
| tags | `tags`, `categories`, `keywords` (widget list / select multiple) | list of strings |
| author | `author`, `authors` (string or list) | `author_name`, or the settings default |
| canonical | `canonical` | not sent (the site builds it); can be mapped |
| body | the `markdown` / `richtext` widget named `body` (or any markdown widget) | the file body below the front matter |

- **Required fields we can't fill:** we use their `default` (for example `hero_emoji: "📈"`), otherwise leave them out and list them under "We leave these empty". The CMS shows them as empty when edited.
- **Hidden widgets** with a default (for example `layout`) get their default.

## Files and paths (`files.ts`)

- **Slug template** (`{{slug}}`, `{{year}}`, `{{month}}`, `{{day}}`, `{{hour}}`, `{{minute}}`, `{{second}}`, `{{fields.<name>}}`, `{{title}}`):
  - rendered with the publish moment in UTC;
  - `{{slug}}` = the article slug (already `a-z0-9-`);
  - `{{title}}` is slugified like Decap does (lower case, `-`).
- **Post path:** `{folder}/{rendered}.{extension}`.
- **Collision** (first publish only): if the path exists in the repo and wasn't written by this article, try `-2` … `-9`. The slug written in the front matter stays the article's slug, so the URL changes too; the editor warns about this before publishing.
- **Media:**
  - featured image → `{media_folder}/{slug}.{ext}`;
  - inline images → `{media_folder}/{slug}-{n}.{ext}`;
  - an existing file with the same name and the same blob sha is reused; a different one gets `-2`.
  - Types allowed: png, jpg/jpeg, webp, gif, avif; ≤10 MB each; ≤20 images an article.
- **Live URL:** `site_url` + `url_pattern` with `{slug}` (plus `{year}`, `{month}`, `{day}`). The default pattern comes from:
  1. the collection's `preview_path`;
  2. the `permalink` in an existing post's front matter, with its slug replaced by `{slug}`;
  3. `/blog/{slug}/`.

  The "Test" button fetches one existing post's URL and expects 200.

## Markdown (`markdown.ts`)

- **`turndown`** with headings `atx`, bullets `-`, code `fenced`, em `_`, strong `**`, links inline, plus **`turndown-plugin-gfm`** tables and strikethrough.
- **Input:** the article HTML after `cleanArticleHtml()`, with tags h2–h4, p, br, hr, strong/b, em/i, u, s, a, ul/ol/li, blockquote, code, pre, img, figure, figcaption, table.
- **Kept as HTML:** `u` (Markdown has no underline), and `figure` with its `figcaption`. Eleventy's markdown-it allows HTML.
- **Images** become `![alt](public path)` once the URLs are rewritten to the committed files.
- **Nunjucks guard:** if the Markdown contains `{{`, `{%` or `{#`, the front matter gets `templateEngineOverride: md` (Eleventy then skips Nunjucks for that post). Phase 0 checks that Sveltia keeps this field when someone edits the post.

## Front matter (`frontmatter.ts`)

- YAML via `yaml.stringify`: every string double-quoted (`defaultStringType: QUOTE_DOUBLE`), line width off, lists as block sequences. It looks like what n8n writes today.
- **Order:** title, slug, date, draft, excerpt / meta, featured image, tags, author, other defaults, then `templateEngineOverride` when needed.
- The `---` fences, a blank line, then the body with a trailing newline.
- Round-trip check: `yaml.parse(frontmatter)` must equal the object we built.
