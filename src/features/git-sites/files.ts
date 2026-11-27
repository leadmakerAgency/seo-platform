import { safeRepoPath } from "./config"

/**
 * File names, dates and URLs for Git sites (docs/plans/git-cms/04-discovery-and-mapping.md). Pure.
 * Everything uses UTC: static sites hide "future-dated" posts at build time, so a date written in a
 * zone ahead of UTC (Sydney) could hide a post that's due now.
 */

const pad = (n: number, w = 2) => String(n).padStart(w, "0")

/** Like Decap's slugify: lower case, a–z 0–9 and single dashes. */
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200)
}

/**
 * Renders a collection `slug` template: {{slug}}, {{title}}, {{year}}, {{month}}, {{day}},
 * {{hour}}, {{minute}}, {{second}}, {{fields.<name>}} (and the {{fields.slug}} alias). Unknown
 * placeholders become empty. The result is one safe path segment.
 */
export function renderSlugTemplate(
  template: string,
  v: { slug: string; title: string; date: Date; fields?: Record<string, unknown> },
): string {
  const d = v.date
  const values: Record<string, string> = {
    slug: v.slug,
    title: slugify(v.title),
    year: String(d.getUTCFullYear()),
    month: pad(d.getUTCMonth() + 1),
    day: pad(d.getUTCDate()),
    hour: pad(d.getUTCHours()),
    minute: pad(d.getUTCMinutes()),
    second: pad(d.getUTCSeconds()),
  }
  const out = template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    if (key.startsWith("fields.")) {
      const name = key.slice(7)
      if (name === "slug") return v.slug
      const f = v.fields?.[name]
      return typeof f === "string" || typeof f === "number" ? slugify(String(f)) : ""
    }
    return values[key] ?? ""
  })
  const clean = out
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
  return clean || v.slug
}

/** `content/posts/my-post.md`, or null when the folder is unsafe. */
export function postPath(folder: string, name: string, extension = "md"): string | null {
  const f = safeRepoPath(folder)
  if (f === null || !/^[A-Za-z0-9._-]{1,200}$/.test(name)) return null
  return `${f ? `${f}/` : ""}${name}.${extension}`
}

/** `content/posts/my-post.md` → `content/posts/my-post-2.md`. */
export function withSuffix(path: string, n: number): string {
  if (n <= 1) return path
  const dot = path.lastIndexOf(".")
  const slash = path.lastIndexOf("/")
  return dot > slash ? `${path.slice(0, dot)}-${n}${path.slice(dot)}` : `${path}-${n}`
}

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGES = 20

/** The file extension for an image, from its MIME type or its name; null for other files. */
export function imageExtension(mime: string | null, name?: string | null): string | null {
  const m = mime?.toLowerCase().split(";")[0].trim()
  if (m && IMAGE_TYPES[m]) return IMAGE_TYPES[m]
  const ext = name?.toLowerCase().match(/\.(png|jpe?g|webp|gif|avif)(?:$|\?)/)?.[1]
  return ext ? (ext === "jpeg" ? "jpg" : ext) : null
}

/** `content/media/my-post.png`, `content/media/my-post-2.jpg` (n ≥ 1; 1 = no number). */
export function mediaPath(mediaFolder: string, slug: string, n: number, ext: string): string | null {
  const f = safeRepoPath(mediaFolder)
  if (f === null) return null
  const name = n <= 1 ? `${slug}.${ext}` : `${slug}-${n}.${ext}`
  return `${f ? `${f}/` : ""}${name}`
}

/** The URL the site serves a media file at: `/media` + `my-post.png` → `/media/my-post.png`. */
export function publicUrl(publicFolder: string | null, fileName: string): string {
  const base = (publicFolder ?? "").replace(/\/+$/, "")
  return `${base}/${fileName}`
}

/**
 * A date in a moment-style storage format (YYYY, MM, DD, HH, mm, ss, plus literal text), in UTC.
 * With no format: ISO 8601 (`2026-11-27T09:00:00.000Z`).
 */
export function formatDate(d: Date, format?: string | null): string {
  if (!format) return d.toISOString()
  const tokens: Record<string, string> = {
    YYYY: String(d.getUTCFullYear()),
    MM: pad(d.getUTCMonth() + 1),
    DD: pad(d.getUTCDate()),
    HH: pad(d.getUTCHours()),
    mm: pad(d.getUTCMinutes()),
    ss: pad(d.getUTCSeconds()),
    SSS: pad(d.getUTCMilliseconds(), 3),
    Z: "+00:00",
  }
  return format.replace(/\[([^\]]*)\]|YYYY|SSS|MM|DD|HH|mm|ss|Z/g, (m, literal: string | undefined) =>
    literal !== undefined ? literal : (tokens[m] ?? m),
  )
}

/**
 * The live address of a post: site + pattern with {slug}, {year}, {month}, {day}.
 * Patterns look like `/blog/{slug}/`. Returns null when either part is missing or odd.
 */
export function liveUrl(siteUrl: string | null, pattern: string | null, v: { slug: string; date: Date }): string | null {
  if (!siteUrl || !pattern || !/^https?:\/\/[^/\s]+$/.test(siteUrl) || !pattern.startsWith("/")) return null
  const path = pattern
    .replace(/\{slug\}/g, v.slug)
    .replace(/\{year\}/g, String(v.date.getUTCFullYear()))
    .replace(/\{month\}/g, pad(v.date.getUTCMonth() + 1))
    .replace(/\{day\}/g, pad(v.date.getUTCDate()))
  if (/[{}\s]/.test(path)) return null
  return `${siteUrl}${path}`
}

/**
 * Safe to fetch from our server: https, a real domain name (no IP addresses, localhost or
 * internal names). Used before checking that a post is live.
 */
export function isPublicSiteUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  const host = u.hostname.toLowerCase()
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,63}$/.test(host)) return false // also rejects IPv4/IPv6
  return !/(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|example)$/.test(host)
}

/** An existing post's permalink (`/blog/my-post/`) → the pattern `/blog/{slug}/`, or null. */
export function patternFromPermalink(permalink: unknown, slug: unknown): string | null {
  if (typeof permalink !== "string" || typeof slug !== "string" || !slug) return null
  const p = permalink.trim()
  if (!p.startsWith("/") || !p.includes(slug)) return null
  const pattern = p.replace(slug, "{slug}")
  return /^\/[A-Za-z0-9/_{}.-]*$/.test(pattern) ? pattern : null
}

/** A Decap `preview_path` (`blog/{{slug}}`, `{{year}}/{{slug}}`) → our URL pattern. */
export function patternFromPreviewPath(previewPath: string | null): string | null {
  if (!previewPath) return null
  const p = previewPath
    .trim()
    .replace(/\{\{\s*(?:fields\.)?slug\s*\}\}/g, "{slug}")
    .replace(/\{\{\s*year\s*\}\}/g, "{year}")
    .replace(/\{\{\s*month\s*\}\}/g, "{month}")
    .replace(/\{\{\s*day\s*\}\}/g, "{day}")
  if (/\{\{/.test(p) || !p.includes("{slug}")) return null
  const withSlash = p.startsWith("/") ? p : `/${p}`
  return /\.[a-z0-9]+$/i.test(withSlash) || withSlash.endsWith("/") ? withSlash : `${withSlash}/`
}
