"use client"

import { Check, ChevronsUpDown } from "@/components/icons"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { COMMON_COUNTRIES, COUNTRIES, countryName, countrySearchText } from "@/lib/countries"
import { cn } from "@/lib/utils"

/**
 * Every country, searchable by name, code or common name ("UK", "USA", "UAE"). The usual
 * countries are pinned at the top. `allowAny` adds an "Any country" choice (filters).
 */
export function CountryPicker({
  id,
  value,
  onChange,
  allowAny = false,
  anyLabel = "Any country",
  invalid,
  className,
}: {
  id?: string
  value: string
  onChange: (code: string) => void
  allowAny?: boolean
  anyLabel?: string
  invalid?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const pick = (code: string) => {
    onChange(code)
    setOpen(false)
  }
  const item = (code: string, name: string) => (
    <CommandItem key={code} value={code} keywords={[countrySearchText(code)]} onSelect={() => pick(code)}>
      <span className="flex-1">{name}</span>
      <span className="text-xs text-muted-foreground">{code}</span>
      <Check className={cn("size-4", value === code ? "opacity-100" : "opacity-0")} aria-hidden />
    </CommandItem>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">{value ? countryName(value) : allowAny ? anyLabel : "Choose a country"}</span>
          <ChevronsUpDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command
          filter={(itemValue, search, keywords) =>
            (keywords?.join(" ") ?? itemValue).includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search countries" />
          <CommandList className="max-h-72">
            <CommandEmpty>No country found.</CommandEmpty>
            {allowAny && (
              <CommandGroup>
                <CommandItem value="__any" keywords={["any all"]} onSelect={() => pick("")}>
                  <span className="flex-1">{anyLabel}</span>
                  <Check className={cn("size-4", value === "" ? "opacity-100" : "opacity-0")} aria-hidden />
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Most used">{COMMON_COUNTRIES.map((c) => item(c.code, c.name))}</CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="All countries">
              {COUNTRIES.filter((c) => !COMMON_COUNTRIES.some((x) => x.code === c.code)).map((c) =>
                item(c.code, c.name),
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
