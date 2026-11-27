import { ArrowDown, ArrowUp } from "@/components/icons"

import { StatusTag } from "@/components/common/status"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { difficultyWord, INTENT_META, NOT_FOUND, type Engine, type Intent } from "../constants"

/** Small display pieces shared by the Rankings tabs. */

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "America/Phoenix",
})
const shortDay = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "America/Phoenix" })

/** "Mon, Nov 9" (agency time). */
export const formatCheckDay = (iso: string) => dayFormatter.format(new Date(iso))
/** "Nov 9" (agency time). */
export const formatShortDay = (iso: string) => shortDay.format(new Date(iso))

export const formatVolume = (v: number | null) => (v === null ? "—" : formatNumber(v))

export const formatUsd = (v: number, digits = 2) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)

export function IntentTag({ intent }: { intent: Intent | null }) {
  if (!intent) return null
  const meta = INTENT_META[intent]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex outline-none">
          <StatusTag tone={meta.tone} dot={false}>
            {meta.label}
          </StatusTag>
        </span>
      </TooltipTrigger>
      <TooltipContent>{meta.explain}</TooltipContent>
    </Tooltip>
  )
}

/**
 * A position with the change since the previous check. Lower is better, so moving from 8
 * to 5 is "up 3". Not found is "—" with a tooltip, never 0.
 */
export function Position({
  engine,
  position,
  previous,
  checked,
  className,
}: {
  engine: Engine
  position: number | null
  previous: number | null
  /** False when the keyword has never been checked on this engine. */
  checked: boolean
  className?: string
}) {
  if (!checked) return <span className="text-muted-foreground">Not checked yet</span>
  if (position === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn("text-muted-foreground outline-none", className)}>
            —
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {NOT_FOUND[engine]}
          {previous !== null ? ` (was ${previous})` : ""}
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 tabular-nums", className)}>
      <span className="font-medium">{position}</span>
      <Change position={position} previous={previous} />
    </span>
  )
}

export function Change({ position, previous }: { position: number | null; previous: number | null }) {
  if (position === null) return null
  if (previous === null) return <span className="text-xs text-muted-foreground">new</span>
  const diff = previous - position
  if (diff === 0) return null
  const up = diff > 0
  return (
    <span
      className={cn("inline-flex items-center text-xs font-medium", up ? "text-success" : "text-danger")}
      aria-label={up ? `up ${diff}` : `down ${-diff}`}
    >
      {up ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
      {Math.abs(diff)}
    </span>
  )
}

/** Difficulty 0–100 as a word plus the number. */
export function Difficulty({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  const word = difficultyWord(value)
  return (
    <span className="tabular-nums">
      {value} <span className="text-muted-foreground">{word}</span>
    </span>
  )
}

export function SourceTags({ sources }: { sources: string[] }) {
  const LABEL: Record<string, string> = {
    ranked: "Already ranking",
    ideas: "Ideas",
    suggestions: "Ideas",
    related: "Related",
    competitor: "Competitors",
    tracked: "Tracked",
  }
  const labels = [...new Set(sources.map((s) => LABEL[s]).filter(Boolean))]
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span key={l} className="rounded-sm bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
          {l}
        </span>
      ))}
    </span>
  )
}
