import type { z } from "zod"

/**
 * Research calls (with web search) answer in text; we asked for JSON. Pull the JSON out of a
 * fenced block or the first balanced object, then check it with zod. Returns null when it
 * doesn't parse (the pipeline then runs a cheap repair call without tools).
 */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1]
  const candidates = [fenced, firstObject(text)].filter((s): s is string => Boolean(s))
  for (const c of candidates) {
    try {
      return JSON.parse(c)
    } catch {
      // try the next one
    }
  }
  return null
}

function firstObject(text: string): string | null {
  const start = text.indexOf("{")
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export function parseWith<S extends z.ZodType>(schema: S, text: string): z.infer<S> | null {
  const raw = extractJson(text)
  if (raw == null) return null
  const r = schema.safeParse(raw)
  return r.success ? r.data : null
}

/** Lowercase, collapse spaces and quotes, for checking that a quote really is on the page. */
export function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** True when the quote (or its first 60 characters) appears in the text. */
export function quoteOnPage(quote: string, text: string) {
  const q = norm(quote)
  if (q.length < 8) return false
  const hay = norm(text)
  return hay.includes(q) || hay.includes(q.slice(0, 60))
}
