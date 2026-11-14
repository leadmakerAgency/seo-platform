import { StatusDot, StatusTag } from "@/components/common/status"
import { HEALTH_META, type ClientHealth } from "../constants"

export function HealthDot({ health, className }: { health: ClientHealth; className?: string }) {
  return <StatusDot tone={HEALTH_META[health].tone} className={className} />
}

export function HealthBadge({ health, className }: { health: ClientHealth; className?: string }) {
  const meta = HEALTH_META[health]
  return (
    <StatusTag tone={meta.tone} className={className}>
      {meta.label}
    </StatusTag>
  )
}
