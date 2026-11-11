import { z } from "zod"

import { REQUEST_KINDS, type RequestKind } from "./constants"

/**
 * Client requests filters live in the URL:
 *   /clients/<slug>/requests?show=open|answered|overdue|done|cancelled&request=123
 *   /tasks/requests?show=&kind=&owner=&q=&request=123
 * `request` opens the request panel, so a request can be linked to directly.
 */
export const REQUEST_SHOWS = ["open", "answered", "overdue", "done", "cancelled"] as const
export type RequestShow = (typeof REQUEST_SHOWS)[number]

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v)

const schema = z.object({
  show: z.preprocess(one, z.enum(REQUEST_SHOWS).optional()).catch(undefined),
  kind: z
    .preprocess(one, z.enum(REQUEST_KINDS as [RequestKind, ...RequestKind[]]).optional())
    .catch(undefined),
  owner: z.preprocess(one, z.union([z.uuid(), z.literal("none")]).optional()).catch(undefined),
  q: z.preprocess(one, z.string().trim().max(80).optional()).catch(undefined),
  request: z.preprocess(one, z.coerce.number().int().min(1).optional()).catch(undefined),
})

export type RequestParams = z.infer<typeof schema>

export function parseRequestParams(raw: Record<string, string | string[] | undefined>) {
  const parsed = schema.parse(raw)
  return { ...parsed, q: parsed.q || undefined }
}

export function requestsHref(base: string, params: RequestParams, patch: Partial<RequestParams>) {
  const next = { ...params, ...patch }
  const search = new URLSearchParams()
  if (next.show) search.set("show", next.show)
  if (next.kind) search.set("kind", next.kind)
  if (next.owner) search.set("owner", next.owner)
  if (next.q) search.set("q", next.q)
  if (next.request) search.set("request", String(next.request))
  const query = search.toString()
  return query ? `${base}?${query}` : base
}
