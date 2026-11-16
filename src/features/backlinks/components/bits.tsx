import { StatusTag } from "@/components/common/status"
import { cn } from "@/lib/utils"
import { spamBand, strengthBand, TYPE_LABELS, type DirectoryType } from "../constants"
import type { Place } from "../queries"

/** Small display pieces shared by the Backlinks views. */

const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/Phoenix",
})
const dayTime = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Phoenix",
})

/** "$0.14" */
export const usd = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)

/** "Nov 9" (agency time). */
export const formatDay = (iso: string) => day.format(new Date(iso))
/** "Mon, Nov 9, 3:05 PM" (agency time). */
export const formatDayTime = (iso: string) => dayTime.format(new Date(iso))

export function TypeTag({ type }: { type: DirectoryType }) {
  return (
    <span className="inline-flex h-5 items-center rounded-sm bg-muted px-1.5 text-xs whitespace-nowrap text-muted-foreground">
      {TYPE_LABELS[type]}
    </span>
  )
}

export function Strength({
  place,
  className,
}: {
  place: Pick<Place, "authority" | "authorityStatus">
  className?: string
}) {
  const band = strengthBand(place.authority, place.authorityStatus)
  if (!band)
    return <span className={cn("text-[13px] text-muted-foreground", className)}>Not checked</span>
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {place.authority !== null && (
        <span className="font-medium tabular-nums">{place.authority}</span>
      )}
      <StatusTag tone={band.tone}>{band.label}</StatusTag>
    </span>
  )
}

export function Spam({ spam }: { spam: number | null }) {
  const band = spamBand(spam)
  if (!band)
    return spam === null ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span className="text-muted-foreground tabular-nums">{spam}</span>
    )
  return (
    <StatusTag tone={band.tone}>
      {band.label} <span className="tabular-nums">{spam}</span>
    </StatusTag>
  )
}

/** "Found by 3 searches: 'hvac peoria az directory' #2" / "Core listing". */
export function whyChosen(place: Pick<Place, "isCore" | "hits" | "searches" | "isLocal">): string {
  const parts: string[] = []
  if (place.hits.length > 0) {
    const best = place.hits[0]
    const more = place.searches > 1 ? ` + ${place.searches - 1} more` : ""
    parts.push(`Found for "${best.query}"${best.position ? ` (#${best.position})` : ""}${more}`)
  }
  if (place.isCore) parts.push(place.hits.length ? "core listing" : "Core listing for every client")
  if (place.isLocal && place.hits.length) parts.push("local")
  return parts.join(" · ") || "Added by a search"
}
