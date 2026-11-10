# Deploying to DigitalOcean App Platform

The app is a standard Next.js server: `npm run build`, then `npm start` (listens on `PORT`,
which App Platform sets to 8080). Node is pinned to 26.x (LTS) in `package.json`.

## 1. Environment variables (the usual cause of failed builds)

`NEXT_PUBLIC_*` values are baked into the JavaScript **at build time**, so App Platform must
provide them to the build, not only to the running app. `.env.local` is not in git, so the
host has to supply them.

In the dashboard: **App → Settings → the `seo-platform` component → Environment Variables →
Edit**, then add:

| Key                                    | Value                                                                  | Scope                         |
| -------------------------------------- | ---------------------------------------------------------------------- | ----------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://wervcffooayfcqikrplj.supabase.co`                             | Build and Run Time            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key from Supabase → Project Settings → API keys | Build and Run Time            |
| `NEXT_TELEMETRY_DISABLED`              | `1`                                                                    | Build and Run Time (optional) |

Save, then **Actions → Force Rebuild and Deploy**. Changing these later always needs a rebuild,
not just a restart.

If they're missing, the build stops in the first second with "Missing build-time environment
variables" and these same instructions (the check is in `next.config.ts`).

Alternative: paste `.do/app.yaml` into **Settings → App Spec → Edit**. It sets the build and
run commands, port, health check and these variables in one go.

## 2. Component settings

- Build command: `npm run build`
- Run command: `npm start`
- HTTP port: `8080`
- Health check path: `/login`
- Instance: at least 1 GB RAM (Next.js builds and runs comfortably there)

## 3. Supabase, after the first successful deploy

Supabase → Authentication → **URL Configuration**:

- **Site URL:** the app's URL, for example `https://seo-platform-xxxxx.ondigitalocean.app` (or
  your custom domain, such as `https://app.leadmaker.agency`).
- **Redirect URLs:** add `https://<that domain>/**`. Keep `http://localhost:3000/**` for local
  development.

Without this, the sign-up confirmation email links back to the wrong address.

Then, once the first admin exists: Authentication → Sign In / Providers → Email → turn off
**Allow new users to sign up**.

## 4. Check the deploy

- `/login` loads.
- `/dashboard` redirects to `/login` when signed out.
- `/api/clients/search` returns `401 {"error":"Not signed in"}` when signed out.
- After signing in, the Dashboard loads its tiles and client list.

## Troubleshooting

| Symptom                                                                    | Cause                                                | Fix                                        |
| -------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| Build fails: "Missing build-time environment variables"                    | Variables not set, or set with scope "Run Time" only | Section 1, then rebuild                    |
| Build passes but sign-in does nothing or the browser shows Supabase errors | Variables were added after the last build            | Force Rebuild and Deploy                   |
| Confirmation email opens `localhost`                                       | Supabase Site URL still points at localhost          | Section 3                                  |
| Health check fails                                                         | Port mismatch                                        | HTTP port 8080 and run command `npm start` |
