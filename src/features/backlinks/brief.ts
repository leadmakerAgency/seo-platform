import { z } from "zod"

/**
 * The backlink strategy brief (docs/plans/backlinks/07-strategy-brief.md): how a client
 * should be found. Pure and shared by the form, the actions, the search plan and scoring.
 * The database checks it again (public.save_backlink_brief, table checks).
 */

export const REACHES = ["local", "national", "global"] as const
export const BUYERS = ["b2b", "b2c", "both"] as const
export const OFFERINGS = ["services", "software", "products"] as const
export const SITE_TYPES = [
  "directories",
  "review_platforms",
  "marketplaces",
  "niche_blogs",
  "guest_posts",
  "local_news",
  "podcasts",
  "associations",
  "communities",
  "sponsorships",
  "resource_pages",
] as const

export type Reach = (typeof REACHES)[number]
export type Buyer = (typeof BUYERS)[number]
export type Offering = (typeof OFFERINGS)[number]
export type SiteType = (typeof SITE_TYPES)[number]

export const REACH_META: Record<Reach, { label: string; help: string }> = {
  local: {
    label: "Local",
    help: "Customers come from one city or area. Local directories, chambers, local news and community sites.",
  },
  national: {
    label: "National",
    help: "Customers across one country. Industry review sites, marketplaces, niche blogs and podcasts; no local directories.",
  },
  global: {
    label: "Global",
    help: "Customers in several countries. Like national, searched from each country you add.",
  },
}

export const BUYER_META: Record<Buyer, { label: string; help: string }> = {
  b2b: { label: "Businesses (B2B)", help: "Buyers are companies: review platforms, trade publications, associations, conferences." },
  b2c: { label: "Consumers (B2C)", help: "Buyers are people: review sites, community forums, lifestyle and local blogs." },
  both: { label: "Both", help: "Sells to businesses and to people." },
}

export const OFFERING_META: Record<Offering, { label: string; help: string }> = {
  services: { label: "Services", help: "Done for the customer (a contractor, an agency, a clinic)." },
  software: { label: "Software", help: "An app or SaaS: software marketplaces and comparison sites matter." },
  products: { label: "Products", help: "Physical or digital goods: product reviews, gift guides, shopping sites." },
}

export const SITE_TYPE_LABELS: Record<SiteType, string> = {
  directories: "Directories",
  review_platforms: "Review platforms and best-of lists",
  marketplaces: "Marketplaces",
  niche_blogs: "Niche blogs and publications",
  guest_posts: "Guest posts",
  local_news: "Local news",
  podcasts: "Podcasts",
  associations: "Associations",
  communities: "Forums and communities",
  sponsorships: "Sponsorships and events",
  resource_pages: "Resource pages",
}

/** Site types switched on by default for a reach / buyer / offering. */
export function defaultSiteTypes(reach: Reach, buyer: Buyer, offering: Offering): SiteType[] {
  const set = new Set<SiteType>(["review_platforms", "niche_blogs", "associations", "resource_pages"])
  if (reach === "local") {
    for (const t of ["directories", "local_news", "sponsorships", "communities"] as const) set.add(t)
  } else {
    for (const t of ["guest_posts", "podcasts"] as const) set.add(t)
    if (buyer !== "b2c") set.add("sponsorships")
    if (buyer !== "b2b") set.add("communities")
  }
  if (offering !== "services" || reach !== "local") set.add("marketplaces")
  return SITE_TYPES.filter((t) => set.has(t))
}

/** Sites buyers often trust when researching, by offering and buyer (ideas, never automatic). */
export function trustedSiteIdeas(reach: Reach, buyer: Buyer, offering: Offering): string[] {
  const out: string[] = []
  if (offering === "services" && buyer !== "b2c")
    out.push("clutch.co", "goodfirms.co", "upcity.com", "designrush.com", "sortlist.com", "themanifest.com")
  if (offering === "software")
    out.push("g2.com", "capterra.com", "getapp.com", "softwareadvice.com", "trustradius.com", "producthunt.com", "alternativeto.net", "saashub.com")
  if (offering === "products") out.push("trustpilot.com", "sitejabber.com")
  if (reach === "local" && buyer !== "b2b") out.push("yelp.com", "nextdoor.com", "angi.com", "houzz.com", "thumbtack.com")
  return [...new Set(out)]
}

const topic = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Use at least 2 characters.")
  .max(60, "Keep each topic under 60 characters.")
  .refine((v) => !/[:{}"]/.test(v), "Use words only (no : { } or quotes).")

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, ""))
  .refine((v) => /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(v), "Use a web address like clutch.co.")

export const briefSchema = z
  .object({
    reach: z.enum(REACHES, { error: "Choose where the customers are." }),
    buyer: z.enum(BUYERS, { error: "Choose who buys." }),
    offering: z.enum(OFFERINGS, { error: "Choose what the client sells." }),
    audience: z.string().trim().max(300, "Use 300 characters or fewer."),
    core_topics: z.array(topic).min(1, "Add at least one core topic.").max(5, "5 core topics at most."),
    adjacent_topics: z.array(topic).max(12, "12 adjacent topics at most."),
    trusted_sites: z.array(domain).max(20, "20 sites at most."),
    competitors: z.array(domain).max(20, "20 competitors at most."),
    exclude_terms: z.array(topic).max(30, "30 terms at most."),
    site_types: z.array(z.enum(SITE_TYPES)).min(1, "Pick at least one kind of site."),
    notes: z.string().trim().max(1000, "Use 1,000 characters or fewer."),
  })

export type BriefInput = z.input<typeof briefSchema>
export type Brief = z.output<typeof briefSchema>

/** A saved brief as the search job and the page read it (from the run snapshot or the table). */
export type BriefSnapshot = Brief & { version: number }

export const topicCount = (b: Pick<Brief, "core_topics" | "adjacent_topics">) =>
  b.core_topics.length + b.adjacent_topics.length

export function snapshotOf(row: unknown): BriefSnapshot | null {
  if (!row || typeof row !== "object") return null
  const r = row as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])
  if (!REACHES.includes(r.reach as Reach) || !BUYERS.includes(r.buyer as Buyer) || !OFFERINGS.includes(r.offering as Offering))
    return null
  return {
    reach: r.reach as Reach,
    buyer: r.buyer as Buyer,
    offering: r.offering as Offering,
    audience: typeof r.audience === "string" ? r.audience : "",
    core_topics: list(r.core_topics),
    adjacent_topics: list(r.adjacent_topics),
    trusted_sites: list(r.trusted_sites),
    competitors: list(r.competitors),
    exclude_terms: list(r.exclude_terms),
    site_types: list(r.site_types).filter((t): t is SiteType => (SITE_TYPES as readonly string[]).includes(t)),
    notes: typeof r.notes === "string" ? r.notes : "",
    version: Number(r.version ?? 1),
  }
}
