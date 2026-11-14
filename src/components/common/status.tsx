import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * One tone per meaning (docs/design-system.md, "Status map"). Components pick
 * a tone, never colour classes, so every status looks the same everywhere.
 */
export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info"

const TAG: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
}

const DOT: Record<Tone, string> = {
  neutral: "bg-neutral-dot",
  brand: "bg-primary",
  success: "bg-success-dot",
  warning: "bg-warning-dot",
  danger: "bg-danger-dot",
  info: "bg-info-dot",
}

const TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  brand: "text-brand",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
}

/** Text colour for a tone (counts, inline status words). */
export function toneText(tone: Tone) {
  return TEXT[tone]
}

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[tone], className)} />
}

/** A status tag: soft background, signal dot, dark text of the same tone. */
export function StatusTag({
  tone,
  children,
  dot = true,
  className,
}: {
  tone: Tone
  children: ReactNode
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-sm px-1.5 text-xs font-medium whitespace-nowrap",
        TAG[tone],
        className,
      )}
    >
      {dot && <StatusDot tone={tone} />}
      {children}
    </span>
  )
}
