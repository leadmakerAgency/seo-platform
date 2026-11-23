"use client"

import { Pencil } from "@/components/icons"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { setAnthropicCredit } from "../actions"

/**
 * Admins type in the Anthropic credit balance from the console (its API has no balance call).
 * The page then counts down from it with every Claude call the app logs.
 */
export function AnthropicCreditEditor({ current }: { current: number | null }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(current !== null ? current.toFixed(2) : "")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amount = Number(value.replace(/[$,\s]/g, ""))
    if (!value.trim() || !Number.isFinite(amount)) {
      setError("Enter the balance in dollars, for example 98.50.")
      return
    }
    startTransition(async () => {
      const r = await setAnthropicCredit(amount)
      if (!r.ok) {
        setError(r.error)
        return
      }
      toast.success("Anthropic balance saved")
      setOpen(false)
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
          <Pencil className="size-3" aria-hidden />
          {current === null ? "Set balance" : "Update"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form onSubmit={save} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="anthropic-credit">Credit balance now</Label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                id="anthropic-credit"
                inputMode="decimal"
                autoComplete="off"
                className="pl-6 font-mono tabular-nums"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="98.50"
                aria-invalid={Boolean(error)}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Copy it from the Anthropic console, Settings › Billing. From now on the app subtracts each Claude call.
            </p>
            {error && (
              <p className="text-xs text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
