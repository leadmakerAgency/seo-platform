import { cn } from "@/lib/utils"
import { HEALTH_META, type ClientHealth } from "../constants"

export function HealthDot({ health, className }: { health: ClientHealth; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", HEALTH_META[health].dot, className)}
    />
  )
}

export function HealthBadge({ health, className }: { health: ClientHealth; className?: string }) {
  const meta = HEALTH_META[health]
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap",
        meta.badge,
        className,
      )}
    >
      <HealthDot health={health} />
      {meta.label}
    </span>
  )
}
