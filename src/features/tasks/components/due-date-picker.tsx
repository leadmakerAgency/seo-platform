"use client"

import { CalendarDays, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { addDays, agencyToday, dateToIso, formatDay, isoToDate } from "@/lib/dates"
import { cn } from "@/lib/utils"

/** Date picker for YYYY-MM-DD values, with quick picks for today and tomorrow. */
export function DueDatePicker({
  value,
  onChange,
  id,
  disabled,
  className,
  invalid,
}: {
  value: string | null
  onChange: (value: string | null) => void
  id?: string
  disabled?: boolean
  className?: string
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const today = agencyToday()

  function pick(next: string | null) {
    onChange(next)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-invalid={invalid}
          className={cn(
            "w-full justify-start gap-2 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays />
          {value ? formatDay(value) : "No due date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex gap-1.5 border-b p-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => pick(today)}>
            Today
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => pick(addDays(today, 1))}
          >
            Tomorrow
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => pick(addDays(today, 7))}
          >
            In a week
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" onClick={() => pick(null)}>
              <X />
              Clear
            </Button>
          )}
        </div>
        <Calendar
          mode="single"
          selected={value ? isoToDate(value) : undefined}
          defaultMonth={value ? isoToDate(value) : isoToDate(today)}
          onSelect={(date) => pick(date ? dateToIso(date) : null)}
          weekStartsOn={1}
        />
      </PopoverContent>
    </Popover>
  )
}
