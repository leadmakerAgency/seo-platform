"use client"

import { Check, ChevronDown, X } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { MODEL_META, type AivModel } from "../config"
import { aivHref, RANGES, type AivParams, type Range } from "../search-params"

/** The shared filter bar: date range, platforms, countries, tags (any / all) and topics, all in the URL. */

const RANGE_LABEL: Record<Exclude<Range, "custom">, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days" }

export function FilterBar({
  params,
  models,
  countries,
  tags,
  topics,
}: {
  params: AivParams
  models: AivModel[]
  countries: string[]
  tags: string[]
  topics: { id: string; name: string }[]
}) {
  const router = useRouter()
  const path = usePathname()
  const [pending, start] = useTransition()
  const go = (patch: Partial<AivParams>) => start(() => router.push(aivHref(path, params, patch), { scroll: false }))
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-70")} aria-busy={pending}>
      <div className="flex rounded-lg border bg-card p-0.5" role="group" aria-label="Date range">
        {(RANGES.filter((r) => r !== "custom") as Exclude<Range, "custom">[]).map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={params.range === r}
            onClick={() => go({ range: r })}
            className={cn(
              "h-7 rounded-md px-2.5 text-xs whitespace-nowrap transition-colors",
              params.range === r ? "bg-foreground text-background dark:bg-muted dark:text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>
      <Multi
        label="Platforms"
        options={models.map((m) => ({ value: m, label: MODEL_META[m].label }))}
        value={params.models}
        onToggle={(v) => go({ models: toggle(params.models, v as AivModel) })}
        onClear={() => go({ models: [] })}
      />
      {countries.length > 1 && (
        <Multi
          label="Countries"
          options={countries.map((c) => ({ value: c, label: c }))}
          value={params.countries}
          onToggle={(v) => go({ countries: toggle(params.countries, v) })}
          onClear={() => go({ countries: [] })}
        />
      )}
      {topics.length > 0 && (
        <Multi
          label="Topics"
          options={topics.map((t) => ({ value: t.id, label: t.name }))}
          value={params.topics}
          onToggle={(v) => go({ topics: toggle(params.topics, v) })}
          onClear={() => go({ topics: [] })}
        />
      )}
      {tags.length > 0 && (
        <Multi
          label="Tags"
          options={tags.map((t) => ({ value: t, label: t }))}
          value={params.tags}
          onToggle={(v) => go({ tags: toggle(params.tags, v) })}
          onClear={() => go({ tags: [], tagsAll: false })}
          footer={
            params.tags.length > 1 ? (
              <div className="flex gap-1 border-t p-2 text-xs">
                <Button size="xs" variant={params.tagsAll ? "ghost" : "secondary"} onClick={() => go({ tagsAll: false })}>Any tag</Button>
                <Button size="xs" variant={params.tagsAll ? "secondary" : "ghost"} onClick={() => go({ tagsAll: true })}>All tags</Button>
              </div>
            ) : null
          }
        />
      )}
    </div>
  )
}

function Multi({
  label,
  options,
  value,
  onToggle,
  onClear,
  footer,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string[]
  onToggle: (v: string) => void
  onClear: () => void
  footer?: React.ReactNode
}) {
  const chosen = options.filter((o) => value.includes(o.value))
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn(chosen.length > 0 && "border-primary/40 bg-brand-soft")}>
          {label}
          {chosen.length > 0 && <span className="rounded-sm bg-primary px-1 text-[11px] text-primary-foreground tabular-nums">{chosen.length}</span>}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <ul className="max-h-72 overflow-y-auto p-1" role="listbox" aria-multiselectable aria-label={label}>
          {options.map((o) => {
            const on = value.includes(o.value)
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => onToggle(o.value)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className={cn("flex size-4 items-center justify-center rounded-[4px] border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {footer}
        {chosen.length > 0 && (
          <div className="border-t p-1">
            <Button size="xs" variant="ghost" className="w-full justify-start" onClick={onClear}>
              <X /> Clear {label.toLowerCase()}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
