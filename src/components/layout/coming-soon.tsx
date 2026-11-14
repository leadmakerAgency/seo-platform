import { StatusTag } from "@/components/common/status"
import type { NavItem } from "@/lib/navigation"
import { PageHeader } from "./page-header"

/** Placeholder for pages that aren't built yet. Text comes from navigation.ts. */
export function ComingSoon({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {item.title}
            <StatusTag tone="neutral" dot={false} className="font-sans tracking-normal">
              Not built yet
            </StatusTag>
          </span>
        }
      />
      <div className="flex max-w-2xl gap-4 rounded-lg border border-dashed bg-card p-5">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="font-medium">What this page will do</p>
          <p className="text-sm text-pretty text-muted-foreground">{item.summary}</p>
        </div>
      </div>
    </div>
  )
}
