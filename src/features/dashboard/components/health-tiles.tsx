import { StatStrip } from "@/components/common/stat-strip"
import { StatusDot } from "@/components/common/status"
import { HEALTH_META, HEALTH_ORDER } from "@/features/clients/constants"
import type { HealthCounts } from "../queries"
import { dashboardHref, type DashboardParams } from "../search-params"

/** Four clickable counts that filter the client list by health. */
export function HealthTiles({ counts, params }: { counts: HealthCounts; params: DashboardParams }) {
  return (
    <div className="flex flex-col gap-3">
      <StatStrip
        label="Filter clients by health"
        items={[
          {
            key: "all",
            label: "All clients",
            count: counts.all,
            selected: params.health === undefined,
            href: `${dashboardHref(params, { health: undefined })}#clients`,
          },
          ...HEALTH_ORDER.map((h) => ({
            key: h,
            label: HEALTH_META[h].label,
            count: counts[h],
            dot: HEALTH_META[h].tone,
            selected: params.health === h,
            href: `${dashboardHref(params, { health: h })}#clients`,
          })),
        ]}
      />
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        {HEALTH_ORDER.map((h) => (
          <div key={h} className="flex items-center gap-1.5">
            <StatusDot tone={HEALTH_META[h].tone} />
            <dt className="font-medium text-foreground">{HEALTH_META[h].label}:</dt>
            <dd>{HEALTH_META[h].description}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
