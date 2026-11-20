import {
  costsMoney,
  type CatalogCategory,
  type CatalogKind,
  type CatalogPricing,
  type LinkKind,
} from "./constants"

/**
 * Which catalog sites suit a client (docs/plans/backlinks/09-manual-search.md §3). Pure, run at
 * read time against the strategy brief, the brief's places (their countries) and the business
 * profile, so suggestions follow the brief when it changes.
 */

export type CatalogSite = {
  id: string
  directoryId: string
  kind: CatalogKind
  category: CatalogCategory
  name: string
  host: string
  homeUrl: string | null
  submitUrl: string | null
  countries: string[]
  reach: string[]
  buyer: string[]
  offering: string[]
  industries: string[]
  pricing: CatalogPricing
  priceNote: string | null
  typicalLink: LinkKind
  priority: number
  benefits: string[]
  needs: string[]
  howTo: string | null
  warnings: string | null
  notes: string | null
  verifiedAt: string | null
  verifiedBy: string | null
  problemNote: string | null
  authority: number | null
  authorityStatus: string | null
  spam: number | null
  sort: number
}

export type MatchContext = {
  /** ISO codes: the countries of the brief's places, else the client's country. */
  countries: string[]
  /** From the brief; empty when there's no brief (then they don't filter). */
  reach: string[]
  buyer: string[]
  offering: string[]
  /** Lower-case text: industry, categories, services and topics. */
  words: string
  hasStreet: boolean
  serviceArea: boolean
}

export type Match = {
  site: CatalogSite
  /** Fits every hard filter (country, reach, buyer, offering, industry). */
  fits: boolean
  /** Fits and worth doing first: shown under Suggested. */
  suggested: boolean
  score: number
  reasons: string[]
  warnings: string[]
  /** Why it doesn't fit (only when !fits). */
  misfit: string | null
}

const overlaps = (a: string[], b: string[]) =>
  a.length === 0 || b.length === 0 || a.some((x) => b.includes(x))

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Short keywords ("ai", "bar", "tax") must be whole words; longer ones match a word start ("landscap"). */
export function keywordHit(words: string, keyword: string): boolean {
  const k = keyword.trim().toLowerCase()
  if (!k) return false
  const re =
    k.length <= 3
      ? new RegExp(`(^|[^a-z0-9])${esc(k)}([^a-z0-9]|$)`)
      : new RegExp(`(^|[^a-z0-9])${esc(k)}`)
  return re.test(words)
}

/** The client's own word a keyword matched ("convey" → "conveyancing"), for the reason chip. */
export function matchedWord(words: string, keyword: string): string {
  const k = keyword.trim().toLowerCase()
  const m = new RegExp(`(?:^|[^a-z0-9])(${esc(k)}[a-z0-9-]*)`).exec(words)
  return m?.[1] ?? k
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

export function matchSite(
  site: CatalogSite,
  ctx: MatchContext,
  countryLabel: (code: string) => string,
): Match {
  const reasons: string[] = []
  const warnings: string[] = []
  let misfit: string | null = null

  const countryHit =
    site.countries.length === 0 || site.countries.some((c) => ctx.countries.includes(c))
  if (!countryHit) misfit = `For ${site.countries.map(countryLabel).join(", ")}`
  const reachHit = overlaps(site.reach, ctx.reach)
  if (!misfit && !reachHit)
    misfit = site.reach.includes("local") ? "For local clients" : "For national and global clients"
  const buyerHit = overlaps(site.buyer, ctx.buyer)
  if (!misfit && !buyerHit)
    misfit = site.buyer.includes("b2b") ? "For B2B clients" : "For consumer (B2C) clients"
  const offeringHit = overlaps(site.offering, ctx.offering)
  if (!misfit && !offeringHit) misfit = `For ${site.offering.join(" / ")} clients`
  const hitWord = site.industries.find((k) => keywordHit(ctx.words, k)) ?? null
  if (!misfit && site.industries.length > 0 && !hitWord) misfit = "For another industry"

  const fits = misfit === null
  const countrySpecific = site.countries.length > 0 && countryHit
  const localFit = ctx.reach.includes("local")
  const benefitFit = localFit
    ? site.benefits.some((b) => b === "citation" || b === "reviews")
    : site.benefits.some((b) => b === "ranking" || b === "ai_visibility")

  if (site.priority === 3) reasons.push("Must-have")
  if (countrySpecific)
    reasons.push(
      site.countries
        .filter((c) => ctx.countries.includes(c))
        .map(countryLabel)
        .join(", "),
    )
  if (hitWord) reasons.push(titleCase(matchedWord(ctx.words, hitWord)))
  if (site.reach.length && reachHit && ctx.reach.length)
    reasons.push(site.reach.includes("local") ? "Local" : "National")
  if (site.buyer.length === 1 && buyerHit && ctx.buyer.length)
    reasons.push(site.buyer[0] === "b2b" ? "B2B" : "B2C")
  if (site.offering.length && offeringHit && ctx.offering.length)
    reasons.push(
      titleCase(
        site.offering.filter((o) => ctx.offering.includes(o)).join(" / ") || site.offering[0],
      ),
    )

  if (site.needs.includes("address") && (!ctx.hasStreet || ctx.serviceArea))
    warnings.push(
      ctx.serviceArea
        ? "Needs an address (the client is a service-area business)"
        : "Needs a street address",
    )
  if (site.needs.includes("postcard")) warnings.push("Postcard verification (5–14 days)")
  if (site.needs.includes("reviews")) warnings.push("Needs reviews first")
  if (site.needs.includes("licence")) warnings.push("Needs a licence or membership")
  if (costsMoney(site.pricing)) warnings.push(site.priceNote ?? "Costs money")

  const score =
    site.priority * 40 +
    (hitWord ? 20 : 0) +
    (countrySpecific ? 15 : 0) +
    (benefitFit ? 15 : 0) +
    ((site.authority ?? 0) >= 60 ? 10 : 0)

  const suggested = fits && (site.priority >= 2 || Boolean(hitWord) || countrySpecific)
  return {
    site,
    fits,
    suggested,
    score,
    reasons: [...new Set(reasons.filter(Boolean))],
    warnings,
    misfit,
  }
}

/** Every active catalog site, matched and ordered best first. */
export function matchCatalog(
  sites: CatalogSite[],
  ctx: MatchContext,
  countryLabel: (code: string) => string,
): Match[] {
  return sites
    .map((s) => matchSite(s, ctx, countryLabel))
    .sort(
      (a, b) => Number(b.fits) - Number(a.fits) || b.score - a.score || a.site.sort - b.site.sort,
    )
}
