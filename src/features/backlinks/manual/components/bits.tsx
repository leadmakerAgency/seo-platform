"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { StatusTag } from "@/components/common/status"
import { cn } from "@/lib/utils"
import {
  LINK_LABELS,
  PRICING_META,
  STATUS_META,
  type CatalogPricing,
  type LinkKind,
  type SubmissionStatus,
} from "../constants"

/** Small display pieces shared by the Manual Search views. */

export function StatusPill({ status }: { status: SubmissionStatus }) {
  const m = STATUS_META[status]
  return <StatusTag tone={m.tone}>{m.label}</StatusTag>
}

export function PricingTag({
  pricing,
  note,
  className,
}: {
  pricing: CatalogPricing
  note?: string | null
  className?: string
}) {
  const m = PRICING_META[pricing]
  return (
    <StatusTag tone={m.tone} dot={false} className={className}>
      <span title={note ?? m.help}>{m.label}</span>
    </StatusTag>
  )
}

export function LinkTag({ kind, actual = false }: { kind: LinkKind | null; actual?: boolean }) {
  if (!kind) return <span className="text-muted-foreground">—</span>
  const tone =
    kind === "follow" ? "success" : kind === "nofollow" || kind === "none" ? "neutral" : "info"
  return (
    <StatusTag tone={tone} dot={actual}>
      {LINK_LABELS[kind]}
      {!actual && kind !== "none" && kind !== "unknown" && (
        <span className="font-normal opacity-70">(usual)</span>
      )}
    </StatusTag>
  )
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode
  tone?: "neutral" | "brand" | "warning"
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm px-1.5 text-xs whitespace-nowrap",
        tone === "brand"
          ? "bg-brand-soft text-brand"
          : tone === "warning"
            ? "bg-warning-soft text-warning"
            : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      disabled={!value}
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        } catch {
          toast.error("Couldn't copy. Select the text instead.")
        }
      }}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35 disabled:opacity-40"
    >
      {done ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  )
}

const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})
/** "Nov 20, 2026" for a plain YYYY-MM-DD date. */
export const formatPlainDay = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`))

const dayTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Phoenix",
})
export const formatStamp = (iso: string) => dayTime.format(new Date(iso))

export const money = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v)
