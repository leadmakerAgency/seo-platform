# LeadMaker SEO Platform

Internal agency app for managing SEO clients: rankings, AI visibility, content, backlinks,
reviews and monthly reports in one place. This is the base: auth with roles, the app shell and
the Dashboard. Every other page shows "Coming soon".

- Product plan (reference): [`docs/product-plan.md`](docs/product-plan.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Deploying (DigitalOcean App Platform): [`docs/deploy.md`](docs/deploy.md)

## Setup

1. Install: `npm install`
2. Environment: copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable
   key (Supabase dashboard → Project Settings → API keys).
3. Database: the migrations in `supabase/migrations` are already applied to the `seo-platform`
   project. For a new project, apply them in order.
4. Run: `npm run dev`, then open `/setup` to create the first admin account (only works while no
   team member exists).
5. In Supabase → Authentication:
   - **URL Configuration:** set Site URL to your app URL (for example `http://localhost:3000`)
     and add `http://localhost:3000/**` to Redirect URLs.
   - **Sign In / Providers → Email:** after the admin exists, turn off "Allow new users to sign
     up". Team members are invited later from the Team page.

## Scripts

| Script              | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Dev server                                            |
| `npm run build`     | Production build (also checks Cache Components rules) |
| `npm run lint`      | ESLint                                                |
| `npm run typecheck` | Route types + TypeScript                              |
| `npm run format`    | Prettier                                              |
