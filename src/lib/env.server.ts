import "server-only"

/**
 * Server-only secrets, read lazily (never at module top level).
 * Locally in .env.local; on DigitalOcean as Encrypted, Run Time variables.
 * Never in .env.production or any NEXT_PUBLIC_ variable.
 */

export function hasZernioApiKey() {
  return Boolean(process.env.ZERNIO_API_KEY)
}

export function getZernioApiKey(): string {
  const key = process.env.ZERNIO_API_KEY
  if (!key) {
    throw new Error(
      "Missing ZERNIO_API_KEY. Add it to .env.local (and to the host as an encrypted Run Time variable).",
    )
  }
  return key
}

export function getZernioWebhookSecret(): string | null {
  return process.env.ZERNIO_WEBHOOK_SECRET || null
}

/** DataForSEO: API login (account email) and API password from app.dataforseo.com/api-access. */
export function hasDataForSeo() {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD)
}

export function getDataForSeoAuth(): string {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) {
    throw new Error(
      "Missing DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD. Add them to .env.local (and to the host as encrypted Run Time variables).",
    )
  }
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`
}

/** https://api.dataforseo.com, or https://sandbox.dataforseo.com for free sample data. */
export function getDataForSeoBase(): string {
  return (process.env.DATAFORSEO_API_BASE || "https://api.dataforseo.com").replace(/\/+$/, "")
}

export function isDataForSeoSandbox(): boolean {
  return getDataForSeoBase().includes("sandbox")
}

export function getZernioApiBase(): string {
  return (process.env.ZERNIO_API_BASE || "https://zernio.com/api/v1").replace(/\/+$/, "")
}

// ---------------------------------------------------------------------------
// Client onboarding link
// ---------------------------------------------------------------------------

/** The onboarding subdomain (e.g. connect.leadmaker.agency), or null while not set up. */
export function getOnboardingHost(): string | null {
  return process.env.ONBOARDING_HOST?.trim().toLowerCase() || null
}

/** Public base for onboarding links: the subdomain when set, else <app>/onboard. */
export function onboardingBase(appOrigin: string): string {
  const base = process.env.ONBOARDING_BASE_URL?.trim().replace(/\/+$/, "")
  return base && /^https:\/\//.test(base) ? base : `${appOrigin}/onboard`
}

export function onboardingLinkUrl(appOrigin: string, slug: string, token: string) {
  return `${onboardingBase(appOrigin)}/${slug}-${token}`
}

/** Where Zernio sends the client back after an onboarding sign-in. */
export function onboardingDoneUrl(appOrigin: string) {
  return `${onboardingBase(appOrigin)}/done`
}

/**
 * The agency Google account clients add to Search Console (Restricted) and GA4 (Viewer). The
 * team signs in with it to connect Search Console through Zernio. GOOGLE_AGENCY_EMAIL, else the
 * older GOOGLE_REPORTING_EMAIL, else the agency access email (seo@leadmaker.agency).
 */
export function getGoogleReportingEmail(): string {
  return (
    process.env.GOOGLE_AGENCY_EMAIL?.trim() ||
    process.env.GOOGLE_REPORTING_EMAIL?.trim() ||
    getAgencyAccessEmail()
  )
}

/** The email clients invite to their website (WordPress admin, Webflow, Shopify...). */
export function getAgencyAccessEmail(): string {
  return process.env.AGENCY_ACCESS_EMAIL?.trim() || "seo@leadmaker.agency"
}

/** Claude API (Backlinks top 30 review). Optional: without it the rules pick the top 30. */
export function hasAnthropicKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}
