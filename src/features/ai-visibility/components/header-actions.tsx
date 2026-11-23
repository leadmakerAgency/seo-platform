"use client"

import { Download, Loader2, Play } from "@/components/icons"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { exportAiVisibility, runNow } from "../actions"
import { MODEL_META, planAiVisibility, type AivModel } from "../config"

export function RunNowButton({
  clientId,
  prompts,
  models,
  disabledReason,
  manualLeft,
}: {
  clientId: string
  prompts: number
  models: AivModel[]
  disabledReason: string | null
  manualLeft: number
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const plan = planAiVisibility({ prompts, models })
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={Boolean(disabledReason)} title={disabledReason ?? undefined}>
        <Play /> Run a check
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run an AI visibility check now</DialogTitle>
            <DialogDescription>
              Asks {prompts} {prompts === 1 ? "question" : "questions"} on {models.length} {models.length === 1 ? "platform" : "platforms"} and reads every answer.
              Results come in within about an hour.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <dt className="text-muted-foreground">Answers</dt>
            <dd className="text-right tabular-nums">{plan.answers}</dd>
            <dt className="text-muted-foreground">Platforms</dt>
            <dd className="text-right">{models.map((m) => MODEL_META[m].short).join(", ")}</dd>
            <dt className="text-muted-foreground">Estimated cost</dt>
            <dd className="text-right font-medium tabular-nums">about ${plan.estimateUsd.toFixed(2)}</dd>
            <dt className="text-muted-foreground">Manual checks left this month</dt>
            <dd className="text-right tabular-nums">{manualLeft}</dd>
          </dl>
          <p className="text-xs text-muted-foreground">The weekly check runs anyway; this one is extra.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await runNow(clientId)
                  if (!r.ok) return void toast.error(r.error)
                  toast.success("Check started. Answers come in over the next hour.")
                  setOpen(false)
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Play />} Start the check
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const KINDS = [
  { kind: "brands", label: "Brands and metrics" },
  { kind: "prompts", label: "Questions" },
  { kind: "chats", label: "Answers" },
  { kind: "sources", label: "Sources" },
  { kind: "gap", label: "Gap sites" },
] as const

export function ExportMenu({ clientId, clientSlug, filter }: { clientId: string; clientSlug: string; filter: Record<string, unknown> }) {
  const [pending, start] = useTransition()
  const download = (kind: (typeof KINDS)[number]["kind"]) =>
    start(async () => {
      const r = await exportAiVisibility(clientId, kind, filter)
      if (!r.ok) return void toast.error(r.error)
      const blob = new Blob([r.data.csv], { type: "text/csv;charset=utf-8" })
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `${clientSlug}-ai-visibility-${kind}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
    })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Download />} Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {KINDS.map((k) => (
          <DropdownMenuItem key={k.kind} onSelect={() => download(k.kind)}>
            {k.label} (CSV)
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
