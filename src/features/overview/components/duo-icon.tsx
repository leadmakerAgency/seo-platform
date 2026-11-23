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

/** One icon per monthly deliverable, the same everywhere on the page. */
export const DELIVERABLE_ICON: Record<DeliverableKind, IconComponent> = {
  backlinks: Link2,
  articles: NotebookPen,
  gbp_posts: Store,
  review_requests: Star,
  ai_fixes: Radar,
}

export const KEYWORDS_ICON = ChartNoAxesColumn

/**
 * An icon in the two icon colours (`icon-duo`: teal main part, apricot body), or in a status
 * tone when it signals one. It stands on its own: no tile or box behind it. Default 20 px.
 */
export function DuoIcon({
  icon: Icon,
  tone,
  className,
}: {
  icon: IconComponent
  tone?: Tone
  className?: string
}) {
  return (
    <Icon
      aria-hidden
      className={cn("size-5 shrink-0", tone ? toneText(tone) : "icon-duo", className)}
    />
  )
}
