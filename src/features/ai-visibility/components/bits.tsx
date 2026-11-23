import { ArrowDownRight, ArrowUpRight, Bot, Globe, MessageSquare, Minus, Search, Sparkles, type IconComponent } from "@/components/icons"
import type { ReactNode } from "react"

import { toneText } from "@/components/common/status"
import { cn } from "@/lib/utils"
import { MODEL_META, SOURCE_TYPE_LABEL, type AivModel } from "../config"

/** Small shared pieces for the AI Visibility page. Generic icons only, never vendor logos. */

export const MODEL_ICON: Record<AivModel, IconComponent> = {
  chatgpt: MessageSquare,
  gemini: Sparkles,
  ai_overview: Search,
  ai_mode: Globe,
  claude: Bot,
  perplexity: Search,
}

export function ModelChip({ model, className }: { model: AivModel; className?: string }) {
  const Icon = MODEL_ICON[model]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border bg-card px-1.5 py-0.5 text-xs whitespace-nowrap", className)}>
      <Icon className="size-3 text-muted-foreground" aria-hidden />
      {MODEL_META[model]?.short ?? model}
    </span>
  )
}

/** The fixed colour of a tracked brand (validated --series-1…8; slot 0 is the client). */
export const seriesColor = (slot: number) => `var(--series-${(Math.max(0, slot) % 8) + 1})`

export function BrandDot({ slot, className }: { slot: number; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: seriesColor(slot) }} />
}

export const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? "–" : `${Number(v).toFixed(digits)}%`
export const fixed = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "–" : Number(v).toFixed(digits))

/** Change against the previous period. For position, lower is better. */
export function Change({ now, before, lowerIsBetter = false, unit = "" }: { now: number | null; before: number | null; lowerIsBetter?: boolean; unit?: string }) {
  if (now === null || before === null) return <span className="text-xs text-muted-foreground">No earlier data</span>
  const diff = Math.round((now - before) * 10) / 10
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="size-3" aria-hidden /> No change
      </span>
    )
  }
  const good = lowerIsBetter ? diff < 0 : diff > 0
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs tabular-nums", toneText(good ? "success" : "danger"))}>
      <Icon className="size-3" aria-hidden />
      {diff > 0 ? "+" : ""}
      {diff}
      {unit}
      <span className="sr-only">{good ? " (better)" : " (worse)"}</span>
    </span>
  )
}

/** KPI row in the StatStrip style (a segmented panel), for values that aren't filter links. */
export function KpiRow({ items, label }: { items: { key: string; label: string; value: string; note?: ReactNode; hint?: string }[]; label: string }) {
  return (
    <section
      aria-label={label}
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border",
        items.length >= 5 ? "md:grid-cols-3 lg:grid-cols-5" : "lg:grid-cols-4",
      )}
    >
      {items.map((i) => (
        <div key={i.key} className="flex flex-col gap-2 bg-card px-4 pt-3 pb-3.5 last:odd:col-span-2 md:last:odd:col-span-1" title={i.hint}>
          <span className="text-[13px] text-muted-foreground">{i.label}</span>
          <span className="font-heading text-[26px] leading-[30px] font-semibold tracking-tight tabular-nums">{i.value}</span>
          {i.note && <span className="-mt-1">{i.note}</span>}
        </div>
      ))}
    </section>
  )
}

export function TypeTag({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-xs whitespace-nowrap text-muted-foreground">
      {SOURCE_TYPE_LABEL[type as keyof typeof SOURCE_TYPE_LABEL] ?? type}
    </span>
  )
}

/** A sentiment score as a short word plus the number. */
export function sentimentWord(v: number | null) {
  if (v === null) return "–"
  return v >= 75 ? `Positive · ${Math.round(v)}` : v >= 55 ? `Neutral · ${Math.round(v)}` : `Negative · ${Math.round(v)}`
}

export function SectionCard({ title, description, actions, children, className }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-[15px] leading-[22px] font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
