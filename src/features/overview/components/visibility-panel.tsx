import {
  ArrowRight,
  Globe,
  MapPinned,
  Minus,
  Radar,
  SearchX,
  TrendingDown,
  TrendingUp,
  type IconComponent,
} from "@/components/icons"
import Link from "next/link"

import { formatNumber, formatRelative } from "@/lib/format"
import { clientHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { PLACES, type PlaceKey } from "../constants"
import type { PlaceStats, Visibility } from "../queries"
import { DuoIcon } from "./duo-icon"

/** One icon per place. */
const PLACE_ICON: Record<PlaceKey, IconComponent> = {
  website: Globe,
  map: MapPinned,
  ai: Radar,
}

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
  const PlaceIcon = PLACE_ICON[place]
  const share = stats && stats.outOf > 0 ? Math.min(100, (stats.current / stats.outOf) * 100) : 0
  return (
    <section className="flex flex-col gap-4 bg-card px-4 pt-4 pb-4">
      <div className="flex items-center gap-2.5">
        <DuoIcon icon={PlaceIcon} className="size-6" />
        <h3 className="text-sm leading-5 font-semibold">{meta.title}</h3>
      </div>

      {stats ? (
        <div className="flex flex-col gap-1.5">
          <p className="font-heading text-[26px] leading-[30px] font-semibold tracking-tight tabular-nums">
            {formatNumber(stats.current)}
            <span className="text-muted-foreground"> / {formatNumber(stats.outOf)}</span>
          </p>
          <p className="text-[13px] font-medium">{meta.unit}</p>
          <span
            role="progressbar"
            aria-label={`${meta.title}: ${stats.current} of ${stats.outOf}`}
            aria-valuemin={0}
            aria-valuemax={stats.outOf}
            aria-valuenow={stats.current}
            className="relative my-1 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-icon-ink"
              style={{ width: `${share}%` }}
            />
          </span>
          <Change stats={stats} />
          {extra && <p className="text-[13px] text-muted-foreground">{extra}</p>}
          <p className="text-xs text-muted-foreground">
            Last checked {formatRelative(stats.lastCheckedAt, now)}
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-md border border-dashed bg-background px-3 py-2.5">
          <SearchX aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">No checks yet</p>
            <p className="text-[13px] text-muted-foreground">{meta.empty}</p>
          </div>
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
    return (
      <p className="text-[13px] text-muted-foreground">First check, so nothing to compare yet</p>
    )
  }
  // Like for like: the baseline counts only keywords that were in both checks. When the
  // keyword list changed since then, say how many were compared.
  const sameSet = stats.compared !== null && stats.compared !== stats.outOf && stats.compared > 0
  const diff =
    (sameSet && stats.currentCompared !== null ? stats.currentCompared : stats.current) -
    stats.baseline
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus
  return (
    <p
      className={cn(
        "flex items-center gap-1 text-[13px] font-medium",
        diff > 0 ? "text-success" : diff < 0 ? "text-danger" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {sameSet
        ? diff === 0
          ? `Same as at the start (${stats.baseline}), on the same ${stats.compared} keywords`
          : `${diff > 0 ? "Up" : "Down"} from ${stats.baseline} to ${stats.baseline + diff} since the start, on the same ${stats.compared} keywords`
        : diff > 0
          ? `Up from ${stats.baseline} at the start`
          : diff < 0
            ? `Down from ${stats.baseline} at the start`
            : `Same as at the start (${stats.baseline})`}
    </p>
  )
}
