import type { RequestRow } from "./queries"
import type { RequestParams } from "./search-params"

export type RequestCounts = { open: number; answered: number; overdue: number; done: number }

const overdue = (r: RequestRow, today: string) =>
  r.status === "open" && r.dueOn !== null && r.dueOn < today

export function countRequests(rows: RequestRow[], today: string): RequestCounts {
  const counts = { open: 0, answered: 0, overdue: 0, done: 0 }
  for (const r of rows) {
    if (r.status === "open") counts.open += 1
    if (r.status === "answered") counts.answered += 1
    if (r.status === "done") counts.done += 1
    if (overdue(r, today)) counts.overdue += 1
  }
  return counts
}

const STATUS_ORDER = { answered: 0, open: 1, done: 2, cancelled: 3 } as const

/** Applies the URL filters. Default: everything but cancelled, answers to review first. */
export function filterRequests(rows: RequestRow[], params: RequestParams, today: string) {
  const needle = params.q?.toLowerCase()
  const number = params.q?.match(/^(?:r-?)?(\d{1,9})$/i)
  return rows
    .filter((r) => {
      if (params.show === "overdue") {
        if (!overdue(r, today)) return false
      } else if (params.show) {
        if (r.status !== params.show) return false
      } else if (r.status === "cancelled") {
        return false
      }
      if (params.kind && r.kind !== params.kind) return false
      if (params.owner === "none" && r.owner) return false
      if (params.owner && params.owner !== "none" && r.owner?.id !== params.owner) return false
      if (number) return r.number === Number(number[1])
      if (needle) {
        return (
          r.title.toLowerCase().includes(needle) || r.client.name.toLowerCase().includes(needle)
        )
      }
      return true
    })
    .sort((a, b) => {
      if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      if (a.status === "done" || a.status === "cancelled") {
        return b.updatedAt.localeCompare(a.updatedAt)
      }
      const ad = a.dueOn ?? "9999-12-31"
      const bd = b.dueOn ?? "9999-12-31"
      return ad === bd ? a.number - b.number : ad.localeCompare(bd)
    })
}
