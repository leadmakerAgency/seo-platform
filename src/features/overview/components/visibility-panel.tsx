import { ArrowRight, Minus, TrendingDown, TrendingUp } from "lucide-react"
import Link from "next/link"

import { formatNumber, formatRelative } from "@/lib/format"
import { clientHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { PLACES, type PlaceKey } from "../constants"
import type { PlaceStats, Visibility } from "../queries"

/**
 * "Where they show up": website (Google top 10), map pack (top 3) and AI answers,
 * each against the first check after the client started. Empty until the
 * Rankings / AI visibility checks have run — nothing is estimated.
 */
export function VisibilityPanel({
  visibility,
  slug,
  now,
}: {
  visibility: Visibility
  slug: string
  now: Date
}) {
  const cells: { key: PlaceKey; stats: PlaceStats | null; extra?: string }[] = [
    {
      key: "website",
      stats: visibility.website,
      extra: visibility.bing
        ? `Bing: ${visibility.bing.current} of ${visibility.bing.outOf} in the top 10`
        : undefined,
    },
    { key: "map", stats: visibility.map },
    { key: "ai", stats: visibility.ai },
  ]

  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-3">
      {cells.map(({ key, stats, extra }) => (
        <PlaceCell key={key} place={key} stats={stats} extra={extra} slug={slug} now={now} />
      ))}
    </div>
  )
}

function PlaceCell({
  place,
  stats,
  extra,
  slug,
  now,
}: {
  place: PlaceKey
  stats: PlaceStats | null
  extra?: string
  slug: string
  now: Date
}) {
  const meta = PLACES[place]
  return (
    <section className="flex flex-col gap-3 bg-card px-4 py-4">
      <h3 className="text-sm font-semibold">{meta.title}</h3>

      {stats ? (
        <div className="flex flex-col gap-1">
          <p className="font-heading text-[26px] leading-[30px] font-semibold tracking-tight tabular-nums">
            {formatNumber(stats.current)}
            <span className="text-muted-foreground"> / {formatNumber(stats.outOf)}</span>
          </p>
          <p className="text-[13px] font-medium">{meta.unit}</p>
          <Change stats={stats} />
          {extra && <p className="text-[13px] text-muted-foreground">{extra}</p>}
          <p className="text-xs text-muted-foreground">
            Last checked {formatRelative(stats.lastCheckedAt, now)}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">No checks yet</p>
          <p className="text-[13px] text-muted-foreground">{meta.empty}</p>
        </div>
      )}

      <p className="text-[13px] text-muted-foreground">{meta.explain}</p>
      <Link
        href={clientHref(slug, meta.link.segment)}
        className="mt-auto inline-flex w-fit items-center gap-1 text-[13px] font-medium text-brand underline-offset-2 hover:underline"
      >
        {meta.link.label}
        <ArrowRight className="size-3.5" />
      </Link>
    </section>
  )
}

/** Compared with the first check since the client started. */
function Change({ stats }: { stats: PlaceStats }) {
  if (stats.checks < 2 || stats.baseline === null) {
    return <p className="text-[13px] text-muted-foreground">First check, so nothing to compare yet</p>
  }
  const diff = stats.current - stats.baseline
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus
  return (
    <p
      className={cn(
        "flex items-center gap-1 text-[13px] font-medium",
        diff > 0 ? "text-success" : diff < 0 ? "text-danger" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {diff > 0
        ? `Up from ${stats.baseline} at the start`
        : diff < 0
          ? `Down from ${stats.baseline} at the start`
          : `Same as at the start (${stats.baseline})`}
    </p>
  )
}
