import type { DirectoryType, FilterReason } from "./constants"
import type { SiteKey } from "./site-key"

/**
 * What kind of place a search result is, and whether to hide it (pure).
 * Signals come from the host, path, title and snippet; a site already in the library keeps
 * the type the library gives it. Hidden results keep their reason (shown in the Hidden tab).
 */

export type ResultRow = { url: string; title: string | null; desc: string | null }

export type LibraryEntry = { type: DirectoryType; isCore: boolean; blocked: boolean }

export type ClassifyContext = {
  city: string
  /** Full state name and code, lower-case ("arizona", "az"). */
  state: string | null
  stateCode: string | null
  /** Every other state's name and code (for "Peoria IL" vs "Peoria AZ"). */
  otherStates: { name: string; code: string }[]
  clientDomain: string | null
  agencyDomains: Set<string>
  competitorDomains: Set<string>
  /** Service and industry words ("duct cleaning", "hvac"). */
  serviceTerms: string[]
  library: Map<string, LibraryEntry>
  /** Root domains blocked for every client (google.com, youtube.com…). */
  blockedRoots: Set<string>
  /** Local clients only: hide articles with nothing local. National/global clients want articles. */
  local?: boolean
  /** The brief's exclude terms ("free", "jobs"): results mentioning one are hidden. */
  excludeTerms?: string[]
}

export type Classified = {
  type: DirectoryType
  filterReason: FilterReason | null
  isLocal: boolean
}

const SOCIAL = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "nextdoor.com",
  "alignable.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "threads.net",
])
const AGGREGATORS = new Set([
  "foursquare.com",
  "data-axle.com",
  "neustarlocaleze.biz",
  "infogroup.com",
  "factual.com",
])
const KNOWN_DIRECTORIES = new Set([
  "yelp.com",
  "yellowpages.com",
  "superpages.com",
  "manta.com",
  "hotfrog.com",
  "brownbook.net",
  "ezlocal.com",
  "cylex.us.com",
  "merchantcircle.com",
  "chamberofcommerce.com",
  "mapquest.com",
  "citysearch.com",
  "local.com",
  "bbb.org",
  "angi.com",
  "angieslist.com",
  "homeadvisor.com",
  "thumbtack.com",
  "houzz.com",
  "porch.com",
  "bark.com",
  "expertise.com",
  "threebestrated.com",
  "networx.com",
  "buildzoom.com",
  "birdeye.com",
  "showmelocal.com",
  "n49.com",
  "storeboard.com",
  "tupalo.com",
  "find-us-here.com",
  "yellowbot.com",
  "dexknows.com",
  "judysbook.com",
  "kudzu.com",
])

const DIRECTORY_WORDS =
  /\b(director(y|ies)|listings?|yellow ?pages|business(es)? (list|finder|search)|local business(es)?|find (a|local)|add (your )?business|submit (your )?(business|listing|site)|list your business|claim your (business|listing)|members?( directory)?|member businesses|business guide|near me)\b/
const REVIEW_WORDS = /\b(best|top (\d+|rated|ten)|top-rated|reviews?|rated|ratings)\b/
const NEWS_WORDS =
  /\b(news|blog|magazine|times|gazette|herald|journal|tribune|press|daily|weekly|patch|chronicle|observer|courier|post)\b/
const GUEST_WORDS =
  /\b(write for us|guest (post|posting|blog|article)|contribute|submit (a |an )?(guest )?(post|article)|become a contributor)\b/
const PODCAST_WORDS = /\b(podcast|podcasts|episode|episodes|listen on)\b/
const COMMUNITY_WORDS = /\b(forum|forums|community|communities|discussion board|members area|meetup|subreddit)\b/
const SPONSOR_WORDS =
  /\b(sponsor|sponsors|sponsorship|sponsorships|become a sponsor|events? calendar|submit (an |your )?event|community calendar|fundraiser)\b/
const RESOURCE_WORDS = /\b(resources|useful links|helpful links|recommended (tools|sites|links)|resource (page|list|guide))\b/
const MARKETPLACE_WORDS = /\b(marketplace|alternatives? to|software (directory|reviews)|compare .{0,30}(software|tools|apps)|app directory)\b/
/** A business pitching its own service ("we", "our team", "get a free quote"): a competitor. */
const PITCH_WORDS =
  /\b(our (team|services|agency|company|clients|experts)|we (build|design|develop|offer|provide|help|are a)|hire us|contact us today|get a (free )?quote|free consultation|book a (call|consultation))\b/
const ARTICLE_WORDS =
  /\b(how (to|much|do|does)|what (is|are)|why|cost(s)?|price(s)?|tips|guide|diy|vs\.?|ideas|\d{4} prices)\b/

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
const has = (hay: string, needle: string) => needle.length > 1 && ` ${hay} `.includes(` ${needle} `)

export function classify(row: ResultRow, sk: SiteKey, ctx: ClassifyContext): Classified {
  const path = (() => {
    try {
      return new URL(row.url).pathname.toLowerCase()
    } catch {
      return ""
    }
  })()
  const title = words(row.title ?? "")
  const desc = words(row.desc ?? "")
  const hostWords = words(sk.host)
  const text = `${hostWords} ${words(path)} ${title} ${desc}`

  const city = words(ctx.city)
  const citySlug = city.replace(/ /g, "")
  const cityHit = has(text, city) || sk.host.replace(/[^a-z0-9]/g, "").includes(citySlug)
  const stateHit = Boolean(
    (ctx.state && has(text, words(ctx.state))) ||
    (ctx.stateCode &&
      (has(`${hostWords} ${words(path)}`, ctx.stateCode) ||
        new RegExp(`,\\s*${ctx.stateCode}\\b`, "i").test(row.title ?? "") ||
        new RegExp(`,\\s*${ctx.stateCode}\\b`, "i").test(row.desc ?? ""))),
  )
  // Codes only count in a clear form (", IL" or "IL 61602"), never as words ("in", "or", "me").
  const raw = `${row.title ?? ""} ${row.desc ?? ""}`
  const otherState =
    !stateHit &&
    ctx.otherStates.some(
      (s) =>
        has(title, words(s.name)) ||
        new RegExp(`,\\s*${s.code.toUpperCase()}\\b|\\b${s.code.toUpperCase()} \\d{5}\\b`).test(
          raw,
        ) ||
        (!AMBIGUOUS_CODES.has(s.code.toLowerCase()) &&
          new RegExp(`/${s.code.toLowerCase()}(/|$)`).test(path)),
    )
  const isLocal = cityHit && !otherState

  const lib = ctx.library.get(sk.siteKey) ?? ctx.library.get(sk.domain)
  const type = lib?.type ?? typeFrom(sk, text, title, ctx)
  const hide = (reason: FilterReason): Classified => ({ type, filterReason: reason, isLocal })

  if (/\.(pdf|docx?|xlsx?|pptx?)$/.test(path)) return hide("pdf")
  if (
    ctx.excludeTerms?.some((t) => {
      const w = words(t)
      return w.length > 1 && (has(title, w) || has(desc, w))
    })
  )
    return hide("excluded_term")
  if (
    ctx.clientDomain &&
    (sk.domain === ctx.clientDomain ||
      sk.host === ctx.clientDomain ||
      sk.host.endsWith(`.${ctx.clientDomain}`))
  ) {
    return hide("own_site")
  }
  if (ctx.agencyDomains.has(sk.domain)) return hide("agency_client")
  if (lib?.blocked) return hide("blocked")
  if (!lib?.isCore && ctx.blockedRoots.has(sk.domain)) return hide("blocked")
  if (lib) return { type, filterReason: otherState ? "other_state" : null, isLocal }

  if (ctx.competitorDomains.has(sk.domain) || ctx.competitorDomains.has(sk.host))
    return hide("competitor")
  if (otherState) return hide("other_state")
  const directoryish = DIRECTORY_WORDS.test(text) || type !== "other"
  const serviceWord = ctx.serviceTerms.some(
    (t) => has(title, words(t)) || hostWords.replace(/ /g, "").includes(words(t).replace(/ /g, "")),
  )
  if (type === "other" && serviceWord && !DIRECTORY_WORDS.test(text))
    return hide("looks_like_business")
  // A firm that sells the client's own service, writing its own "top companies" list.
  if (serviceWord && PITCH_WORDS.test(`${title} ${desc}`) && !KNOWN_DIRECTORIES.has(sk.domain))
    return hide("competitor")
  if (ctx.local !== false) {
    if ((type === "other" || type === "news_blog") && !isLocal && ARTICLE_WORDS.test(title))
      return hide("not_local_article")
    if (type === "other" && !isLocal && !directoryish) return hide("not_local_article")
  }
  return { type, filterReason: null, isLocal }
}

function typeFrom(sk: SiteKey, text: string, title: string, ctx: ClassifyContext): DirectoryType {
  if (SOCIAL.has(sk.domain)) return "social"
  if (AGGREGATORS.has(sk.domain)) return "aggregator"
  if (/chamber/.test(text)) return "chamber"
  if (/\.gov$|\.(\w\w)\.us$|\.mil$/.test(sk.host) || /\bcity of\b|\bcounty of\b/.test(title)) {
    return DIRECTORY_WORDS.test(text) ? "business_directory" : "government"
  }
  if (GUEST_WORDS.test(text)) return "guest_post"
  if (PODCAST_WORDS.test(text) || /^podcasts?\./.test(sk.host)) return "podcast"
  if (SPONSOR_WORDS.test(text)) return "sponsorship"
  if (MARKETPLACE_WORDS.test(text)) return "marketplace"
  if (COMMUNITY_WORDS.test(text) || /^(forums?|community)\./.test(sk.host)) return "community"
  if (/\b(association|assn|alliance|guild|society|federation|council)\b/.test(text))
    return "association"
  const service = ctx.serviceTerms.some((t) => has(text, words(t)))
  if (KNOWN_DIRECTORIES.has(sk.domain) || DIRECTORY_WORDS.test(text)) {
    return service && !KNOWN_DIRECTORIES.has(sk.domain)
      ? "industry_directory"
      : "business_directory"
  }
  if (REVIEW_WORDS.test(title)) return "review_site"
  if (RESOURCE_WORDS.test(title) || /\/resources?(\/|$)/.test(text)) return "resource_page"
  if (NEWS_WORDS.test(words(sk.host)) || NEWS_WORDS.test(title)) return "news_blog"
  return "other"
}

/** State codes that are also common words or path pieces. */
const AMBIGUOUS_CODES = new Set([
  "in",
  "or",
  "me",
  "ok",
  "hi",
  "oh",
  "de",
  "co",
  "la",
  "ma",
  "pa",
  "al",
  "id",
  "ga",
  "mo",
  "ne",
  "wa",
  "md",
  "va",
  "mt",
  "nd",
  "sd",
])
