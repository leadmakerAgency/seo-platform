@AGENTS.md

# Shockwave SEO Platform

Internal agency app: every SEO client, keyword, article, backlink and review in one place.
**Branding:** the team app is **Shockwave** (lightning mark: `src/components/brand/`, icons:
`src/app/icon.png`, `apple-icon.png`). Anything clients see (onboarding link, client requests page,
messages sent to clients, the brand name Zernio shows) stays **LeadMaker**, the agency they hired,
with the "LM" tile icon (`src/app/onboard/icon.png`, `src/app/(portal)/c/icon.png`).
What we are building (frozen reference, do not edit): `docs/product-plan.md`.
How the code is organised: `docs/architecture.md`.

## Stack

Next.js 16 (App Router, **Cache Components on**, `src/proxy.ts` instead of middleware) ·
React 19 · Tailwind 4 · shadcn/ui (radix-nova, lucide icons) · Supabase (Postgres + Auth, RLS) ·
zod 4 · react-hook-form · TanStack Table v9 · sonner.

Supabase project: `seo-platform` (ref `wervcffooayfcqikrplj`). Use the Supabase MCP for schema work.

## Commands

- `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm run format`
- Run lint, typecheck and build before saying work is done. The build is where Cache Components
  errors show up.

## Rules that are easy to get wrong

- **Cache Components:** anything that reads cookies, the session, `params`, `searchParams`,
  `usePathname()`/`useSearchParams()` or `new Date()`/`Math.random()` must render inside a
  `<Suspense>` boundary. Pattern: a static page frame, then each data section as its own async
  component inside `<Suspense fallback={<Skeleton…/>}>`. Never await the session at the top of a
  layout. Check `node_modules/next/dist/docs/` before using a Next API from memory.
- **Auth:** read the user only through `getCurrentMember()` (`src/lib/auth.ts`). Every Server
  Action that writes starts with `requirePermission(...)`. RLS in the database is the real gate;
  `src/lib/roles.ts` must mirror the policies.
- **Database changes:** add `supabase/migrations/NNNN_name.sql`, apply it with the MCP
  `apply_migration`, run `get_advisors` (security + performance) and fix findings, then regenerate
  `src/lib/supabase/database.types.ts` with `generate_typescript_types`. Never edit the types by
  hand. Helper functions used by RLS live in the `private` schema.
- **New page:** add or flip the entry in `src/lib/navigation.ts` (`comingSoon: false`), put the
  route file in `src/app/(app)/...` and keep it thin; logic goes in `src/features/<module>/`
  (`queries.ts` server-only reads, `actions.ts` Server Actions, `schemas.ts` zod, `components/`).
- **UI:** follow `docs/design-system.md`: navy-tinted neutrals, one violet (`--primary`, the
  bolt) for primary actions, the active nav item, selection and focus. Status colour only through
  `StatusTag`/`StatusDot` tones (`src/components/common/status.tsx`), stat rows through
  `StatStrip`, violet text through `text-brand`. Only tokens: no palette classes or hex (platform
  logos excepted). No gradients, glows, blur or big shadows. Use shadcn components from
  `src/components/ui` (add new ones with `npx shadcn@latest add <name>`; don't hand-edit them
  except for the theme). Numbers get `tabular-nums`. Every list needs a real empty state.
- **Filters in the URL:** list pages keep filters in search params (see
  `src/features/dashboard/search-params.ts`) so views can be linked.
- **Env vars:** read them only through the getters in `src/lib/env.ts`, never at module top
  level. `NEXT_PUBLIC_*` values are baked in at build time; `next.config.ts` fails the build if
  one is missing. Production gets the public values from the committed `.env.production`;
  never put secrets there (secrets go in `.env.local` or the host's encrypted env vars).
  Hosting notes: `docs/deploy.md`.
- **Service role:** `src/lib/supabase/admin.ts` bypasses RLS. Use it only inside actions that
  already called `requirePermission(...)` (team invites, activation, removal).
- **Dates:** due dates are plain `YYYY-MM-DD`; "today" is America/Phoenix (`src/lib/dates.ts`,
  `private.agency_today()` in SQL). Don't compute dates with `new Date()` in render outside Suspense.
- **Tasks:** status follows the client ticks in the database (triggers); don't set it from the app
  when ticking. RLS + guard triggers restrict VAs/writers to their own tasks.
- **Client requests:** status changes, task sync and notifications run in triggers. The portal
  (`/c/<token>`) uses only the token-checked `portal_*` database functions through the
  session-less client in `src/lib/supabase/public.ts`; never give the portal the service role.
- **Zernio (Connections):** call Zernio only through `src/lib/zernio/client.ts` (server only).
  Write `social_accounts` only through `syncClient`/`syncAll` in
  `src/features/connections/sync.ts`; status side effects (alerts, notifications, history) are
  triggers. Never trust Zernio callback query params. Deleting a client needs `offboardClient`
  first (restrict foreign key). Plan: `docs/plans/connections-zernio.md`.
- **Onboarding:** the client side writes only through the `onboarding_*` functions (token checked,
  validated, throttled); never add anon table policies. Passwords only ever go to Supabase Vault
  (`client_logins.secret_id`); never select or log them. Plan: `docs/plans/onboarding.md`.
- **Overview / monthly work:** delivered work is only ever a row in `work_items` (one per
  `(source, source_id, client)`); never count from tasks or other tables directly. New modules
  insert their own `source` rows (contract in `docs/architecture.md`). `clients.health` is derived
  from open alerts by triggers; raise or resolve an alert instead of setting it. Month maths uses
  `agencyMonth()`/`daysLeftInMonth()` (`src/lib/dates.ts`). Plan: `docs/plans/overview.md`.
- The `cn` helper comes from the `cn` package (shadcn's), re-exported by `src/lib/utils.ts`.
