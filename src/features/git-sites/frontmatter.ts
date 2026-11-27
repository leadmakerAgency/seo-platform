import { parse, stringify } from "yaml"

import type { CmsCollection } from "./config"
import { excerptIsMeta, fieldDefaults, fieldOf, type FieldMap } from "./field-map"
import { formatDate } from "./files"
import { needsTemplateGuard } from "./guard"

/**
 * The post file: YAML front matter + Markdown (docs/plans/git-cms/04-discovery-and-mapping.md).
 * Pure. Every string is double-quoted (like the n8n posts already on South Africa SDR), and only
 * fields that exist in the collection are written.
 */

export type PostInput = {
  title: string
  slug: string
  excerpt: string | null
  metaDescription: string | null
  seoTitle: string | null
  tags: string[]
  author: string | null
  /** Public URL of the committed featured image (`/media/my-post.png`). */
  featuredImage: string | null
  imageAlt: string | null
  date: Date
  draft: boolean
  /** The body, already converted (htmlToMarkdown). */
  markdown: string
}

export type ComposedPost = {
  data: Record<string, unknown>
  text: string
  /** `templateEngineOverride: md` was added because the body has `{{`, `{%` or `{#`. */
  guarded: boolean
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim() || null

/** The front matter object in the order the CMS shows fields, then defaults, then the guard. */
export function frontMatterFor(p: PostInput, c: CmsCollection, map: FieldMap): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  const set = (name: string | null | undefined, value: unknown) => {
    if (!name || value === null || value === undefined || value === "") return
    if (Array.isArray(value) && !value.length) return
    data[name] = value
  }

  set(map.title, clean(p.title) ?? "Untitled")
  set(map.slug, p.slug)
  if (map.date) set(map.date, formatDate(p.date, fieldOf(c, map.date)?.format ?? null))
  if (map.draft) data[map.draft.name] = map.draft.invert ? !p.draft : p.draft

  const meta = clean(p.metaDescription)
  const excerpt = clean(p.excerpt)
  if (excerptIsMeta(map)) {
    // The site uses the excerpt as its meta description (South Africa SDR's header template).
    set(map.excerpt, meta ?? excerpt)
  } else {
    set(map.excerpt, excerpt)
    set(map.metaDescription, meta)
  }
  set(map.seoTitle, clean(p.seoTitle))
  set(map.featuredImage, p.featuredImage)
  if (p.featuredImage) set(map.imageAlt, clean(p.imageAlt) ?? clean(p.title))

  const tags = [...new Set(p.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20)
  if (map.tags) {
    const widget = fieldOf(c, map.tags)?.widget
    set(map.tags, widget === "string" || widget === "text" ? tags.join(", ") : tags)
  }
  if (map.author) {
    const widget = fieldOf(c, map.author)?.widget
    const a = clean(p.author)
    set(map.author, a && widget === "list" ? [a] : a)
  }

  for (const [k, v] of Object.entries(fieldDefaults(c, map))) if (!(k in data)) data[k] = v
  if (needsTemplateGuard(p.markdown)) data.templateEngineOverride = "md"
  return data
}

export function stringifyFrontMatter(data: Record<string, unknown>): string {
  const yaml = stringify(data, { defaultStringType: "QUOTE_DOUBLE", defaultKeyType: "PLAIN", lineWidth: 0 })
  return `---\n${yaml}---\n`
}

/** The whole file: front matter, a blank line, the body, one final newline. */
export function composePost(p: PostInput, c: CmsCollection, map: FieldMap): ComposedPost {
  const data = frontMatterFor(p, c, map)
  const body = p.markdown.trim()
  const text = `${stringifyFrontMatter(data)}\n${body ? `${body}\n` : ""}`
  return { data, text, guarded: data.templateEngineOverride === "md" }
}

/** Splits a post file into its front matter and body (null when there's no front matter). */
export function parseFrontMatter(text: string): { data: Record<string, unknown>; body: string } | null {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!m) return null
  try {
    const data = parse(m[1], { maxAliasCount: 20, strict: false, uniqueKeys: false })
    if (!data || typeof data !== "object" || Array.isArray(data)) return { data: {}, body: text.slice(m[0].length) }
    return { data: data as Record<string, unknown>, body: text.slice(m[0].length).replace(/^\r?\n/, "") }
  } catch {
    return null
  }
}
