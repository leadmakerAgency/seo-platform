import {
  ChartNoAxesColumn,
  Link2,
  NotebookPen,
  Radar,
  Star,
  Store,
  type IconComponent,
} from "@/components/icons"

import { toneText, type Tone } from "@/components/common/status"
import { cn } from "@/lib/utils"
import type { DeliverableKind } from "../constants"

/**
 * Accent hues for icons and identity marks on the Overview (tokens `--hue-*` in globals.css).
 * They say "which thing", never "how it's going": status keeps its tones.
 */
export type Hue = "indigo" | "gold" | "plum" | "teal" | "clay" | "brand" | "neutral"

const INK: Record<Hue, string> = {
  indigo: "text-hue-indigo",
  gold: "text-hue-gold",
  plum: "text-hue-plum",
  teal: "text-hue-teal",
  clay: "text-hue-clay",
  brand: "text-brand",
  neutral: "text-muted-foreground",
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

/** Solid fill for a hue (progress bars, small markers). */
export const hueFill = (hue: Hue) => FILL[hue]

/** Each monthly deliverable keeps one icon and one hue everywhere on the page. */
export const DELIVERABLE_LOOK: Record<DeliverableKind, { icon: IconComponent; hue: Hue }> = {
  backlinks: { icon: Link2, hue: "teal" },
  articles: { icon: NotebookPen, hue: "indigo" },
  gbp_posts: { icon: Store, hue: "clay" },
  review_requests: { icon: Star, hue: "gold" },
  ai_fixes: { icon: Radar, hue: "plum" },
}

export const KEYWORDS_LOOK = { icon: ChartNoAxesColumn, hue: "brand" } as const

/**
 * A two-tone icon in an accent hue (identity) or a status tone, standing on its own:
 * no tile or box behind it. Default size 20 px; pass a size class to change it.
 */
export function HueIcon({
  icon: Icon,
  hue = "neutral",
  tone,
  className,
}: {
  icon: IconComponent
  hue?: Hue
  tone?: Tone
  className?: string
}) {
  return (
    <Icon
      aria-hidden
      className={cn("size-5 shrink-0", tone ? toneText(tone) : INK[hue], className)}
    />
  )
}
