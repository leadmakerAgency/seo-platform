import type { CmsCollection, CmsField } from "./config"

/**
 * Which site field each article field goes into (docs/plans/git-cms/04-discovery-and-mapping.md).
 * Pure. Stored as `git_connections.field_map`; the team can change any row in Set up site.
 */

export type DraftMap = { name: string; invert: boolean }

export type FieldMap = {
  title?: string | null
  slug?: string | null
  date?: string | null
  draft?: DraftMap | null
  excerpt?: string | null
  metaDescription?: string | null
  seoTitle?: string | null
  featuredImage?: string | null
  imageAlt?: string | null
  tags?: string | null
  author?: string | null
}

export const FIELD_KEYS = [
  "title",
  "slug",
  "date",
  "draft",
  "excerpt",
  "metaDescription",
  "seoTitle",
  "featuredImage",
  "imageAlt",
  "tags",
  "author",
] as const
export type FieldKey = (typeof FIELD_KEYS)[number]

export const FIELD_LABELS: Record<FieldKey, string> = {
  title: "Title",
  slug: "Slug",
  date: "Publish date",
  draft: "Draft / published",
  excerpt: "Excerpt",
  metaDescription: "Meta description",
  seoTitle: "SEO title",
  featuredImage: "Featured image",
  imageAlt: "Image alt text",
  tags: "Tags",
  author: "Author",
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

const CANDIDATES: Record<Exclude<FieldKey, "draft">, { names: string[]; widgets?: string[] }> = {
  title: { names: ["title", "name", "headline"], widgets: ["string"] },
  slug: { names: ["slug", "permalinkslug", "urlslug"], widgets: ["string"] },
  date: { names: ["date", "pubdate", "publishdate", "publishedat", "publishedon", "datepublished", "published"], widgets: ["datetime", "date"] },
  excerpt: { names: ["excerpt", "summary", "description", "lead", "intro", "teaser"], widgets: ["text", "string"] },
  metaDescription: { names: ["metadescription", "seodescription", "description", "metadesc"], widgets: ["text", "string"] },
  seoTitle: { names: ["seotitle", "metatitle", "pagetitle"], widgets: ["string"] },
  featuredImage: {
    names: ["featuredimage", "image", "thumbnail", "cover", "coverimage", "heroimage", "banner", "featured", "img"],
    widgets: ["image", "file", "string"],
  },
  imageAlt: { names: ["imagealt", "featuredimagealt", "alt", "coveralt", "imagealttext"], widgets: ["string", "text"] },
  // Lists, or a comma-separated text field ("a, b").
  tags: { names: ["tags", "categories", "keywords", "topics"], widgets: ["list", "select", "relation", "string", "text"] },
  author: { names: ["author", "authors", "byline", "writer"], widgets: ["string", "select", "relation", "list"] },
}

function pick(fields: CmsField[], key: Exclude<FieldKey, "draft">, taken: Set<string>): string | null {
  const c = CANDIDATES[key]
  const usable = fields.filter((f) => f.name !== "body" && !taken.has(f.name) && (!c.widgets || c.widgets.includes(f.widget)))
  for (const want of c.names) {
    const hit = usable.find((f) => norm(f.name) === want)
    if (hit) return hit.name
  }
  return null
}

/** The automatic map for a collection: first name match wins, each site field used once. */
export function autoFieldMap(c: CmsCollection): FieldMap {
  const taken = new Set<string>()
  const map: FieldMap = {}
  const take = (k: Exclude<FieldKey, "draft">) => {
    const name = pick(c.fields, k, taken)
    if (name) taken.add(name)
    map[k] = name
  }
  // Order matters: the excerpt gets "description" only when there's no better excerpt field.
  take("title")
  take("slug")
  take("date")
  const draft = c.fields.find((f) => f.widget === "boolean" && norm(f.name) === "draft")
  const published = c.fields.find((f) => f.widget === "boolean" && ["published", "publish", "ispublished"].includes(norm(f.name)))
  map.draft = draft ? { name: draft.name, invert: false } : published ? { name: published.name, invert: true } : null
  if (map.draft) taken.add(map.draft.name)
  take("excerpt")
  take("metaDescription")
  take("seoTitle")
  take("featuredImage")
  take("imageAlt")
  take("tags")
  take("author")
  return map
}

/** Reads a stored map (jsonb) safely; unknown keys and non-string values are dropped. */
export function readFieldMap(v: unknown): FieldMap {
  const r = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  const out: FieldMap = {}
  for (const k of FIELD_KEYS) {
    const x = r[k]
    if (k === "draft") {
      const d = x && typeof x === "object" ? (x as Record<string, unknown>) : null
      out.draft = d && typeof d.name === "string" && d.name ? { name: d.name.slice(0, 100), invert: d.invert === true } : null
    } else {
      out[k] = typeof x === "string" && x ? x.slice(0, 100) : null
    }
  }
  return out
}

/** Site fields we fill (so the rest can be listed as "we leave these empty"). */
export function mappedNames(map: FieldMap): Set<string> {
  const s = new Set<string>(["body"])
  for (const k of FIELD_KEYS) {
    const v = map[k]
    if (typeof v === "string" && v) s.add(v)
    else if (v && typeof v === "object") s.add(v.name)
  }
  return s
}

/**
 * Defaults for site fields we don't map (for example `hero_emoji: "📈"`, a hidden `layout`): the
 * CMS fills these on every new post, so ours look the same as posts created in the CMS.
 */
export function fieldDefaults(c: CmsCollection, map: FieldMap): Record<string, unknown> {
  const mapped = mappedNames(map)
  const out: Record<string, unknown> = {}
  for (const f of c.fields) {
    if (mapped.has(f.name) || f.default === undefined) continue
    const d = f.default
    if (typeof d === "string" || typeof d === "number" || typeof d === "boolean") out[f.name] = d
    else if (Array.isArray(d) && d.every((x) => typeof x === "string")) out[f.name] = d
  }
  return out
}

/** Required site fields we neither map nor have a default for. */
export function emptyRequired(c: CmsCollection, map: FieldMap): string[] {
  const mapped = mappedNames(map)
  return c.fields.filter((f) => f.required && !mapped.has(f.name) && f.default === undefined).map((f) => f.label)
}

/**
 * True when the site has no separate meta description field, so (like South Africa SDR's
 * header template) the excerpt doubles as the meta description.
 */
export function excerptIsMeta(map: FieldMap): boolean {
  return Boolean(map.excerpt) && !map.metaDescription
}

/** The field definition by name (for its date format and widget). */
export function fieldOf(c: CmsCollection, name: string | null | undefined): CmsField | null {
  return name ? (c.fields.find((f) => f.name === name) ?? null) : null
}
