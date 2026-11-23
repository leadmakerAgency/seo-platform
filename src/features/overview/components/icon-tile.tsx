import {
  ChartNoAxesColumn,
  Link2,
  NotebookPen,
  Radar,
  Star,
  Store,
  type LucideIcon,
} from "lucide-react"

import type { Tone } from "@/components/common/status"
import { cn } from "@/lib/utils"
import type { DeliverableKind } from "../constants"

/**
 * Accent hues for icon tiles and identity marks on the Overview (tokens `--hue-*` in
 * globals.css). They say "which thing", never "how it's going": status keeps its tones.
 */
export type Hue = "indigo" | "gold" | "plum" | "teal" | "clay" | "brand" | "neutral"

const TILE: Record<Hue, string> = {
  indigo: "bg-hue-indigo-soft text-hue-indigo",
  gold: "bg-hue-gold-soft text-hue-gold",
  plum: "bg-hue-plum-soft text-hue-plum",
  teal: "bg-hue-teal-soft text-hue-teal",
  clay: "bg-hue-clay-soft text-hue-clay",
  brand: "bg-brand-soft text-brand",
  neutral: "bg-muted text-muted-foreground",
}

const FILL: Record<Hue, string> = {
  indigo: "bg-hue-indigo",
  gold: "bg-hue-gold",
  plum: "bg-hue-plum",
  teal: "bg-hue-teal",
  clay: "bg-hue-clay",
  brand: "bg-primary",
  neutral: "bg-neutral-dot",
}

/** Same meaning as StatusTag's tones, as a tile. */
const TONE_TILE: Record<Tone, string> = {
  neutral: TILE.neutral,
  brand: TILE.brand,
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
}

/** Solid fill for a hue (progress bars, small markers). */
export const hueFill = (hue: Hue) => FILL[hue]

/** Each monthly deliverable keeps one icon and one hue everywhere on the page. */
export const DELIVERABLE_LOOK: Record<DeliverableKind, { icon: LucideIcon; hue: Hue }> = {
  backlinks: { icon: Link2, hue: "teal" },
  articles: { icon: NotebookPen, hue: "indigo" },
  gbp_posts: { icon: Store, hue: "clay" },
  review_requests: { icon: Star, hue: "gold" },
  ai_fixes: { icon: Radar, hue: "plum" },
}

export const KEYWORDS_LOOK = { icon: ChartNoAxesColumn, hue: "brand" } as const

/** A small tinted square holding one icon. Pass a `hue` for identity or a `tone` for status. */
export function IconTile({
  icon: Icon,
  hue = "neutral",
  tone,
  size = "md",
  className,
}: {
  icon: LucideIcon
  hue?: Hue
  tone?: Tone
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-md",
        size === "sm" && "size-6 [&>svg]:size-3.5",
        size === "md" && "size-8 [&>svg]:size-4",
        size === "lg" && "size-9 [&>svg]:size-[18px]",
        tone ? TONE_TILE[tone] : TILE[hue],
        className,
      )}
    >
      <Icon strokeWidth={2} />
    </span>
  )
}
