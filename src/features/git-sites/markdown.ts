import TurndownService from "turndown"
import { strikethrough, tables } from "turndown-plugin-gfm"

/**
 * Article HTML → Markdown for Git sites (docs/plans/git-cms/04-discovery-and-mapping.md). Pure.
 * The input is already cleaned by cleanArticleHtml() (h2–h4, p, lists, links, emphasis, quotes,
 * code, images, figures, tables), so the output stays plain CommonMark + GFM tables.
 */

let service: TurndownService | null = null

function turndown(): TurndownService {
  if (service) return service
  const t = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "_",
    strongDelimiter: "**",
    linkStyle: "inlined",
    hr: "---",
  })
  t.use([tables, strikethrough])
  // No Markdown for these: markdown-it (Eleventy, Hugo, Astro…) renders the HTML as is.
  t.keep(["u", "figure"])
  // Line breaks inside paragraphs: a hard break that every renderer understands.
  t.addRule("br", { filter: "br", replacement: () => "  \n" })
  // "- Item" / "1. Item" (turndown's default pads markers to 4 columns: "-   Item").
  t.addRule("listItem", {
    filter: "li",
    replacement(content, node) {
      const li = node as HTMLElement
      const parent = li.parentNode as HTMLElement | null
      let prefix = "- "
      if (parent?.nodeName === "OL") {
        const start = Number(parent.getAttribute("start")) || 1
        prefix = `${start + Array.prototype.indexOf.call(parent.children, li)}. `
      }
      const body = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n(?=.)/g, "\n    ")
      return prefix + body + (li.nextSibling && !body.endsWith("\n") ? "\n" : "")
    },
  })
  service = t
  return t
}

/** The Markdown body (no trailing spaces on lines except hard breaks, one final newline). */
export function htmlToMarkdown(html: string): string {
  const md = turndown()
    .turndown(html || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return md ? `${md}\n` : ""
}

/** Every <img src> in the HTML, in order, without duplicates. */
export function imageSources(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi)) {
    const src = m[2].trim()
    if (src && !out.includes(src)) out.push(src)
  }
  return out
}

/** Swaps image URLs (for example our Storage links → `/media/my-post-2.png`) before conversion. */
export function rewriteImages(html: string, map: Record<string, string>): string {
  return html.replace(/(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2/gi, (whole, pre: string, q: string, src: string) => {
    const to = map[src.trim()]
    return to ? `${pre}${q}${to.replace(/"/g, "%22")}${q}` : whole
  })
}

export { needsTemplateGuard } from "./guard"
