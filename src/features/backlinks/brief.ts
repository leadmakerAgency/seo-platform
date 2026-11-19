import { z } from "zod"

/**
 * The backlink strategy brief (docs/plans/backlinks/07-strategy-brief.md): how a client
 * should be found. Pure and shared by the form, the actions, the search plan and scoring.
 * The database checks it again (public.save_backlink_brief, table checks).
 */

export const REACHES = ["local", "national", "global"] as const
export const BUYERS = ["b2b", "b2c"] as const
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

/** Pick one or more of each. Tick two when the client has both kinds of customers. */

export const BUYER_META: Record<Buyer, { label: string; help: string }> = {
  b2b: { label: "Businesses (B2B)", help: "Buyers are companies: review platforms, trade publications, associations, conferences." },
  b2c: { label: "Consumers (B2C)", help: "Buyers are people: review sites, community forums, lifestyle and local blogs." },
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

type Mix = { reach: readonly Reach[]; buyer: readonly Buyer[]; offering: readonly Offering[] }

/** Local customers at all, national/global customers at all, and only local. */
export const hasLocal = (b: Pick<Mix, "reach">) => b.reach.includes("local")
export const hasWide = (b: Pick<Mix, "reach">) => b.reach.some((r) => r !== "local")
export const onlyLocal = (b: Pick<Mix, "reach">) => hasLocal(b) && !hasWide(b)

/** The labels of the ticked values, in the form's order: "Local + National". */
export function mixLabel<T extends string>(values: readonly T[], all: readonly T[], meta: Record<T, { label: string }>) {
  return all.filter((v) => values.includes(v)).map((v) => meta[v].label).join(" + ")
}

/** Site types switched on by default for the ticked reach / buyer / offering (the union). */
export function defaultSiteTypes(mix: Mix): SiteType[] {
  const set = new Set<SiteType>(["review_platforms", "niche_blogs", "associations", "resource_pages"])
  if (hasLocal(mix)) {
    for (const t of ["directories", "local_news", "sponsorships", "communities"] as const) set.add(t)
  }
  if (hasWide(mix)) {
    for (const t of ["guest_posts", "podcasts"] as const) set.add(t)
    if (mix.buyer.includes("b2b")) set.add("sponsorships")
    if (mix.buyer.includes("b2c")) set.add("communities")
  }
  if (mix.offering.some((o) => o !== "services") || hasWide(mix)) set.add("marketplaces")
  return SITE_TYPES.filter((t) => set.has(t))
}

/** Sites buyers often trust when researching, by offering and buyer (ideas, never automatic). */
export function trustedSiteIdeas(mix: Mix): string[] {
  const out: string[] = []
  if (mix.offering.includes("services") && mix.buyer.includes("b2b"))
    out.push("clutch.co", "goodfirms.co", "upcity.com", "designrush.com", "sortlist.com", "themanifest.com")
  if (mix.offering.includes("software"))
    out.push("g2.com", "capterra.com", "getapp.com", "softwareadvice.com", "trustradius.com", "producthunt.com", "alternativeto.net", "saashub.com")
  if (mix.offering.includes("products")) out.push("trustpilot.com", "sitejabber.com")
  if (hasLocal(mix) && mix.buyer.includes("b2c")) out.push("yelp.com", "nextdoor.com", "angi.com", "houzz.com", "thumbtack.com")
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
    reach: z
      .array(z.enum(REACHES))
      .min(1, "Choose where the customers are (one or more).")
      .transform((v) => REACHES.filter((x) => v.includes(x))),
    buyer: z
      .array(z.enum(BUYERS))
      .min(1, "Choose who buys (one or both).")
      .transform((v) => BUYERS.filter((x) => v.includes(x))),
    offering: z
      .array(z.enum(OFFERINGS))
      .min(1, "Choose what the client sells (one or more).")
      .transform((v) => OFFERINGS.filter((x) => v.includes(x))),
    audience: z.string().trim().max(300, "Use 300 characters or fewer."),
    core_topics: z.array(topic).min(1, "Add at least one core topic.").max(5, "5 core topics at most."),
    adjacent_topics: z.array(topic).max(12, "12 adjacent topics at most."),
    trusted_sites: z.array(domain).max(20, "20 sites at most."),
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
  // One value (briefs saved before 0039, old run snapshots) or a list; "both" means b2b + b2c.
  const pick = <T extends string>(v: unknown, all: readonly T[]): T[] => {
    const raw = typeof v === "string" ? (v === "both" ? ["b2b", "b2c"] : [v]) : list(v).flatMap((x) => (x === "both" ? ["b2b", "b2c"] : [x]))
    return all.filter((x) => raw.includes(x))
  }
  const reach = pick(r.reach, REACHES)
  const buyer = pick(r.buyer, BUYERS)
  const offering = pick(r.offering, OFFERINGS)
  if (!reach.length || !buyer.length || !offering.length) return null
  return {
    reach,
    buyer,
    offering,
    audience: typeof r.audience === "string" ? r.audience : "",
    core_topics: list(r.core_topics),
    adjacent_topics: list(r.adjacent_topics),
    trusted_sites: list(r.trusted_sites),
    exclude_terms: list(r.exclude_terms),
    site_types: list(r.site_types).filter((t): t is SiteType => (SITE_TYPES as readonly string[]).includes(t)),
    notes: typeof r.notes === "string" ? r.notes : "",
    version: Number(r.version ?? 1),
  }
}
