import Link from "next/link"

import { HealthDot } from "@/features/clients/components/health-badge"
import { HEALTH_META, HEALTH_ORDER, type ClientHealth } from "@/features/clients/constants"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { HealthCounts } from "../queries"
import { dashboardHref, type DashboardParams } from "../search-params"

/** Four clickable counts that filter the client list by health. */
export function HealthTiles({ counts, params }: { counts: HealthCounts; params: DashboardParams }) {
  const tiles: { key: ClientHealth | undefined; label: string; count: number }[] = [
    { key: undefined, label: "All clients", count: counts.all },
    ...HEALTH_ORDER.map((h) => ({ key: h, label: HEALTH_META[h].label, count: counts[h] })),
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const selected = params.health === tile.key
          return (
            <Link
              key={tile.label}
              href={`${dashboardHref(params, { health: tile.key })}#clients`}
              scroll={false}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "group flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring",
                selected && "border-primary hover:border-primary",
              )}
            >
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                {tile.key && <HealthDot health={tile.key} className="size-2" />}
                {tile.label}
              </span>
              <span className="text-[28px] leading-none font-semibold tracking-tight tabular-nums">
                {formatNumber(tile.count)}
              </span>
            </Link>
          )
        })}
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        {HEALTH_ORDER.map((h) => (
          <div key={h} className="flex items-center gap-1.5">
            <HealthDot health={h} />
            <dt className="font-medium text-foreground/80">{HEALTH_META[h].label}:</dt>
            <dd>{HEALTH_META[h].description}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
