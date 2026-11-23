"use client"

import { History } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { actorLabel, describeActivity } from "@/features/team/activity"
import type { ActivityEntry } from "@/features/team/queries"
import { addDays, agencyToday, formatDay } from "@/lib/dates"
import { cn } from "@/lib/utils"
import { loadMoreActivity } from "../actions"
import { hueFill, IconTile, type Hue } from "./icon-tile"

/** A dot colour per kind of event, so the timeline scans by area (identity, not status). */
function eventHue(action: string): Hue {
  const area = action.split(".")[0]
  switch (area) {
    case "task":
      return "indigo"
    case "work":
      return "clay"
    case "connection":
      return "teal"
    case "request":
      return "gold"
    case "onboarding":
    case "vault":
      return "plum"
    case "keyword":
    case "rank":
    case "rankings":
    case "ai":
      return "brand"
    default:
      return "neutral"
  }
}

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
        <div className="flex items-start gap-3 rounded-lg border bg-card px-4 py-5 text-sm">
          <IconTile icon={History} />
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">Nothing yet</p>
            <p className="text-muted-foreground">Work, connections and changes show up here.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border bg-card px-4 py-4">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-2">
              <h3 className="w-fit rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {g.label}
              </h3>
              <ol className="relative flex flex-col gap-2.5 before:absolute before:top-2.5 before:bottom-2.5 before:left-[3.5px] before:w-px before:bg-border">
                {g.items.map((e) => (
                  <li key={e.id} className="relative flex items-start gap-3 text-sm">
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full ring-2 ring-card",
                        hueFill(eventHue(e.action)),
                      )}
                    />
                    <p className="min-w-0 flex-1">
                      <span className="font-medium">
                        {actorLabel(
                          e,
                          e.action.startsWith("onboarding.") ? "The client" : "System",
                        )}
                      </span>{" "}
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
