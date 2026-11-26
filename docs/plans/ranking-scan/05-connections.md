# Ranking scan · 05 · Search Console connection

## In Connections (`connections.manage`)

- **Where it lives:** `googlesearchconsole` joins `DATA_PLATFORMS` in `src/features/connections/constants.ts` (like `WEBSITE_PLATFORMS` for WordPress). It is never a social platform: onboarding's social step and the Content post pickers ignore it (`isSocialPlatform`, `private.is_social_platform`).
- **A Search data card** under Website:
  - **Connect (team):** the existing `startConnect`. Zernio's consent screen and site picker follow. Sign in with the Google account that can see the client's Search Console: the agency account (`GOOGLE_AGENCY_EMAIL`) that the client added as a Restricted user, or anyone with access.
  - **Send the client a link:** the existing client link (`createClientLink`, Zernio platform invites). If Zernio doesn't offer invites for Search Console, the error says so.
- **Sync:** `syncClient` / `syncAll`. `listAccounts` also asks for `category=analytics`, so Search Console sites are listed even if Zernio keeps them separate. A 403 from Zernio during a scan marks the account "needs reconnecting" (through the health sync).
- **One site per client.** With several, Rankings → Settings picks the one to read (default: the one matching the website).

## When it connects (database trigger)

1. **Onboarding:** the Search Console answer becomes added, verified now, with the site as the property. No more manual "Mark verified" for it.
2. **Settings:** `rank_settings.gsc_account_id` is set when it's empty.
3. **First scan:** a scan with the `connected` trigger is queued (outside the manual quota).

## One agency email

- **New env:** `GOOGLE_AGENCY_EMAIL`, the agency Google account clients add (e.g. seo@leadmaker.agency). It falls back to `GOOGLE_REPORTING_EMAIL`, then to seo@leadmaker.agency.
- **Used by:**
  - the onboarding Google step: "Add this email as a Restricted user in Search Console. We'll connect it for you";
  - the Search Console request template;
  - the Search data card's help text.

## Zernio side

- **Analytics add-on:** needed for search analytics and Business Profile keywords. A 402 `analytics_addon_required` shows "Turn on Zernio's Analytics add-on" on the scan's source chip and to admins.
- **Billing:** each Search Console site may count as a connected account ($1–6 a month), confirmed in phase 0.
- **Branding:** the consent screen shows Zernio's app name.
