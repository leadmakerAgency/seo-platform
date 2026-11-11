import { History } from "lucide-react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { formatRelative } from "@/lib/format"
import { actorLabel, describeActivity } from "../activity"
import type { ActivityEntry } from "../queries"

export function ActivityFeed({ entries, now }: { entries: ActivityEntry[]; now: Date }) {
  if (entries.length === 0) {
    return (
      <Empty className="border py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History />
          </EmptyMedia>
          <EmptyTitle>No activity yet</EmptyTitle>
          <EmptyDescription>
            Invites, role changes and client changes show up here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ol className="divide-y rounded-lg border">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
        >
          <p className="text-sm">
            <span className="font-medium">{actorLabel(entry, "Someone")}</span>{" "}
            <span className="text-muted-foreground">{describeActivity(entry)}</span>
          </p>
          <time
            dateTime={entry.createdAt}
            className="text-xs whitespace-nowrap text-muted-foreground"
          >
            {formatRelative(entry.createdAt, now)}
          </time>
        </li>
      ))}
    </ol>
  )
}
