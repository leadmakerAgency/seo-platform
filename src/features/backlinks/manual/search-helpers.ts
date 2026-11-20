/**
 * Search helper links for VAs (docs/plans/backlinks/09-manual-search.md D9). They open Google in
 * the VA's own browser, so search operators are fine HERE (they cost nothing). Never move these
 * into backlink_footprints: DataForSEO charges 5x per operator. Pure.
 */

export type HelperLink = { label: string; href: string }
export type HelperGroup = { title: string; note: string; links: HelperLink[] }

const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`
const quote = (s: string) => `"${s.replace(/"/g, "")}"`

export function searchHelpers(input: {
  topics: string[]
  services: string[]
  places: string[]
  competitors: string[]
  clientName: string
  /** The client's own host, left out of the mention search. */
  clientHost: string | null
  local: boolean
}): HelperGroup[] {
  const topics = [...new Set(input.topics.map((t) => t.trim()).filter(Boolean))].slice(0, 4)
  const services = [...new Set(input.services.map((t) => t.trim()).filter(Boolean))].slice(0, 3)
  const places = [...new Set(input.places.map((t) => t.trim()).filter(Boolean))].slice(0, 3)
  const subjects = topics.length ? topics : services
  const groups: HelperGroup[] = []

  if (subjects.length) {
    groups.push({
      title: "Guest posts and contributors",
      note: "Real sites in the client's topics that take articles.",
      links: subjects.flatMap((t) => [
        { label: `${t}: "write for us"`, href: google(`${quote(t)} "write for us"`) },
        { label: `${t}: "guest post"`, href: google(`${quote(t)} intitle:"guest post"`) },
      ]),
    })
    groups.push({
      title: "Resource pages",
      note: "Pages that list useful links; ask to be added.",
      links: subjects.map((t) => ({
        label: `${t} resources`,
        href: google(`${quote(t)} intitle:resources OR inurl:resources`),
      })),
    })
  }
  if (input.local && places.length) {
    const svc = services[0] ?? subjects[0]
    groups.push({
      title: "Local lists and directories",
      note: "Best-of lists, local directories and chambers in the client's places.",
      links: places.flatMap((p) => [
        ...(svc ? [{ label: `best ${svc} ${p}`, href: google(`best ${svc} ${p}`) }] : []),
        {
          label: `${p}: "add your business"`,
          href: google(`${quote(p)} "add your business" OR "submit your business"`),
        },
        { label: `${p} chamber of commerce`, href: google(`${p} chamber of commerce`) },
        {
          label: `${p} business directory (.gov)`,
          href: google(`${p} business directory site:.gov`),
        },
      ]),
    })
  }
  if (input.clientName.trim()) {
    const own = input.clientHost ? ` -site:${input.clientHost}` : ""
    groups.push({
      title: "Mentions without a link",
      note: "Sites that already name the client; ask them to link.",
      links: [
        {
          label: `"${input.clientName}" on other sites`,
          href: google(`${quote(input.clientName)}${own}`),
        },
      ],
    })
  }
  const comps = [
    ...new Set(input.competitors.map((c) => c.trim().toLowerCase()).filter(Boolean)),
  ].slice(0, 5)
  if (comps.length) {
    groups.push({
      title: "Competitors' backlinks",
      note: "Ahrefs' free checker shows a competitor's top links; get listed where they are.",
      links: comps.map((c) => ({
        label: c,
        href: `https://ahrefs.com/backlink-checker/?input=${encodeURIComponent(c)}&mode=subdomains`,
      })),
    })
  }
  return groups
}

/** The VA toolkit (10-manual-catalog.md). */
export const TOOLKIT: { name: string; href: string; cost: string; use: string }[] = [
  {
    name: "Ahrefs free backlink checker",
    href: "https://ahrefs.com/backlink-checker",
    cost: "Free",
    use: "Where competitors get links",
  },
  {
    name: "Moz Link Explorer",
    href: "https://moz.com/link-explorer",
    cost: "Freemium",
    use: "Competitors' links, spam score",
  },
  { name: "Semrush", href: "https://www.semrush.com/", cost: "Freemium", use: "Backlink gap" },
  {
    name: "Ubersuggest",
    href: "https://neilpatel.com/ubersuggest/",
    cost: "Freemium",
    use: "Cheap backlink look-ups",
  },
  {
    name: "Google Alerts",
    href: "https://www.google.com/alerts",
    cost: "Free",
    use: "Unlinked brand mentions",
  },
  {
    name: "Hunter.io",
    href: "https://hunter.io/",
    cost: "Freemium",
    use: "Find an editor's email",
  },
  {
    name: "Whitespark Citation Finder",
    href: "https://whitespark.ca/local-citation-finder/",
    cost: "Paid",
    use: "Citations competitors have",
  },
]
