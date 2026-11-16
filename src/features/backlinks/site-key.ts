import { domainToUnicode } from "node:url"

/**
 * Where a search result can be applied to, as a stable key (pure; docs/plans/backlinks).
 *
 * - `domain`: the registrable domain ("yelp.com", "peoria.az.us"), used for blocking.
 * - `siteKey`: the place itself. Usually that domain; for hosted platforms where every
 *   customer has its own subdomain (ChamberMaster, Wix, Blogspot…) the tenant host (which is
 *   then also its `domain`); for sites that put each city under a path
 *   (patch.com/arizona/peoria) the domain + that path.
 * - `rankTarget`: what site strength is checked on: the domain (tenant host for platforms).
 */

export type SiteKey = { siteKey: string; domain: string; host: string; rankTarget: string }

/** Two-part public suffixes we meet (a small, US-first list instead of the whole PSL). */
const SECOND_LEVEL = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "ltd.uk",
  "plc.uk",
  "me.uk",
  "net.uk",
  "sch.uk",
  "com.au",
  "net.au",
  "org.au",
  "gov.au",
  "edu.au",
  "asn.au",
  "id.au",
  "co.nz",
  "org.nz",
  "net.nz",
  "govt.nz",
  "ac.nz",
  "co.za",
  "org.za",
  "gov.za",
  "co.in",
  "org.in",
  "gov.in",
  "net.in",
  "com.mx",
  "org.mx",
  "gob.mx",
  "com.br",
  "org.br",
  "gov.br",
  "com.ar",
  "com.co",
  "com.sg",
  "com.my",
  "com.ph",
  "co.jp",
  "co.kr",
  "com.cn",
  "com.hk",
  "com.tw",
  "co.il",
  "com.tr",
  "us.com",
  "uk.com",
  "eu.com",
])

/** Hosted platforms: every subdomain is its own site (and its own strength). */
const PLATFORMS = new Set([
  "blogspot.com",
  "wordpress.com",
  "wixsite.com",
  "weebly.com",
  "squarespace.com",
  "business.site",
  "godaddysites.com",
  "square.site",
  "webflow.io",
  "carrd.co",
  "github.io",
  "netlify.app",
  "vercel.app",
  "chambermaster.com",
  "growthzoneapp.com",
  "site123.me",
  "jimdosite.com",
  "strikingly.com",
  "mystrikingly.com",
  "yolasite.com",
  "webs.com",
])

/** Hosts that put each city under a path: keep the first N path segments in the key. */
const PATH_PLATFORMS: Record<string, number> = {
  "patch.com": 2, // patch.com/arizona/peoria
  "alignable.com": 1, // alignable.com/peoria-az
  "nextdoor.com": 0,
}

const US_STATE_CODES = new Set([
  "al",
  "ak",
  "az",
  "ar",
  "ca",
  "co",
  "ct",
  "de",
  "dc",
  "fl",
  "ga",
  "hi",
  "id",
  "il",
  "in",
  "ia",
  "ks",
  "ky",
  "la",
  "me",
  "md",
  "ma",
  "mi",
  "mn",
  "ms",
  "mo",
  "mt",
  "ne",
  "nv",
  "nh",
  "nj",
  "nm",
  "ny",
  "nc",
  "nd",
  "oh",
  "ok",
  "or",
  "pa",
  "ri",
  "sc",
  "sd",
  "tn",
  "tx",
  "ut",
  "vt",
  "va",
  "wa",
  "wv",
  "wi",
  "wy",
])

/** Registrable domain of a host ("peoria.chambermaster.com" stays whole, "a.b.yelp.com" → yelp.com). */
export function registrableDomain(host: string): string {
  const parts = host.split(".").filter(Boolean)
  if (parts.length <= 2) return parts.join(".")
  const last2 = parts.slice(-2).join(".")
  // Locality .us domains: ci.peoria.az.us → peoria.az.us
  if (parts.at(-1) === "us" && US_STATE_CODES.has(parts.at(-2)!)) return parts.slice(-3).join(".")
  if (SECOND_LEVEL.has(last2) || PLATFORMS.has(last2)) return parts.slice(-3).join(".")
  return last2
}

const STRIP = /^(www\d?|m|mobile|amp)\./

/** Null for anything that isn't an http(s) URL with a real host. */
export function siteKeyOf(rawUrl: string): SiteKey | null {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  let host = url.hostname.toLowerCase().replace(/\.$/, "")
  while (STRIP.test(host)) host = host.replace(STRIP, "")
  if (!host.includes(".") || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return null

  const domain = registrableDomain(host)
  // A platform tenant (peoria.chambermaster.com) is already its own `domain`; any other
  // subdomain (biz.yelp.com, business.peoriachamber.com) is the same site as its domain.
  let siteKey = domain
  const pathDepth = PATH_PLATFORMS[domain]
  if (pathDepth !== undefined) {
    const segments = url.pathname
      .split("/")
      .map((s) => safeDecode(s).toLowerCase().trim())
      .filter((s) => s && /^[a-z0-9-]+$/.test(s))
      .slice(0, pathDepth)
    if (segments.length === pathDepth && pathDepth > 0) siteKey = `${domain}/${segments.join("/")}`
  }
  return { siteKey, domain, host, rankTarget: domain }
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** "xn--caf-dma.com" → "café.com" for display. */
export function displayHost(key: string): string {
  const [host, ...rest] = key.split("/")
  const shown =
    host.startsWith("xn--") || host.includes(".xn--") ? domainToUnicode(host) || host : host
  return [shown, ...rest].join("/")
}
