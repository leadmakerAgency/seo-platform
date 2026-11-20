import "server-only"

import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

/**
 * Safe page fetcher for Shockwave AI Search (plan §6.5; rules ported from claude-seo's
 * url_safety.py and fetch_page.py, MIT). Free: no AI tokens are spent downloading pages.
 *
 * - http(s) only; DNS is resolved first and private, loopback, link-local, CGNAT and metadata
 *   addresses are refused, again after every redirect (≤ 3).
 * - 8 s per request, 1.5 MB read after decompression, HTML only.
 * - One request per site per second.
 * Note: Node's fetch resolves DNS again when it connects; a host that changes its answer between
 * the check and the request (DNS rebinding) could slip through. Accepted for public-site checks.
 */

export type FetchStatus =
  | "ok"
  | "gone" // 404 / 410
  | "server_error" // 5xx: try later, never "dead"
  | "blocked" // 401 / 403 / 429: the site refused the checker
  | "js_only" // looks like a JavaScript shell; content unconfirmed
  | "unresolvable" // the domain doesn't resolve (often an invented URL)
  | "unsafe" // private address or bad scheme
  | "not_html"
  | "error"

export type PageLink = { url: string; host: string; label: string; rel: string[] }

export type PageSignals = {
  status: FetchStatus
  httpStatus: number | null
  finalUrl: string | null
  error: string | null
  title: string | null
  description: string | null
  lang: string | null
  /** Main text, tags and boilerplate removed, ≤ 14,000 characters. */
  text: string
  words: number
  outbound: { total: number; dofollow: number; nofollow: number; sponsored: number; ugc: number }
  /** A robots nofollow on the page (meta or X-Robots-Tag): every link on it counts as nofollow. */
  pageNofollow: boolean
  /** Links that look like a way in: submit, add listing, join, contact, advertise, suggest… (≤ 12). */
  actionLinks: { url: string; label: string }[]
  hasForm: boolean
  /** Same-site links (for finding the client's About / Services pages), ≤ 80. */
  internalLinks: { url: string; label: string }[]
  /** Hosts this page links out to (no www), ≤ 400; for "is the competitor's link still here". */
  outboundHosts: string[]
}

const TIMEOUT_MS = 8000
const MAX_BYTES = 1_500_000
const MAX_REDIRECTS = 3
const USER_AGENT = "Mozilla/5.0 (compatible; ShockwaveSEO/1.0; +backlink place check)"

const lastHit = new Map<string, number>()

function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function privateV6(ip: string) {
  const v = ip.toLowerCase()
  if (v === "::1" || v === "::") return true
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)
  return mapped ? privateV4(mapped[1]) : false
}

async function safeHost(host: string): Promise<"ok" | "unsafe" | "unresolvable"> {
  const h = host.replace(/^\[|\]$/g, "")
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(h)) return "unsafe"
  const literal = isIP(h)
  if (literal === 4) return privateV4(h) ? "unsafe" : "ok"
  if (literal === 6) return privateV6(h) ? "unsafe" : "ok"
  try {
    const addrs = await lookup(h, { all: true })
    if (!addrs.length) return "unresolvable"
    for (const a of addrs) {
      if (a.family === 4 ? privateV4(a.address) : privateV6(a.address)) return "unsafe"
    }
    return "ok"
  } catch {
    return "unresolvable"
  }
}

async function politeWait(host: string) {
  const last = lastHit.get(host) ?? 0
  const wait = last + 1000 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastHit.set(host, Date.now())
  if (lastHit.size > 2000) lastHit.clear()
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ""
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    chunks.push(value)
    if (size >= MAX_BYTES) {
      await reader.cancel().catch(() => {})
      break
    }
  }
  const buf = new Uint8Array(Math.min(size, MAX_BYTES))
  let offset = 0
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.byteLength - offset)
    buf.set(c.subarray(0, take), offset)
    offset += take
    if (offset >= buf.byteLength) break
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf)
}

const empty = (status: FetchStatus, extra: Partial<PageSignals> = {}): PageSignals => ({
  status,
  httpStatus: null,
  finalUrl: null,
  error: null,
  title: null,
  description: null,
  lang: null,
  text: "",
  words: 0,
  outbound: { total: 0, dofollow: 0, nofollow: 0, sponsored: 0, ugc: 0 },
  pageNofollow: false,
  actionLinks: [],
  hasForm: false,
  internalLinks: [],
  outboundHosts: [],
  ...extra,
})

/** Fetch and read one page. Never throws. */
export async function fetchPage(rawUrl: string): Promise<PageSignals> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return empty("error", { error: "Not a valid web address." })
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return empty("unsafe", { error: "Only http(s) is fetched." })
    const safety = await safeHost(url.hostname)
    if (safety !== "ok") {
      return empty(safety, { error: safety === "unsafe" ? "Private or internal address." : "The domain doesn't resolve." })
    }
    await politeWait(url.hostname)
    let res: Response
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
      })
    } catch (e) {
      return empty("error", { error: e instanceof Error ? e.message.slice(0, 200) : "Request failed." })
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      if (!loc) return empty("error", { httpStatus: res.status, error: "Redirect without a location." })
      try {
        url = new URL(loc, url)
      } catch {
        return empty("error", { httpStatus: res.status, error: "Bad redirect." })
      }
      continue
    }
    const finalUrl = url.toString()
    if (res.status === 404 || res.status === 410) return empty("gone", { httpStatus: res.status, finalUrl })
    if (res.status >= 500) return empty("server_error", { httpStatus: res.status, finalUrl })
    if (res.status === 401 || res.status === 403 || res.status === 429) return empty("blocked", { httpStatus: res.status, finalUrl })
    if (res.status >= 400) return empty("error", { httpStatus: res.status, finalUrl, error: `HTTP ${res.status}` })
    const type = res.headers.get("content-type") ?? ""
    if (type && !/html|xml/i.test(type)) return empty("not_html", { httpStatus: res.status, finalUrl })
    const html = await readCapped(res).catch(() => "")
    const robotsHeader = res.headers.get("x-robots-tag") ?? ""
    return parseHtml(html, url, res.status, /nofollow|none/i.test(robotsHeader))
  }
  return empty("error", { error: "Too many redirects." })
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    const k = e.toLowerCase()
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16) || 32)
    if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10) || 32)
    return ENTITIES[k] ?? m
  })
}

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "") : null
}

const ACTION_WORDS =
  /\b(submit|add (your|a|my)? ?(business|company|listing|site|tool|product|agency)|get listed|list (your|my) (business|company)|claim (your|this)? ?(listing|business|profile)|suggest|nominate|apply|join|become a member|membership|contact|write for us|contribute|advertis|sponsor|partner with|pitch|get featured|request (a )?(review|listing))\b/i

/** Parse HTML without dependencies: title, meta, language, main text and links. */
export function parseHtml(html: string, base: URL, httpStatus: number, headerNofollow = false): PageSignals {
  const head = html.slice(0, 200_000)
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]
  const metaTags = head.match(/<meta\b[^>]*>/gi) ?? []
  const meta = (name: string) =>
    metaTags.map((t) => ((attr(t, "name") ?? attr(t, "property") ?? "").toLowerCase() === name ? attr(t, "content") : null)).find(Boolean) ?? null
  const robots = meta("robots") ?? ""
  const lang = /<html\b[^>]*\blang\s*=\s*["']?([a-zA-Z-]{2,12})/i.exec(head)?.[1]?.toLowerCase() ?? null

  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
  const scripts = (html.match(/<script\b/gi) ?? []).length
  const mainMatch = /<main\b[\s\S]*?<\/main>/i.exec(body)?.[0]
  const textSource = (mainMatch && mainMatch.length > 500 ? mainMatch : body).replace(
    /<(nav|footer)\b[\s\S]*?<\/\1>/gi,
    " ",
  )
  const text = stripTags(textSource).slice(0, 14_000)
  const words = text ? text.split(" ").length : 0

  const siteHost = base.hostname.replace(/^www\./, "")
  const outbound = { total: 0, dofollow: 0, nofollow: 0, sponsored: 0, ugc: 0 }
  const actionLinks: { url: string; label: string }[] = []
  const internalLinks: { url: string; label: string }[] = []
  const seenAction = new Set<string>()
  const outboundHosts = new Set<string>()
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  let count = 0
  while ((m = re.exec(body)) && count < 3000) {
    count++
    const href = attr(m[1], "href")
    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) {
      if (href && /^mailto:/i.test(href) && actionLinks.length < 12 && !seenAction.has(href)) {
        seenAction.add(href)
        actionLinks.push({ url: href.slice(0, 300), label: "Email" })
      }
      continue
    }
    let u: URL
    try {
      u = new URL(href, base)
    } catch {
      continue
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue
    const label = stripTags(m[2]).slice(0, 80) || (attr(m[1], "title") ?? "").slice(0, 80)
    const host = u.hostname.replace(/^www\./, "")
    const internal = host === siteHost || host.endsWith(`.${siteHost}`) || siteHost.endsWith(`.${host}`)
    if (internal) {
      if (internalLinks.length < 80) internalLinks.push({ url: u.toString(), label })
    } else {
      const rel = (attr(m[1], "rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean)
      outbound.total++
      if (outboundHosts.size < 400) outboundHosts.add(host)
      if (rel.includes("sponsored")) outbound.sponsored++
      if (rel.includes("ugc")) outbound.ugc++
      if (rel.includes("nofollow") || rel.includes("sponsored") || rel.includes("ugc")) outbound.nofollow++
      else outbound.dofollow++
    }
    const probe = `${label} ${u.pathname}`
    if (ACTION_WORDS.test(probe) && actionLinks.length < 12 && !seenAction.has(u.toString())) {
      seenAction.add(u.toString())
      actionLinks.push({ url: u.toString().slice(0, 500), label: label || u.pathname.slice(0, 80) })
    }
  }

  const jsShell = words < 60 && scripts >= 3
  return {
    status: jsShell ? "js_only" : "ok",
    httpStatus,
    finalUrl: base.toString(),
    error: null,
    title: title ? stripTags(title).slice(0, 300) : null,
    description: meta("description")?.slice(0, 400) ?? meta("og:description")?.slice(0, 400) ?? null,
    lang,
    text,
    words,
    outbound,
    pageNofollow: headerNofollow || /nofollow|none/i.test(robots),
    actionLinks,
    hasForm: /<form\b/i.test(body),
    internalLinks,
    outboundHosts: [...outboundHosts],
  }
}

/** Run fetches with limited concurrency (politeness per site is inside fetchPage). */
export async function fetchMany<T>(items: T[], urlOf: (t: T) => string, concurrency = 6) {
  const out = new Map<T, PageSignals>()
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++]
        out.set(item, await fetchPage(urlOf(item)))
      }
    }),
  )
  return out
}
