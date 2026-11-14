"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { StatusDot } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { actorLabel, describeActivity } from "@/features/team/activity"
import type { ActivityEntry } from "@/features/team/queries"
import { addDays, agencyToday, formatDay } from "@/lib/dates"
import { loadMoreActivity } from "../actions"

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Phoenix",
  hour: "numeric",
  minute: "2-digit",
})

/** Recent history for one client, grouped by day (agency time zone), with "Show more". */
export function ActivityFeed({
  clientId,
  clientName,
  initial,
  initialHasMore,
  today,
}: {
  clientId: string
  clientName: string
  initial: ActivityEntry[]
  initialHasMore: boolean
  today: string
}) {
  const [extra, setExtra] = useState<ActivityEntry[]>([])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [pending, startTransition] = useTransition()

  // New entries arrive with each refresh (initial); older pages are appended after them.
  const seen = new Set(initial.map((e) => e.id))
  const entries = [...initial, ...extra.filter((e) => !seen.has(e.id))]

  const groups: { label: string; items: ActivityEntry[] }[] = []
  for (const e of entries) {
    const day = agencyToday(new Date(e.createdAt))
    const label =
      day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : formatDay(day)
    const last = groups.at(-1)
    if (last?.label === label) last.items.push(e)
    else groups.push({ label, items: [e] })
  }

  function more() {
    const last = entries.at(-1)
    if (!last) return
    startTransition(async () => {
      const r = await loadMoreActivity(clientId, clientName, last.id)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setExtra((x) => [...x, ...r.data.entries])
      setHasMore(r.data.hasMore)
    })
  }

  return (
    <section aria-labelledby="activity-title" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="activity-title" className="text-[15px] leading-[22px] font-semibold">
          Recent activity
        </h2>
        <p className="text-sm text-muted-foreground">Everything that happened for this client.</p>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border bg-card px-4 py-6 text-sm">
          <p className="font-medium">Nothing yet</p>
          <p className="text-muted-foreground">Work, connections and changes show up here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border bg-card px-4 py-4">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">{g.label}</h3>
              <ol className="flex flex-col gap-2">
                {g.items.map((e) => (
                  <li key={e.id} className="flex items-start gap-2.5 text-sm">
                    <StatusDot tone="brand" className="mt-[7px]" />
                    <p className="min-w-0 flex-1">
                      <span className="font-medium">{actorLabel(e)}</span>{" "}
                      <span className="text-muted-foreground">{describeActivity(e)}</span>
                    </p>
                    <time
                      dateTime={e.createdAt}
                      className="shrink-0 text-xs text-muted-foreground tabular-nums"
                    >
                      {timeFormatter.format(new Date(e.createdAt))}
                    </time>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {hasMore && (
            <Button variant="ghost" size="sm" className="w-fit" disabled={pending} onClick={more}>
              {pending ? "Loading…" : "Show more"}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
