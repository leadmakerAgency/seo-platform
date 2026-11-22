import "server-only"

import sanitizeHtml from "sanitize-html"

/**
 * Article HTML is cleaned on the server when it's saved and again before it goes to
 * WordPress: only what the editor makes survives, links are https/http/mailto/tel, images
 * are https. Scripts, styles, event handlers and javascript: links never get through.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h2", "h3", "h4", "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li",
    "blockquote", "code", "pre", "img", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["https", "http", "mailto", "tel"],
  allowedSchemesByTag: { img: ["https"] },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    h1: "h2",
    a: (tagName, attribs) => {
      const external = /^https?:\/\//i.test(attribs.href ?? "")
      return {
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.target === "_blank" || external ? { rel: "noopener" } : {}),
        },
      }
    },
  },
}

export function cleanArticleHtml(html: string): string {
  return sanitizeHtml(html ?? "", OPTIONS).trim()
}

/** Plain text, for excerpts and previews. */
export function htmlToText(html: string): string {
  return sanitizeHtml(html ?? "", { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim()
}
