@AGENTS.md

# LeadMaker SEO Platform

Internal agency app: every SEO client, keyword, article, backlink and review in one place.
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
- **UI:** white surfaces, zinc text, violet `--primary` only for primary actions, the active nav
  item and focus rings. No gradients, glows or big shadows. Use shadcn components from
  `src/components/ui` (add new ones with `npx shadcn@latest add <name>`; don't hand-edit them
  except for the theme). Numbers get `tabular-nums`. Every list needs a real empty state.
- **Filters in the URL:** list pages keep filters in search params (see
  `src/features/dashboard/search-params.ts`) so views can be linked.
- The `cn` helper comes from the `cn` package (shadcn's), re-exported by `src/lib/utils.ts`.
