"use client"

import { Check, Search, X } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { HealthDot } from "@/features/clients/components/health-badge"
import { HEALTH_META, HEALTH_ORDER } from "@/features/clients/constants"
import { countryName } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ClientOption } from "../queries"

const ALL = "all"

/**
 * Pick the clients a task covers. Filters (country, industry, owner, health)
 * plus "Select all matching" cover groups like "US HVAC clients" or
 * "Clients looked after by Ana".
 */
export function ClientPicker({
  options,
  value,
  onChange,
}: {
  options: ClientOption[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const [q, setQ] = useState("")
  const [country, setCountry] = useState(ALL)
  const [industry, setIndustry] = useState(ALL)
  const [owner, setOwner] = useState(ALL)
  const [health, setHealth] = useState(ALL)

  const selected = useMemo(() => new Set(value), [value])
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options])

  const countries = useMemo(() => [...new Set(options.map((o) => o.country))].sort(), [options])
  const industries = useMemo(
    () =>
      [...new Set(options.map((o) => o.industry).filter((v): v is string => Boolean(v)))].sort(),
    [options],
  )
  const owners = useMemo(() => {
    const map = new Map<string, string>()
    for (const o of options) if (o.ownerId && o.ownerName) map.set(o.ownerId, o.ownerName)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [options])

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return options.filter((o) => {
      if (needle && !`${o.name} ${o.location}`.toLowerCase().includes(needle)) return false
      if (country !== ALL && o.country !== country) return false
      if (industry !== ALL && o.industry !== industry) return false
      if (owner !== ALL && o.ownerId !== owner) return false
      if (health !== ALL && o.health !== health) return false
      return true
    })
  }, [options, q, country, industry, owner, health])

  const unselectedMatches = matches.filter((m) => !selected.has(m.id))
  const filtersActive = q || country !== ALL || industry !== ALL || owner !== ALL || health !== ALL

  function toggle(id: string) {
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  if (options.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No clients yet. Add clients from the Dashboard first, or create this as an agency task with
        no clients.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {value.slice(0, 12).map((id) => {
            const c = byId.get(id)
            if (!c) return null
            return (
              <span
                key={id}
                className="inline-flex max-w-[200px] items-center gap-1 rounded-md bg-brand-soft py-0.5 pr-1 pl-2 text-xs text-primary"
              >
                <span className="truncate">{c.name}</span>
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="rounded p-0.5 hover:bg-primary/10"
                  aria-label={`Remove ${c.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            )
          })}
          {value.length > 12 && (
            <span className="text-xs text-muted-foreground">+{value.length - 12} more</span>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
            Clear all
          </Button>
        </div>
      )}

      <div className="rounded-lg border">
        <div className="flex flex-col gap-2 border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search clients by name or city"
              aria-label="Search clients"
              className="pl-8"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <FilterSelect label="Country" value={country} onChange={setCountry} all="Any country">
              {countries.map((c) => (
                <SelectItem key={c} value={c}>
                  {countryName(c)}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Industry"
              value={industry}
              onChange={setIndustry}
              all="Any industry"
            >
              {industries.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect label="Looked after by" value={owner} onChange={setOwner} all="Anyone">
              {owners.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect label="Status" value={health} onChange={setHealth} all="Any status">
              {HEALTH_ORDER.map((h) => (
                <SelectItem key={h} value={h}>
                  {HEALTH_META[h].label}
                </SelectItem>
              ))}
            </FilterSelect>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {matches.length} {matches.length === 1 ? "client" : "clients"}
              {filtersActive ? " match" : ""} · {value.length} selected
            </span>
            {unselectedMatches.length > 0 && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => onChange([...value, ...unselectedMatches.map((m) => m.id)])}
              >
                Select all {unselectedMatches.length} {filtersActive ? "matching" : ""}
              </Button>
            )}
          </div>
        </div>
        <ul className="max-h-[240px] overflow-y-auto p-1" role="listbox" aria-multiselectable>
          {matches.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No clients match.
            </li>
          )}
          {matches.map((o) => {
            const isSelected = selected.has(o.id)
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggle(o.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                    isSelected && "bg-brand-soft/60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded border",
                      isSelected && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {isSelected && <Check className="size-3" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{o.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {o.location}
                      {o.industry ? ` · ${o.industry}` : ""}
                    </span>
                  </span>
                  <HealthDot health={o.health} />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  all,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  all: string
  children: React.ReactNode
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{all}</SelectItem>
        {children}
      </SelectContent>
    </Select>
  )
}
