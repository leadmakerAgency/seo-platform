import Link from "next/link"

import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { StatusDot, toneText, type Tone } from "./status"

export type StatItem = {
  key: string
  label: string
  count: number
  href: string
  selected: boolean
  /** Colours the number when the count is above zero. */
  tone?: Tone
  /** A status dot before the label. */
  dot?: Tone
}

/**
 * Counts that double as filters, in one segmented panel (not a row of cards).
 * docs/design-system.md, "Stats".
 */
export function StatStrip({ items, label }: { items: StatItem[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border",
        items.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4",
      )}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          scroll={false}
          aria-current={item.selected ? "true" : undefined}
          className={cn(
            "relative flex flex-col gap-2 bg-card px-4 pt-3 pb-3.5 transition-colors outline-none last:odd:col-span-2 hover:bg-muted/60 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:last:odd:col-span-1",
            item.selected &&
              "bg-brand-soft before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary hover:bg-brand-soft",
          )}
        >
          <span
            className={cn(
              "flex items-center gap-2 text-[13px] text-muted-foreground",
              item.selected && "text-foreground",
            )}
          >
            {item.dot && <StatusDot tone={item.dot} className="size-2" />}
            {item.label}
          </span>
          <span
            className={cn(
              "font-heading text-[26px] leading-[30px] font-semibold tracking-tight tabular-nums",
              item.tone && item.count > 0 && toneText(item.tone),
            )}
          >
            {formatNumber(item.count)}
          </span>
        </Link>
      ))}
    </nav>
  )
}

/** Matching skeleton for a StatStrip while its counts stream in. */
export function StatStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-hidden
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border",
        count === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4",
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-[83px] flex-col gap-3 bg-card px-4 pt-3.5">
          <span className="h-3.5 w-24 animate-pulse rounded-sm bg-muted" />
          <span className="h-6 w-10 animate-pulse rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  )
}
