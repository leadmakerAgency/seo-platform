"use client"

import { CircleAlert, IdCard } from "@/components/icons"

import { cn } from "@/lib/utils"
import type { KitField } from "../listing-kit"
import { CopyButton } from "./bits"

/**
 * The client's details with a copy button each, so every directory gets exactly the same name,
 * address and phone. Used on the tab (collapsible) and in the listing sheet (compact).
 */
export function ListingKit({
  fields,
  missing,
  editHref,
  compact = false,
}: {
  fields: KitField[]
  missing: string[]
  editHref: string
  compact?: boolean
}) {
  const shown = compact
    ? fields.filter((f) => f.value && f.key !== "desc_long" && f.key !== "desc_medium")
    : fields
  return (
    <div className="flex flex-col gap-3">
      {missing.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px] text-warning">
          {missing.map((m) => (
            <li key={m} className="flex items-start gap-1.5">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {m}{" "}
                <a href={editHref} className="underline underline-offset-2">
                  Edit details
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}
      <dl className={cn("grid gap-x-6 gap-y-2", !compact && "sm:grid-cols-2")}>
        {shown.map((f) => (
          <div
            key={f.key}
            className={cn(
              "flex min-w-0 items-start gap-2 rounded-md border px-3 py-2",
              f.key.startsWith("desc") && !compact && "sm:col-span-2",
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">
                {f.label}
                {f.value && (f.key.startsWith("desc") || f.key === "name") && (
                  <span className="ml-1.5 tabular-nums">· {f.value.length} chars</span>
                )}
              </dt>
              <dd
                className={cn(
                  "text-[13px] break-words",
                  !f.value && "text-muted-foreground italic",
                  f.key.startsWith("desc") && "whitespace-pre-line",
                )}
              >
                {f.value || "Not in the profile"}
              </dd>
              {f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
            </div>
            <CopyButton value={f.value} label={f.label} />
          </div>
        ))}
      </dl>
    </div>
  )
}

export function ListingKitPanel(props: {
  fields: KitField[]
  missing: string[]
  editHref: string
}) {
  return (
    <details
      className="group rounded-lg border bg-card"
      open={props.missing.length > 0 ? true : undefined}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden">
        <IdCard className="size-4 text-muted-foreground" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] leading-[22px] font-semibold">Listing kit</span>
          <span className="text-[13px] text-muted-foreground">
            Copy these exact details into every site. A different name or phone number on one site
            hurts local rankings.
          </span>
        </span>
        <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
        <span className="hidden text-xs text-muted-foreground group-open:inline">Hide</span>
      </summary>
      <div className="border-t px-4 py-4">
        <ListingKit {...props} />
      </div>
    </details>
  )
}
