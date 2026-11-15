import type { Intent } from "./constants"

/**
 * How keywords are scored (shown on the page under "How scores work").
 * score = 100 × (0.40 volume + 0.20 intent + 0.20 ease + 0.10 value + 0.10 quick win)
 */

export type KeywordFacts = {
  localVolume: number | null
  nationalVolume: number | null
  difficulty: number | null
  cpc: number | null
  intent: Intent | null
  /** Current position (tracked: our own Google check; candidates: national, from Labs). */
  position: number | null
}

export type ScoreParts = {
  volume: number
  intent: number
  ease: number
  value: number
  quickWin: number
  nationalEstimate: boolean
}

const INTENT_WEIGHT: Record<Intent, number> = {
  transactional: 1,
  commercial: 0.9,
  informational: 0.3,
  navigational: 0.2,
}

const volumeScore = (v: number) => Math.min(1, Math.log10(Math.max(0, v) + 1) / 3) // 1,000+ a month = 1

export function scoreKeyword(f: KeywordFacts): { score: number; parts: ScoreParts } {
  const nationalEstimate = f.localVolume === null && f.nationalVolume !== null
  const volume =
    f.localVolume !== null ? volumeScore(f.localVolume) : f.nationalVolume !== null ? volumeScore(f.nationalVolume) * 0.5 : 0
  const intent = f.intent ? INTENT_WEIGHT[f.intent] : 0.5
  const ease = f.difficulty === null ? 0.5 : 1 - Math.min(100, Math.max(0, f.difficulty)) / 100
  const value = Math.min(1, Math.max(0, f.cpc ?? 0) / 20)
  const quickWin =
    f.position !== null && f.position >= 4 && f.position <= 20
      ? 1
      : f.position !== null && f.position > 20 && f.position <= 50
        ? 0.5
        : 0
  const score = Math.round(100 * (0.4 * volume + 0.2 * intent + 0.2 * ease + 0.1 * value + 0.1 * quickWin))
  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    score: Math.max(0, Math.min(100, score)),
    parts: {
      volume: r2(volume),
      intent: r2(intent),
      ease: r2(ease),
      value: r2(value),
      quickWin: r2(quickWin),
      nationalEstimate,
    },
  }
}

export type TrackedFacts = KeywordFacts & {
  phrase: string
  score: number
  coreKeyword: string | null
  /** Weekly Google checks so far, and how many of them found the client in the top 100. */
  checks: number
  checksFound: number
}

/** Plain reasons a tracked keyword is weak (empty = fine). `city` for the wording. */
export function weakReasons(k: TrackedFacts, others: TrackedFacts[], city: string | null): string[] {
  const reasons: string[] = []
  if (k.localVolume !== null && k.localVolume < 10) {
    reasons.push(`Fewer than 10 searches a month${city ? ` in ${city}` : ""}`)
  }
  if (k.intent === "informational") {
    reasons.push("People searching this want information, not a business")
  }
  if (k.checks >= 8 && k.checksFound === 0 && (k.difficulty ?? 0) > 40) {
    reasons.push(`Not in the Google top 100 after ${k.checks} weeks, and hard to rank for (difficulty ${k.difficulty})`)
  }
  if (k.coreKeyword) {
    const stronger = others.find(
      (o) =>
        o.phrase !== k.phrase &&
        o.coreKeyword === k.coreKeyword &&
        (o.localVolume ?? o.nationalVolume ?? 0) > (k.localVolume ?? k.nationalVolume ?? 0),
    )
    if (stronger) reasons.push(`Same search as “${stronger.phrase}”, which gets more searches`)
  }
  if (reasons.length === 0 && k.score < 35) reasons.push(`Low overall score (${k.score} of 100)`)
  return reasons
}

/** Does this phrase belong to one of the client's topics (services, categories)? */
export function topicOf(phrase: string, topics: string[]): string | null {
  const p = ` ${phrase.toLowerCase()} `
  let best: string | null = null
  for (const t of topics) {
    const term = t.toLowerCase().trim()
    if (!term) continue
    // Whole term, or every word of a multi-word term, appears in the phrase.
    const words = term.split(" ").filter((w) => w.length > 2)
    const hit = p.includes(` ${term} `) || p.includes(` ${term}s `) || (words.length > 1 && words.every((w) => p.includes(w)))
    if (hit && (!best || term.length > best.length)) best = term
  }
  return best
}

export const hasNegative = (phrase: string, negatives: string[]) => {
  const p = ` ${phrase.toLowerCase()} `
  return negatives.some((n) => n.trim() && p.includes(` ${n.toLowerCase().trim()} `))
}

export type SwapPick = {
  keyword_norm: string
  phrase: string
  topic: string | null
  score: number
  status: string
}

/**
 * Suggested swaps: for each weak tracked keyword, the best untracked candidate on the same
 * topic (any topic when the keyword has none) that scores at least 15 points higher.
 * Each candidate is suggested once. `candidates` must be sorted best first.
 */
export function suggestSwaps<C extends SwapPick>(
  weak: { id: string; phrase: string; topic: string | null; score: number }[],
  candidates: C[],
  tracked: Set<string>,
): Map<string, C> {
  const used = new Set<string>()
  const out = new Map<string, C>()
  for (const k of [...weak].sort((a, b) => a.score - b.score)) {
    const pick = candidates.find(
      (c) =>
        c.status === "new" &&
        !tracked.has(c.keyword_norm) &&
        !used.has(c.keyword_norm) &&
        c.score >= k.score + 15 &&
        (!k.topic || !c.topic || c.topic === k.topic),
    )
    if (pick) {
      out.set(k.id, pick)
      used.add(pick.keyword_norm)
    }
  }
  return out
}
