import { Hammer } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { NavItem } from "@/lib/navigation"

/** Placeholder for pages that aren't built yet. Text comes from navigation.ts. */
export function ComingSoon({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
        <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
          <Hammer className="size-3" aria-hidden />
          Coming soon
        </Badge>
      </div>
      <Empty className="min-h-[360px] border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>{item.title} is coming soon</EmptyTitle>
          <EmptyDescription>{item.summary}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
