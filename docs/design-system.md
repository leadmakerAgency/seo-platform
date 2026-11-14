# Shockwave design system

The look of the team app (Shockwave) and the client pages (LeadMaker onboarding and requests
portal). Tokens live in `src/app/globals.css`, fonts in `src/app/layout.tsx`, shared building
blocks in `src/components/ui` (shadcn, themed) and `src/components/common`.

Short version: **navy ink, one violet, hairlines, no decoration.** The bolt in the logo is the
only loud thing on the screen.

---

## 1. Why: what makes an app look generated

Current writing on "AI-looking" or generic interfaces agrees on a short list of tells. Most of them
are not wrong in themselves; they are the statistical default, so a screen built only from them
looks like every other screen built the same way.

| Tell                                  | What the sources say                                                                                                                   | What we do instead                                                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Indigo/violet gradient on white       | The single most cited tell; traced to Tailwind's `indigo-500` being the default in years of examples, then learned by models.          | One solid violet taken from our own logo (hue 300, redder than Tailwind indigo at ~277). Never a gradient.                        |
| The "shadcn default" look             | Neutral zinc greys, Inter/Geist at default sizes, the same radius everywhere, cards with a faint ring, pill badges. Defaults compound. | Tinted neutrals (navy, hue 277–286), our own type pairing, a tighter radius scale, square-ish tags, borders tuned to the palette. |
| Pure grey neutrals                    | Refactoring UI: greys need 8–10 steps and a slight temperature; true grey and true black look lifeless.                                | Every neutral carries a small amount of the logo's navy. Text is navy ink, not black.                                             |
| Glass, glow, blobs, big soft shadows  | Glassmorphism was a 2021 trend that became an AI crutch; blurred blobs and glows read as filler.                                       | No blur, no glow, no blobs. Shadows only on things that float (menus, dialogs).                                                   |
| Identical card grids and hero headers | "Big number, small label, three cards in a row" and centered hero headers are the default layout.                                      | Stats are one segmented strip, not separate cards. Page headers are a plain title row on a hairline.                              |
| Emoji and decorative icons            | Emoji feature icons and icon-per-heading are flagged as tells; Sparkles has become the "AI" icon.                                      | Icons only where they carry meaning (nav, status, actions). No Sparkles, no party poppers.                                        |
| Generic type                          | Inter, Roboto, Arial and system stacks read as unstyled; Space Grotesk is now overused too.                                            | IBM Plex Sans + Schibsted Grotesk + IBM Plex Mono (see 3).                                                                        |
| Filler microcopy                      | "Streamline", "empower", "supercharge", "seamless", cheerful "Oops!" errors.                                                           | Plain, specific sentences: what happened, what to do. Already the house style; keep it.                                           |
| Colour everywhere                     | SaaS UIs are 80–90% neutral; colour should only mean something (action, status).                                                       | Violet is for the primary action, the active nav item, focus and selection. Status colours only for status.                       |

Sources:

- Anthropic, `frontend-design` skill (avoid purple-on-white gradients, generic fonts, cookie-cutter layouts): https://www.mintlify.com/anthropics/skills/reference/frontend-design
- "Why every AI-built website looks the same: blame Tailwind's indigo-500" (DEV): https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p
- "Why AI design looks generic" (Superdesign): https://superdesign.dev/blog/why-ai-design-looks-generic
- "AI slop fonts and gradients: the tells" (925 Studios): https://www.925studios.co/blog/ai-slop-design-tells
- Impeccable, "The visible tells of AI design" (anti-patterns, generic SaaS copy): https://www.mintlify.com/pbakaus/impeccable/concepts/anti-patterns
- Adrian Krebs, "Scoring Show HN submissions for AI design patterns": https://adriankrebs.ch/blog/design-slop/
- Refactoring UI (grey scales, tinted greys, borders sparingly, shadow scale): https://refactoringui.com/ and a summary: https://sglavoie-github-io.pages.dev/posts/2023/09/09/book-summary-refactoring-ui/
- Linear, "How we redesigned the Linear UI" (perceptual colour space, themes from base + accent + contrast): https://linear.app/now/how-we-redesigned-the-linear-ui
- Dense dashboard fonts (IBM Plex Sans, tabular figures): https://fontalternatives.com/blog/best-fonts-dense-dashboards/

---

## 2. Colour

All colours are `oklch()`. Two hues come from the logo (sampled from
`src/components/brand/shockwave-mark.png`):

- **Ink**: the navy outline, `#10103c` ≈ `oklch(0.21 0.08 277)`. Neutrals are built on hue
  277–286 with low chroma, so the whole UI sits in the bolt's outline colour.
- **Bolt**: the violet fill, `#7820c8` ≈ `oklch(0.48 0.23 301)`. This is `--primary`.

Contrast was measured with WCAG 2.x relative luminance (script: oklch → linear sRGB → ratio).
Text pairs meet **AA (4.5:1)**; large numbers and icons meet 3:1.

### Light

| Token                                | Value                                                 | Use                                   | Contrast                                          |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------- | ------------------------------------------------- |
| `--background`                       | `oklch(0.992 0.003 286)`                              | Page canvas                           |                                                   |
| `--card`, `--popover`                | `oklch(1 0 0)`                                        | Panels, tables, menus                 |                                                   |
| `--sidebar`                          | `oklch(0.966 0.008 286)`                              | Sidebar                               |                                                   |
| `--muted`, `--secondary`, `--accent` | `oklch(0.955 0.009 286)`                              | Hover, table head, chips              |                                                   |
| `--foreground`                       | `oklch(0.225 0.045 277)`                              | Body text (navy ink)                  | 17.2 on card, 16.5 on canvas                      |
| `--muted-foreground`                 | `oklch(0.49 0.03 280)`                                | Secondary text                        | 6.2 on canvas, 5.5 on muted, 5.0 on sidebar hover |
| `--border`                           | `oklch(0.91 0.011 286)`                               | Hairlines, dividers                   | decorative                                        |
| `--input`                            | `oklch(0.83 0.017 286)`                               | Input borders                         | 1.8 (see note)                                    |
| `--primary`                          | `oklch(0.5 0.235 300)`                                | Primary button, active nav, focus     | white text 6.6; 6.8 on card                       |
| `--primary-hover`                    | `oklch(0.44 0.215 299)`                               | Primary hover (darker, never lighter) | white text 8.5                                    |
| `--brand`                            | `oklch(0.47 0.22 300)`                                | Violet text and links                 | 7.7 on card, 6.7 on brand-soft                    |
| `--brand-soft`                       | `oklch(0.952 0.024 300)`                              | Selected rows, "in progress" tags     |                                                   |
| `--success` / `-soft` / `-dot`       | `0.5 0.115 158` / `0.955 0.035 160` / `0.63 0.15 155` | Done, connected, on track             | text 5.0 on soft                                  |
| `--warning` / `-soft` / `-dot`       | `0.53 0.12 62` / `0.962 0.042 88` / `0.76 0.15 75`    | Waiting, needs a look, reconnect      | text 4.8 on soft                                  |
| `--danger` / `-soft` / `-dot`        | `0.52 0.19 25` / `0.957 0.019 22` / `0.62 0.21 25`    | Overdue, broken, delete               | text 5.3 on soft                                  |
| `--info` / `-soft` / `-dot`          | `0.5 0.13 250` / `0.957 0.018 250` / `0.64 0.13 250`  | Neutral notices, invited              | text 5.3 on soft                                  |

### Dark

Dark mode is the logo's navy, not neutral black. Surfaces get lighter as they rise
(canvas → card → popover), the sidebar is the darkest.

| Token                           | Value                                               | Contrast                          |
| ------------------------------- | --------------------------------------------------- | --------------------------------- |
| `--sidebar`                     | `oklch(0.155 0.024 279)`                            |                                   |
| `--background`                  | `oklch(0.175 0.025 279)`                            |                                   |
| `--card`                        | `oklch(0.205 0.027 279)`                            |                                   |
| `--popover`                     | `oklch(0.225 0.028 279)`                            |                                   |
| `--muted`, `--accent`           | `oklch(0.25 0.028 280)`                             |                                   |
| `--border` / `--input`          | `oklch(0.285 0.028 280)` / `oklch(0.34 0.03 280)`   |                                   |
| `--foreground`                  | `oklch(0.95 0.008 286)`                             | 15.5 on card                      |
| `--muted-foreground`            | `oklch(0.72 0.025 284)`                             | 7.2 on card, 6.5 on muted         |
| `--primary` / `--primary-hover` | `oklch(0.555 0.215 300)` / `oklch(0.5 0.2 300)`     | white text 5.1 / 6.5; 3.4 on card |
| `--brand` / `--brand-soft`      | `oklch(0.78 0.13 300)` / `oklch(0.27 0.07 298)`     | 8.6 on card, 7.4 on soft          |
| `--success` / `-soft` / `-dot`  | `0.78 0.13 158` / `0.27 0.05 160` / `0.72 0.15 155` | 7.8 on soft                       |
| `--warning` / `-soft` / `-dot`  | `0.82 0.13 80` / `0.28 0.05 70` / `0.8 0.15 78`     | 8.3 on soft                       |
| `--danger` / `-soft` / `-dot`   | `0.74 0.15 22` / `0.28 0.07 22` / `0.68 0.19 24`    | 6.1 on soft                       |
| `--info` / `-soft` / `-dot`     | `0.77 0.11 245` / `0.27 0.05 250` / `0.7 0.12 250`  | 7.3 on soft                       |

Dark mode follows the operating system by default; the user menu has a Light / Dark / System
switch (next-themes, `class` strategy).

**Input borders** are 1.8:1, below the 3:1 non-text guideline, like most product UIs (GitHub,
Linear). Inputs are always labelled and the focus state (violet border plus ring) is 6.8:1.
If we ever need strict 1.4.11 compliance, darken `--input` to `oklch(0.66 0.02 286)`.

### Status map

One tone per meaning, everywhere. Components never pick colours; they pick a tone
(`src/components/common/status.tsx`).

| Tone      | Meaning                 | Used for                                                                                          |
| --------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `success` | Finished or healthy     | Health "On track", task Done, request Done, "Connected", onboarding step Done, Reviewed           |
| `warning` | Waiting or needs a look | Health "Needs a look", Waiting on client, request Waiting, "Needs reconnecting", step In progress |
| `danger`  | Broken or late          | Health "Action needed", Overdue, High priority                                                    |
| `brand`   | Ours to act on now      | Task In progress, request Answered, onboarding Submitted, selected filters                        |
| `info`    | Neutral notice          | Team member Invited                                                                               |
| `neutral` | Not started or off      | To do, Not connected / Disconnected, Not started, Skipped, Cancelled                              |

### Charts

`--chart-1` violet (bolt), `--chart-2` teal `0.62 0.1 195`, `--chart-3` amber `0.74 0.14 75`,
`--chart-4` ink `0.38 0.08 272`, `--chart-5` coral `0.66 0.15 20` (dark mode: lighter versions
of each). Series order is fixed; never use the status colours for a series that doesn't mean that
status.

### Platform brand colours

The real logos in `src/components/brand/platform-icons.tsx` keep their own colours (Google,
Facebook, ...). They are the only hex values allowed in components.

---

## 3. Typography

| Role        | Font                                  | Why                                                                                                                                                                                                                                  |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI and body | **IBM Plex Sans** (variable, 400–600) | Open, engineered grotesque with real character at 13–14 px; figures are tabular by default, which suits a tool full of counts and dates. Not Inter, not Geist (Geist is the v0/shadcn starter font, so it now reads as "generated"). |
| Headings    | **Schibsted Grotesk** (600–700)       | A sturdy news grotesque: compact, a little warm, clearly a heading face. Used only for page titles, section titles, dialog titles and big numbers.                                                                                   |
| Code, IDs   | **IBM Plex Mono** (400, 500)          | Task and request numbers (T-1051, R-101), codes, URLs. Same family as the body, so it doesn't jump.                                                                                                                                  |

Scale (px / line-height), 14 px base because this is a dense work tool, not a reading site:

| Step      | Size    | Font / weight           | Use                                         |
| --------- | ------- | ----------------------- | ------------------------------------------- |
| `title`   | 22 / 28 | Schibsted 650, -0.015em | Page title (h1)                             |
| `section` | 15 / 22 | Schibsted 600           | Section title (h2), dialog and sheet titles |
| `stat`    | 26 / 30 | Schibsted 600, tabular  | Stat strip numbers                          |
| `body`    | 14 / 20 | Plex Sans 400           | Default text, table cells                   |
| `small`   | 13 / 18 | Plex Sans 400           | Descriptions, meta                          |
| `caption` | 12 / 16 | Plex Sans 500           | Table headers, tags, labels                 |
| `mono`    | 12–13   | Plex Mono               | IDs and codes                               |

Rules: numbers get `tabular-nums`; sentence case everywhere (no all-caps labels); text never
lighter than `--muted-foreground`.

---

## 4. Shape, depth and density

- **Radius** `--radius: 0.375rem` (6 px). Controls and panels `rounded-lg` (6 px), dialogs
  and popovers `rounded-xl` (8 px), tags `rounded-sm` (4 px), avatars and dots round. Nothing pill-shaped except dots, avatars and
  progress bars.
- **Borders do the work.** Panels are white on a barely tinted canvas with a 1 px `--border`.
  No coloured borders except the selected state (violet) and the focus state.
- **Shadows** only for things that float above the page: popovers, menus, dialogs, sheets,
  toasts. The scale is navy-tinted and small (`--shadow-md`, `--shadow-lg` in `@theme`). Cards
  and tables have none. Dialogs and sheets sit on a flat navy `--scrim`, never a blur.
- **Focus**: violet border plus a 2 px violet ring at 35% (not the 3 px blurry halo).
- **Density**: controls are 32 px (`h-8`), compact rows 36–40 px, the top bar 48 px. Page
  padding 24–32 px. Sections are 32–40 px apart; inside a section 12 px.
- **Motion**: colour transitions only (150 ms). No bouncing, no scale on hover.

---

## 5. Components

**Buttons.** One primary (solid violet) per area: the main action of the page or dialog.
Everything else is `outline` (white with a border) or `ghost` (toolbars, icon buttons).
Destructive is a soft red tag-like button, and the final confirm in an alert dialog is solid.
Hover darkens; it never lightens or glows. Labels are verbs ("Add client", "Send link").

**Inputs.** White field, `--input` border, 32 px tall (44 px on the client wizard for touch),
6 px radius. Labels above, help text below in `small` muted. Errors: red border and a red line
of text under the field, never a toast alone.

**Tags (badges).** `StatusTag` with a tone: 22 px tall, 4 px radius, soft background, coloured
dot and dark text of the same tone. Counts in the sidebar are a small red rounded tag.
Plain `Badge` is for neutral labels only ("Soon", role names).

**Tables and lists.** A white panel (`bg-card`) with a 1 px border and 6 px radius. Header row: `muted`
background, 12 px medium muted text, sentence case. Cells 14 px, 12 px horizontal padding.
Row hover is `muted/60`; the selected row is `brand-soft`. Lists (`divide-y`) follow the same
panel rule. Numbers right-aligned and tabular.

**Stats.** `StatStrip`: one bordered panel split into equal cells with hairline dividers
(2 columns on phones, 3–4 on desktop). Label on top in `small` muted with an optional status
dot, number below in `stat`. A cell that is the current filter gets a 2 px violet top edge and
`brand-soft` tint. They replace the old row of separate cards. The same hairline-grid panel is
used for the onboarding step progress and the platform list.

**Tabs.** Segmented: a bordered `bg-card` track; the active segment is solid ink
(`bg-foreground text-background`), counts in a small `rounded-sm` chip. Ink, not violet, so
the violet stays rare.

**Sidebar.** Tinted panel (`--sidebar`), the Shockwave mark and wordmark at the top. Items are
32 px with the icon in muted ink. The active item: `sidebar-accent` background, ink text,
violet icon and a 2 px violet bar on its left edge. Group labels are 12 px muted sentence case.
The client search sits inside the "Client" group.

**Page header.** Title (h1) and one-sentence description on the left, actions on the right,
then a hairline under the whole row. No eyebrow art, no icon next to the title, no hero
banner. Section titles (h2) are 15 px with an optional one-line description.

**Empty states.** Inside the panel where the content would be, left-aligned on wide screens:
one short title saying what is missing, one sentence on what fills it, and the one action that
fixes it (if the viewer can take it). A small muted icon is allowed; no illustrations, no big
icon circles, no exclamation marks.

**Client-facing pages (LeadMaker).** Same tokens and fonts, larger touch targets (44 px
fields, 15 px body), the violet "LM" tile in the header, single column, max 720 px (wizard)
or 560 px (portal). The wording stays LeadMaker's.

---

## 6. Rules for new code

- Use tokens (`bg-card`, `text-muted-foreground`, `text-brand`, `bg-warning-soft`...), never
  Tailwind palette classes (`violet-500`, `zinc-200`, `text-white`) or hex values. The only
  exception is the platform logos.
- Status colour comes from a tone via `StatusTag` / `StatusDot`, not from hand-written classes.
- Violet text uses `text-brand`; `text-primary` is for icons and borders that sit next to the
  primary colour.
- New stat rows use `StatStrip`; new lists and tables sit in a bordered `bg-card` panel.
- Add shadcn components with `npx shadcn@latest add <name>`, then adjust only their theme
  classes (radius, ring, colours) to match this page.
