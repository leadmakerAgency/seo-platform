"use client"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { regionLabel, regionList } from "@/lib/regions"

/**
 * State / province / county for the chosen country: a list for the US, Canada and
 * Australia (saved as the short code, "AZ"), free text everywhere else.
 */
export function RegionInput({
  id,
  country,
  value,
  onChange,
  invalid,
}: {
  id: string
  country: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}) {
  const list = regionList(country)
  if (!list) {
    return (
      <Input
        id={id}
        value={value}
        maxLength={80}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="address-level1"
      />
    )
  }
  return (
    <Select value={list.some((r) => r.code === value) ? value : ""} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined}>
        <SelectValue placeholder={`Choose a ${regionLabel(country).toLowerCase()}`} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {list.map((r) => (
          <SelectItem key={r.code} value={r.code}>
            {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
