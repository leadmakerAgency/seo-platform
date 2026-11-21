import type { Brief } from "./brief"
import type { Target } from "./queries"

/** What the brief needs from the places, for the live checklist in the setup's places step. */
export function placeNeeds(brief: Pick<Brief, "reach"> | null, targets: Target[]) {
  const active = targets.filter((t) => t.active)
  const needs: { label: string; done: boolean }[] = []
  if (!brief) return [{ label: "At least one place", done: active.length > 0 }]
  if (brief.reach.includes("local")) {
    needs.push({ label: "A city or region (local customers)", done: active.some((t) => t.kind !== "country") })
  }
  if (brief.reach.some((r) => r !== "local")) {
    needs.push({ label: "A country (national or global customers)", done: active.some((t) => t.kind === "country") })
  }
  return needs
}

/** Splits the database's "what is missing" list into the brief's part and the places' part. */
export function splitMissing(missing: string[]) {
  const isPlace = (m: string) => /\bplaces?\b/i.test(m)
  return { brief: missing.filter((m) => !isPlace(m)), places: missing.filter(isPlace) }
}
