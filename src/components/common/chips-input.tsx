"use client"

import { X } from "@/components/icons"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * A list of short texts (services, service areas…): type and press Enter or a comma to add,
 * × to remove. Duplicates (ignoring case) are skipped.
 */
export function ChipsInput({
  id,
  values,
  onChange,
  placeholder,
  max = 50,
  maxLength = 120,
  invalid,
}: {
  id: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  max?: number
  maxLength?: number
  invalid?: boolean
}) {
  const [draft, setDraft] = useState("")
  const add = (text = draft) => {
    const lower = new Set(values.map((v) => v.toLowerCase()))
    const next = text
      .split(/[,\n]/)
      .map((t) => t.trim().replace(/\s+/g, " ").slice(0, maxLength))
      .filter((t) => {
        if (!t || lower.has(t.toLowerCase())) return false
        lower.add(t.toLowerCase())
        return true
      })
    if (next.length) onChange([...values, ...next].slice(0, max))
    setDraft("")
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            const v = e.target.value
            if (v.includes(",")) add(v)
            else setDraft(v)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1))
            }
          }}
          onBlur={() => draft.trim() && add()}
          placeholder={values.length >= max ? `${max} at most` : placeholder}
          disabled={values.length >= max}
        />
        <Button type="button" variant="outline" onClick={() => add()} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Added">
          {values.map((v) => (
            <li
              key={v}
              className={cn("inline-flex h-[24px] items-center gap-1 rounded-sm bg-brand-soft pr-1 pl-2 text-xs text-brand")}
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="rounded-sm p-0.5 hover:bg-background/60"
                aria-label={`Remove ${v}`}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
