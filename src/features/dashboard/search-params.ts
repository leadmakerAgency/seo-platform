import { z } from "zod"

/**
 * Dashboard filters live in the URL (?q=&health=&country=&owner=&sort=&page=)
 * so every view can be linked and survives the back button. Bad values fall
 * back to defaults instead of erroring.
 */
export const DASHBOARD_PAGE_SIZE = 25

export const SORT_OPTIONS = [
  { value: "urgent", label: "Most urgent first" },
  { value: "name", label: "Name A to Z" },
  { value: "newest", label: "Newest first" },
] as const

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v)

const schema = z.object({
  q: z.preprocess(one, z.string().trim().max(80).optional()).catch(undefined),
  health: z
    .preprocess(one, z.enum(["on_track", "needs_look", "action_needed"]).optional())
    .catch(undefined),
  country: z
    .preprocess(
      one,
      z
        .string()
        .regex(/^[A-Z]{2}$/)
        .optional(),
    )
    .catch(undefined),
  owner: z.preprocess(one, z.literal("me").optional()).catch(undefined),
  sort: z.preprocess(one, z.enum(["urgent", "name", "newest"]).default("urgent")).catch("urgent"),
  page: z.preprocess(one, z.coerce.number().int().min(1).max(10_000).default(1)).catch(1),
})

export type DashboardParams = z.infer<typeof schema>

export function parseDashboardParams(raw: Record<string, string | string[] | undefined>) {
  const parsed = schema.parse(raw)
  return { ...parsed, q: parsed.q || undefined }
}

export function hasFilters(params: DashboardParams) {
  return Boolean(params.q || params.health || params.country || params.owner)
}

/**
 * Builds a /dashboard URL from the current params plus a change. Any change
 * other than the page itself sends you back to page 1.
 */
export function dashboardHref(params: DashboardParams, patch: Partial<DashboardParams>) {
  const next = { ...params, ...patch }
  if (!("page" in patch)) next.page = 1

  const search = new URLSearchParams()
  if (next.q) search.set("q", next.q)
  if (next.health) search.set("health", next.health)
  if (next.country) search.set("country", next.country)
  if (next.owner) search.set("owner", next.owner)
  if (next.sort && next.sort !== "urgent") search.set("sort", next.sort)
  if (next.page && next.page > 1) search.set("page", String(next.page))

  const query = search.toString()
  return query ? `/dashboard?${query}` : "/dashboard"
}
