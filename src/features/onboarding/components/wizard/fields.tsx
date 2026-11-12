"use client"

import { Check, CircleAlert, Loader2, Plus, X } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { DAYS, type DayKey, type Hours } from "../../constants"
import type { SaveState } from "./use-autosave"

/** A labelled field with help text and an error under it. */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  id?: string
  label: string
  hint?: ReactNode
  error?: string
  optional?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[15px] font-medium">
        {label}
        {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && (
        <p id={id ? `${id}-error` : undefined} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export const inputClass = "h-11 text-base"
export const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"

export function SaveIndicator({ state, message }: { state: SaveState; message: string | null }) {
  if (state === "idle") return null
  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 text-sm",
        state === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {state === "saving" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {state === "saved" && <Check className="size-3.5 text-success" aria-hidden />}
      {state === "error" && <CircleAlert className="size-3.5" aria-hidden />}
      {state === "saving"
        ? "Saving…"
        : state === "saved"
          ? "Saved"
          : (message ?? "Not saved yet. Retrying…")}
    </span>
  )
}

/** Type and press Enter (or comma) to add; tap × to remove. */
export function ChipsInput({
  id,
  value,
  onChange,
  placeholder,
  max = 50,
  invalid,
}: {
  id: string
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  max?: number
  invalid?: boolean
}) {
  const [draft, setDraft] = useState("")

  function add(raw: string) {
    const parts = raw
      .split(",")
      .map((p) => p.trim().slice(0, 120))
      .filter(Boolean)
    if (!parts.length) return
    const next = [...value]
    for (const p of parts) {
      if (next.length >= max) break
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p)
    }
    onChange(next)
    setDraft("")
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <li
              key={v}
              className="inline-flex items-center gap-1 rounded-md border bg-muted/50 py-1 pr-1 pl-2.5 text-sm"
            >
              {v}
              <button
                type="button"
                className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${v}`}
                onClick={() => onChange(value.filter((x) => x !== v))}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              add(draft)
            }
          }}
          onBlur={() => add(draft)}
          placeholder={placeholder}
          aria-invalid={invalid}
          className={inputClass}
        />
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => add(draft)}
          disabled={!draft.trim()}
        >
          <Plus />
          Add
        </Button>
      </div>
    </div>
  )
}

const DEFAULT_SLOT = { open: "08:00", close: "17:00" }

/** One row per day: closed, open with times, or open 24 hours. */
export function HoursEditor({
  value,
  onChange,
}: {
  value: Hours | null
  onChange: (next: Hours) => void
}) {
  const hours: Hours = value ?? {}

  function setDay(day: DayKey, slots: { open: string; close: string }[]) {
    onChange({ ...hours, [day]: slots })
  }

  return (
    <div className="flex flex-col divide-y rounded-lg border">
      {DAYS.map(({ key, label }) => {
        const slots = hours[key]
        const mode = !slots
          ? "unset"
          : slots.length === 0
            ? "closed"
            : isAllDay(slots)
              ? "24h"
              : "open"
        return (
          <div key={key} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
            <span className="w-28 shrink-0 text-[15px] font-medium">{label}</span>
            <select
              aria-label={`${label} hours`}
              className={cn(selectClass, "sm:w-40")}
              value={mode === "unset" ? "" : mode}
              onChange={(e) => {
                const m = e.target.value
                if (m === "closed") setDay(key, [])
                else if (m === "24h") setDay(key, [{ open: "00:00", close: "24:00" }])
                else if (m === "open")
                  setDay(key, [slots && slots.length && !isAllDay(slots) ? slots[0] : DEFAULT_SLOT])
              }}
            >
              <option value="" disabled>
                Choose…
              </option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="24h">Open 24 hours</option>
            </select>
            {mode === "open" && slots && (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  aria-label={`${label} opens`}
                  value={slots[0].open}
                  onChange={(e) =>
                    e.target.value && setDay(key, [{ ...slots[0], open: e.target.value }])
                  }
                  className={cn(inputClass, "w-32")}
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="time"
                  aria-label={`${label} closes`}
                  value={slots[0].close === "24:00" ? "23:59" : slots[0].close}
                  onChange={(e) =>
                    e.target.value && setDay(key, [{ ...slots[0], close: e.target.value }])
                  }
                  className={cn(inputClass, "w-32")}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const isAllDay = (slots: { open: string; close: string }[]) =>
  slots.length === 1 && slots[0].open === "00:00" && slots[0].close === "24:00"

/** A row of big choice buttons (radio semantics). */
export function ChoiceButtons<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | null | undefined
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 rounded-md border px-3.5 py-2 text-left text-[15px] transition-colors hover:bg-muted",
            value === o.value && "border-primary bg-brand-soft text-primary hover:bg-brand-soft",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
