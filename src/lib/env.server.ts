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

/** The Google service account email clients add to Search Console and GA4. */
export function getGoogleReportingEmail(): string | null {
  return process.env.GOOGLE_REPORTING_EMAIL?.trim() || null
}

/** The email clients invite to their website (WordPress admin, Webflow, Shopify...). */
export function getAgencyAccessEmail(): string {
  return process.env.AGENCY_ACCESS_EMAIL?.trim() || "seo@leadmaker.agency"
}
