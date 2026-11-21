/**
 * Pure analysis rules for AI Visibility (docs/plans/ai-visibility/05-analysis.md): tracked-brand
 * matching, merging Haiku's brand list into positions, source types and the robots.txt check.
 * No I/O, so it can be tested with a plain script.
 */

export type TrackedBrand = { id: string; isOwn: boolean; names: string[]; pattern: string | null; domains: string[] }

export type BrandMatch = { brandId: string; firstIndex: number; via: "name" | "domain" }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Lower case, accents stripped, company suffixes and ".com" removed: the key that de-duplicates names. */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/\.(com|net|org|io|co)\b/g, "")
    .replace(/\b(inc|llc|ltd|limited|corp|co|gmbh|plc)\.?$/g, "")
    .replace(/[^\p{L}\p{N}' &+-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

/** First index of a name as a whole word. Names of 2–3 characters must match case. */
export function findName(text: string, name: string): number {
  const n = name.trim()
  if (n.length < 2) return -1
  const flags = n.length <= 3 ? "u" : "iu"
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(n)}(?![\\p{L}\\p{N}])`, flags)
  const m = re.exec(text)
  if (m) return m.index
  // Accent-insensitive retry for longer names.
  if (n.length > 3) {
    const plain = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "")
    const m2 = new RegExp(`(?<![\\p{L}\\p{N}])${escape(plain(n))}(?![\\p{L}\\p{N}])`, "iu").exec(plain(text))
    if (m2) return m2.index
  }
  return -1
}

function safePattern(p: string | null): RegExp | null {
  if (!p) return null
  try {
    return new RegExp(p, "iu")
  } catch {
    return null
  }
}

/** Deterministic tracked-brand matches: names, the optional pattern, or a brand domain in the text or a cited URL. */
export function matchBrands(text: string, citedHosts: string[], brands: TrackedBrand[]): BrandMatch[] {
  const lower = text.toLowerCase()
  const out: BrandMatch[] = []
  for (const b of brands) {
    let best = -1
    let via: BrandMatch["via"] = "name"
    for (const n of b.names) {
      const i = findName(text, n)
      if (i >= 0 && (best < 0 || i < best)) best = i
    }
    const re = safePattern(b.pattern)
    if (re) {
      const m = re.exec(text)
      if (m && (best < 0 || m.index < best)) best = m.index
    }
    if (best < 0) {
      for (const d of b.domains) {
        const i = lower.indexOf(d.toLowerCase())
        if (i >= 0 && (best < 0 || i < best)) {
          best = i
          via = "domain"
        }
      }
    }
    if (best < 0 && b.domains.some((d) => citedHosts.some((h) => h === d || h.endsWith(`.${d}`)))) {
      best = text.length // named only through a cited page: placed last
      via = "domain"
    }
    if (best >= 0) out.push({ brandId: b.id, firstIndex: best, via })
  }
  return out
}

export type MentionRow = { brand_id: string | null; name: string; name_key: string; position: number; sentiment: number | null; quote: string | null }

/**
 * Merge deterministic matches and Haiku's list into ordered mentions. Untracked names must appear
 * in the text (invented names are dropped). Position = order of first appearance; every brand counts.
 */
export function mergeMentions(input: {
  text: string
  matches: BrandMatch[]
  brands: (TrackedBrand & { displayName: string })[]
  extracted: { name: string; tracked_id: string | null; quote: string }[]
  sentiment: { tracked_id: string; score: number }[]
}): MentionRow[] {
  const byId = new Map(input.brands.map((b) => [b.id, b]))
  const rows = new Map<string, { brandId: string | null; name: string; index: number; quote: string | null }>()
  for (const m of input.matches) {
    const b = byId.get(m.brandId)
    if (!b) continue
    rows.set(`id:${b.id}`, { brandId: b.id, name: b.displayName, index: m.firstIndex, quote: null })
  }
  const trackedKeys = new Set(input.brands.flatMap((b) => [nameKey(b.displayName), ...b.names.map(nameKey)]))
  for (const e of input.extracted.slice(0, 40)) {
    const name = e.name.trim().slice(0, 80)
    if (!name) continue
    const tracked = e.tracked_id && byId.has(e.tracked_id) ? e.tracked_id : null
    if (tracked) {
      const row = rows.get(`id:${tracked}`)
      if (row && !row.quote) row.quote = e.quote?.slice(0, 300) || null
      continue // tracked brands come only from the deterministic match
    }
    const key = nameKey(name)
    if (!key || trackedKeys.has(key) || rows.has(`k:${key}`)) continue
    let index = findName(input.text, name)
    if (index < 0) {
      const short = name.replace(/\s*(,?\s*(inc|llc|ltd)\.?|\.com)$/i, "").trim()
      if (short && short !== name) index = findName(input.text, short)
    }
    if (index < 0) continue
    rows.set(`k:${key}`, { brandId: null, name, index, quote: e.quote?.slice(0, 300) || null })
  }
  const sentiment = new Map(input.sentiment.map((s) => [s.tracked_id, Math.max(0, Math.min(100, Math.round(s.score)))]))
  return [...rows.values()]
    .sort((a, b) => a.index - b.index)
    .map((r, i) => ({
      brand_id: r.brandId,
      name: r.name,
      name_key: r.brandId ? `brand:${r.brandId}`.slice(0, 80) : nameKey(r.name),
      position: i + 1,
      sentiment: r.brandId ? (sentiment.get(r.brandId) ?? null) : null,
      quote: r.quote,
    }))
}

// ---------------------------------------------------------------------------
// Source types (rules first; the rest go to Haiku)
// ---------------------------------------------------------------------------

export type DomainType = "corporate" | "editorial" | "reference" | "ugc" | "directory" | "social" | "ecommerce" | "other"

const UGC = /(^|\.)(reddit\.com|quora\.com|youtube\.com|youtu\.be|medium\.com|stackexchange\.com|stackoverflow\.com|substack\.com|github\.com|x\.com|twitter\.com|threads\.net|tripadvisor\.[a-z.]+|trustpilot\.com)$/
const SOCIAL = /(^|\.)(facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|pinterest\.[a-z.]+|nextdoor\.com)$/
const REFERENCE = /(^|\.)(wikipedia\.org|wikimedia\.org|britannica\.com|investopedia\.com|merriam-webster\.com)$|\.(gov|edu|mil)(\.[a-z]{2})?$|\.ac\.[a-z]{2}$/
const ECOMMERCE = /(^|\.)(amazon\.[a-z.]+|ebay\.[a-z.]+|etsy\.com|walmart\.com|target\.com|bestbuy\.com|aliexpress\.com)$/
const DIRECTORY = /(^|\.)(yelp\.[a-z.]+|clutch\.co|g2\.com|capterra\.com|getapp\.com|softwareadvice\.com|trustradius\.com|bbb\.org|angi\.com|homeadvisor\.com|thumbtack\.com|houzz\.com|yellowpages\.com|manta\.com|goodfirms\.co|upcity\.com|designrush\.com|sortlist\.com|themanifest\.com|expertise\.com|bark\.com|glassdoor\.com|crunchbase\.com|producthunt\.com|alternativeto\.net)$/

/** Rule-based type, or null when Haiku should decide. `directoryHosts` = our directories and catalog. */
export function ruleType(domain: string, directoryHosts: Set<string>): DomainType | null {
  const d = domain.toLowerCase()
  if (UGC.test(d)) return "ugc"
  if (SOCIAL.test(d)) return "social"
  if (REFERENCE.test(d)) return "reference"
  if (ECOMMERCE.test(d)) return "ecommerce"
  if (DIRECTORY.test(d) || directoryHosts.has(d)) return "directory"
  return null
}

// ---------------------------------------------------------------------------
// robots.txt: which AI crawlers are blocked at "/"
// ---------------------------------------------------------------------------

export const AI_BOTS = [
  { agent: "OAI-SearchBot", label: "ChatGPT search", search: true },
  { agent: "ChatGPT-User", label: "ChatGPT browsing", search: true },
  { agent: "GPTBot", label: "OpenAI training", search: false },
  { agent: "PerplexityBot", label: "Perplexity", search: true },
  { agent: "Claude-SearchBot", label: "Claude search", search: true },
  { agent: "ClaudeBot", label: "Anthropic training", search: false },
  { agent: "Google-Extended", label: "Gemini (Google AI)", search: false },
  { agent: "Applebot-Extended", label: "Apple AI", search: false },
] as const

/** True for each bot whose robots.txt group disallows the whole site (Allow: / wins). */
export function blockedBots(robots: string): { agent: string; label: string; search: boolean }[] {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = []
  let current: (typeof groups)[number] | null = null
  let lastWasAgent = false
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim()
    if (!line) continue
    const [k, ...rest] = line.split(":")
    const key = k.trim().toLowerCase()
    const value = rest.join(":").trim()
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if ((key === "disallow" || key === "allow") && current) {
      current.rules.push({ allow: key === "allow", path: value })
      lastWasAgent = false
    } else {
      lastWasAgent = false
    }
  }
  const groupFor = (agent: string) =>
    groups.find((g) => g.agents.includes(agent.toLowerCase())) ?? groups.find((g) => g.agents.includes("*"))
  return AI_BOTS.filter((b) => {
    const g = groupFor(b.agent)
    if (!g) return false
    const disallowRoot = g.rules.some((r) => !r.allow && r.path === "/")
    const allowRoot = g.rules.some((r) => r.allow && (r.path === "/" || r.path === ""))
    return disallowRoot && !allowRoot
  }).map((b) => ({ agent: b.agent, label: b.label, search: b.search }))
}
