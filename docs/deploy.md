# Deploying to DigitalOcean App Platform

The app is a standard Next.js server: `npm run build`, then `npm start` (listens on `PORT`,
which App Platform sets to 8080). Node is pinned to 26.x (LTS) in `package.json`.

## 1. Environment variables

`NEXT_PUBLIC_*` values are baked into the JavaScript **at build time**, so they must exist when
`next build` runs, not only when the app starts.

**Nothing to set in DigitalOcean for these.** The public Supabase values live in the committed
`.env.production`, which Next.js reads during `npm run build` and `npm start`. They are public by
design: they ship to every visitor's browser, and row level security protects the data.

Overriding them is optional: App → Settings → the component → Environment Variables. A
variable set there wins over `.env.production`, but it must use scope **Build and Run Time**,
and changing it needs **Force Rebuild and Deploy**, not just a restart.

| Key                                                                    | Where it comes from                                               | Secret? |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                             | `.env.production`                                                 | No      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                                 | `.env.production`                                                 | No      |
| Future secrets (for example a Supabase `service_role` key, API tokens) | DigitalOcean env vars, type **Encrypted**, never a committed file | Yes     |

**One secret to add: `SUPABASE_SECRET_KEY`.** The Team page uses it to invite and remove people.
Copy the secret key from Supabase → Project Settings → API keys (`sb_secret_…`), then in
DigitalOcean add `SUPABASE_SECRET_KEY` with type **Encrypted** and scope **Run Time**, and
redeploy. Locally it goes in `.env.local`. Without it the app works, but the Team page shows a
notice and invites are turned off.

**Zernio (Connections page): `ZERNIO_API_KEY` and `ZERNIO_WEBHOOK_SECRET`.** Same rule: type
**Encrypted**, scope **Run Time**, and in `.env.local` locally. The API key comes from the Zernio
dashboard (API keys); the webhook secret is any random string of 32+ characters
(`openssl rand -hex 32`). Webhooks and the hourly check also need `SUPABASE_SECRET_KEY`.
After deploying, an admin opens any client's **Connections** page on the live site and, in the
**Zernio setup** card, clicks **Register webhook**, **Send test** and **Turn on hourly checks**.
Nothing else is set up by hand (the hourly job lives in Supabase pg_cron; its token is in Vault).

**Client onboarding link (optional settings).** Links work straight away on the app domain
(`https://<app>/onboard/<client>-<code>`). For the subdomain later: add `connect.leadmaker.agency`
under the app's Settings → Domains in DigitalOcean (CNAME at your DNS provider), then set
`ONBOARDING_HOST=connect.leadmaker.agency` and `ONBOARDING_BASE_URL=https://connect.leadmaker.agency`
and redeploy. On that host only the onboarding pages answer. Optional: `GOOGLE_REPORTING_EMAIL`
(the reporting service account) and `AGENCY_ACCESS_EMAIL` (default `seo@leadmaker.agency`).

If the values are missing anyway, the build stops in the first second with "Missing build-time
environment variables" (the check is in `next.config.ts`).

`.do/app.yaml` is an optional app spec (Settings → App Spec → Edit) with the build and run
commands, port and health check.

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

| Symptom                                                                    | Cause                                                       | Fix                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Build fails: "Missing build-time environment variables"                    | `.env.production` missing from the deployed commit          | Commit it (check `.gitignore` keeps `!.env.production`) |
| Build passes but sign-in does nothing or the browser shows Supabase errors | Wrong values, or an override was added after the last build | Fix the values, then Force Rebuild and Deploy           |
| Confirmation email opens `localhost`                                       | Supabase Site URL still points at localhost                 | Section 3                                               |
| Health check fails                                                         | Port mismatch                                               | HTTP port 8080 and run command `npm start`              |
