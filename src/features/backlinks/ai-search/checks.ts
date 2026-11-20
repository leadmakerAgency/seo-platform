import type { PageSignals } from "./fetcher"

/**
 * Red flags we can check on a fetched page, without AI (plan §3 step 6b). Ported from
 * claude-seo's backlink-quality.md (30 toxic patterns, the subset visible on one page) and
 * parasite_risk.py, plus marketingskills' link-building risk rules. MIT, see knowledge.ts.
 */

export type RedFlag =
  | "link_farm" // > 100 outbound links on the page
  | "sells_posts" // "write for us" with prices or "sponsored post" packages
  | "spam_words" // pharma, casino, payday, escort words injected
  | "sponsored_section" // partner-content / advertorial section (parasite risk)
  | "parked" // domain for sale, parked page
  | "paid_only" // only paid listings / packages, no free option
  | "all_nofollow" // every outbound link is nofollow (fine for a citation, no link value)
  | "language_mismatch" // the page's language doesn't match the market
  | "thin" // under 120 words of text
  | "prompt_injection" // text that tries to instruct an AI

export type Checks = {
  flags: RedFlag[]
  /** Clear spam: hide without asking the judge. */
  definite: boolean
}

const SPAM = /\b(viagra|cialis|casino|sportsbook|betting tips|payday loans?|escort|crypto signals|porn|replica watches)\b/gi
const INJECTION =
  /\b(ignore (all |any )?(previous|prior|above) instructions|disregard (the )?(previous|above)|you are (now )?(an? )?(ai|assistant|language model)|system prompt|as an ai model)\b/i

export function checkPage(p: PageSignals, marketLanguage: string | null): Checks {
  const flags: RedFlag[] = []
  const text = `${p.title ?? ""} ${p.description ?? ""} ${p.text}`
  const lower = text.toLowerCase()
  const url = (p.finalUrl ?? "").toLowerCase()
  let definite = false

  if (p.outbound.total > 100) {
    flags.push("link_farm")
    if (p.outbound.total > 300) definite = true
  }
  if (/write for us|guest post|submit (a )?guest/i.test(text) && /(\$|€|£)\s?\d{2,}|sponsored post|paid post|link insertion|price list|do-?follow link for/i.test(text)) {
    flags.push("sells_posts")
    definite = true
  }
  if ((text.match(SPAM) ?? []).length >= 3) {
    flags.push("spam_words")
    definite = true
  }
  if (/\/(partner-content|sponsored|brand-?studio|advertorial|paid-post)s?\//.test(url) || /\b(partner content|sponsored content|paid partnership|advertorial)\b/i.test(lower.slice(0, 3000))) {
    flags.push("sponsored_section")
  }
  if (/(this domain|domain) (is )?(for sale|may be for sale)|buy this domain|parked (free|domain)/i.test(text) && p.words < 250) {
    flags.push("parked")
    definite = true
  }
  const listingish = /\b(listing|directory|add your|get listed|submit)\b/i.test(text)
  const paid = /\b(pricing|packages|featured listing \$|per (month|year)|\/mo\b|paid listing)\b/i.test(text)
  const free = /\b(free (listing|basic|profile|submission)|for free|it's free|no cost|basic listing)\b/i.test(text)
  if (listingish && paid && !free) flags.push("paid_only")
  if (p.outbound.total >= 5 && p.outbound.dofollow === 0) flags.push("all_nofollow")
  if (p.pageNofollow && !flags.includes("all_nofollow")) flags.push("all_nofollow")
  if (marketLanguage && p.lang) {
    const want = marketLanguage.slice(0, 2).toLowerCase()
    const have = p.lang.slice(0, 2).toLowerCase()
    // English pages are fine for any market's B2B / global sources; flag other mismatches.
    if (want !== have && have !== "en") flags.push("language_mismatch")
  }
  if (p.status === "ok" && p.words < 120) flags.push("thin")
  if (INJECTION.test(text)) flags.push("prompt_injection")
  return { flags, definite }
}

/** What the verification says about the kind of link, before the AI reads the page. */
export function linkTypeOf(p: PageSignals): "dofollow" | "nofollow" | "unknown" {
  if (p.status !== "ok") return "unknown"
  if (p.pageNofollow) return "nofollow"
  if (p.outbound.total === 0) return "unknown"
  if (p.outbound.dofollow === 0) return "nofollow"
  return "dofollow"
}
