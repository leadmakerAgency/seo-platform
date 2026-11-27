import { parse } from "yaml"

/**
 * Reads a Sveltia / Decap (Netlify) CMS config (docs/plans/git-cms/04-discovery-and-mapping.md).
 * Pure. Everything read from a repo is untrusted: it only fills the Set up site form, and every
 * path is checked to stay inside the repo.
 */

/** Where CMS configs usually live, tried in this order. */
export const CONFIG_PATHS = [
  "admin/config.yml",
  "admin/config.yaml",
  "public/admin/config.yml",
  "public/admin/config.yaml",
  "static/admin/config.yml",
  "static/admin/config.yaml",
  "src/admin/config.yml",
  "site/admin/config.yml",
  "app/admin/config.yml",
] as const

export const MAX_CONFIG_BYTES = 1_000_000

export type CmsField = {
  name: string
  label: string
  widget: string
  required: boolean
  default?: unknown
  /** Storage format (moment tokens) for date / datetime widgets. */
  format?: string
  timeFormat?: string | boolean
  hidden?: boolean
}

export type CmsCollection = {
  name: string
  label: string
  folder: string
  extension: string
  format: string
  slug: string
  previewPath: string | null
  mediaFolder: string | null
  publicFolder: string | null
  fields: CmsField[]
  hasBody: boolean
  supported: boolean
  reason: string | null
}

export type CmsConfig = {
  backend: { name: string; repo: string | null; branch: string | null }
  mediaFolder: string | null
  publicFolder: string | null
  collections: CmsCollection[]
  warnings: string[]
}

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {})
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)

/**
 * A repo-relative path ("content/posts"), or null when it's unsafe or odd: no "..", no
 * absolute or Windows paths, normal characters only. A leading "/" is dropped (Decap allows it).
 */
export function safeRepoPath(p: unknown): string | null {
  if (typeof p !== "string") return null
  const s = p.trim().replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/")
  if (!s) return ""
  if (s.length > 200 || !/^[A-Za-z0-9._@ /-]+$/.test(s)) return null
  if (s.split("/").some((seg) => seg === ".." || seg === ".")) return null
  return s
}

/** A public URL prefix ("/media"), or null when unsafe. "" means the site root. */
export function safePublicPath(p: unknown): string | null {
  if (typeof p !== "string") return null
  const s = p.trim().replace(/\/+$/, "")
  if (!s) return ""
  if (s.length > 200 || /\.\.|\s|[<>"'\\]/.test(s)) return null
  if (/^https?:\/\//i.test(s)) return s
  return s.startsWith("/") ? s : `/${s}`
}

function readField(v: unknown): CmsField | null {
  const f = rec(v)
  const name = str(f.name)
  if (!name) return null
  return {
    name,
    label: str(f.label) ?? name,
    widget: str(f.widget) ?? "string",
    required: f.required !== false,
    ...(f.default !== undefined ? { default: f.default } : {}),
    ...(str(f.format) ? { format: str(f.format)! } : {}),
    ...(f.time_format !== undefined ? { timeFormat: f.time_format as string | boolean } : {}),
    ...(f.widget === "hidden" ? { hidden: true } : {}),
  }
}

/**
 * Collection-level media folder (Decap rules): a value starting with "/" is from the repo root;
 * otherwise it's relative to the collection folder ("" = next to the posts).
 */
function collectionMedia(folder: string, media: unknown, pub: unknown): { media: string | null; pub: string | null } {
  if (typeof media !== "string") return { media: null, pub: null }
  const raw = media.trim()
  const fromRoot = raw.startsWith("/")
  const rel = safeRepoPath(raw)
  if (rel === null) return { media: null, pub: null }
  const mediaPath = fromRoot ? rel : rel === "" ? folder : `${folder}/${rel.replace(/^\.\//, "")}`
  const p = typeof pub === "string" ? safePublicPath(pub) : fromRoot ? safePublicPath(`/${rel}`) : safePublicPath(rel)
  return { media: safeRepoPath(mediaPath), pub: p }
}

function readCollection(v: unknown, globalMedia: string | null, globalPublic: string | null): CmsCollection | null {
  const c = rec(v)
  const name = str(c.name)
  if (!name) return null
  const label = str(c.label) ?? name
  const fields = (Array.isArray(c.fields) ? c.fields : []).map(readField).filter((x): x is CmsField => x !== null)
  const folderRaw = c.folder
  const folder = safeRepoPath(folderRaw)
  const extension = str(c.extension)?.toLowerCase() ?? "md"
  const format = str(c.format)?.toLowerCase() ?? "frontmatter"
  const path = str(c.path)
  const base: CmsCollection = {
    name,
    label,
    folder: folder ?? "",
    extension,
    format,
    slug: str(c.slug) ?? "{{slug}}",
    previewPath: str(c.preview_path),
    mediaFolder: globalMedia,
    publicFolder: globalPublic,
    fields,
    hasBody: fields.some((f) => f.name === "body"),
    supported: true,
    reason: null,
  }
  const no = (reason: string): CmsCollection => ({ ...base, supported: false, reason })

  if (folderRaw === undefined) return no("A file collection (fixed pages), not a folder of posts.")
  if (folder === null || folder === "") return no("Its folder path isn't one we can use.")
  if (c.i18n !== undefined && c.i18n !== false) return no("Multi-language collections aren't supported yet.")
  if (c.nested !== undefined) return no("Nested collections aren't supported yet.")
  if (path && path.includes("/")) return no("Posts in subfolders (the `path` option) aren't supported yet.")
  if (!["md", "markdown"].includes(extension)) return no(`.${extension} files aren't supported yet (Markdown only).`)
  if (!["frontmatter", "yaml-frontmatter", "yml", "yaml"].includes(format)) {
    return no("Only Markdown with YAML front matter is supported for now.")
  }
  if (c.create === false) return no("The CMS doesn't allow new posts in this collection (create: false).")

  const media = collectionMedia(folder, c.media_folder, c.public_folder)
  return {
    ...base,
    mediaFolder: media.media ?? globalMedia,
    publicFolder: media.media ? media.pub : globalPublic,
    reason: base.hasBody ? null : "No `body` field: the article text goes below the front matter anyway.",
  }
}

/** Parses the config. `repo` ("owner/name") is the connected repo, to warn about a mismatch. */
export function parseCmsConfig(text: string, repo?: string): CmsConfig | { error: string } {
  if (text.length > MAX_CONFIG_BYTES) return { error: "The CMS config is too large to read." }
  let doc: unknown
  try {
    doc = parse(text, { maxAliasCount: 50, prettyErrors: false, strict: false, uniqueKeys: false })
  } catch {
    return { error: "The CMS config isn't valid YAML." }
  }
  const root = rec(doc)
  const backend = rec(root.backend)
  const name = str(backend.name) ?? ""
  const warnings: string[] = []
  if (!name) return { error: "The CMS config has no backend." }
  if (name !== "github") {
    return { error: `This CMS stores posts with "${name}". Only GitHub is supported for now.` }
  }
  const cfgRepo = str(backend.repo)
  if (repo && cfgRepo && cfgRepo.toLowerCase() !== repo.toLowerCase()) {
    warnings.push(`The CMS config points at ${cfgRepo}, not ${repo}.`)
  }
  const media = safeRepoPath(root.media_folder)
  const pub = root.public_folder !== undefined ? safePublicPath(root.public_folder) : media ? `/${media}` : null
  if (root.media_folder !== undefined && media === null) warnings.push("The media folder path isn't one we can use.")
  const collections = (Array.isArray(root.collections) ? root.collections : [])
    .map((c) => readCollection(c, media || null, pub))
    .filter((c): c is CmsCollection => c !== null)
    .slice(0, 50)
  if (!collections.length) return { error: "The CMS config has no collections." }
  return {
    backend: { name, repo: cfgRepo, branch: str(backend.branch) },
    mediaFolder: media || null,
    publicFolder: pub,
    collections,
    warnings,
  }
}

/** `<link href="config.yml" type="text/yaml" rel="cms-config-url">` in admin/index.html. */
export function configLinkFromIndexHtml(html: string, indexPath = "admin/index.html"): string | null {
  const tag = /<link\b[^>]*rel=["']?cms-config-url["']?[^>]*>/i.exec(html)?.[0]
  const href = tag ? /href=["']([^"']+)["']/i.exec(tag)?.[1] : null
  if (!href || /^https?:/i.test(href)) return null
  const dir = indexPath.split("/").slice(0, -1).join("/")
  const joined = href.startsWith("/") ? href : `${dir}/${href}`
  return safeRepoPath(joined) || null
}

/** The collection most likely to be the blog: supported, then named like a blog, then with a body. */
export function guessBlogCollection(cfg: CmsConfig): CmsCollection | null {
  const ok = cfg.collections.filter((c) => c.supported)
  const score = (c: CmsCollection) =>
    (/post|blog|article|news|insight/i.test(`${c.name} ${c.label} ${c.folder}`) ? 2 : 0) + (c.hasBody ? 1 : 0)
  return [...ok].sort((a, b) => score(b) - score(a))[0] ?? null
}
