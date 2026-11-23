"use client"

import { CircleAlert, Clock, Database, Network, Wallet } from "@/components/icons"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { startCompetitorBacklinks } from "../actions"
import { MAX_COMPETITORS, MIN_COMPETITORS } from "../competitors"
import { planGap } from "../config"
import type { AiQuota } from "../queries"

const SITE_CAPS = [50, 100, 150, 250, 500]

/**
 * Competitor backlinks on its own (plan 11 §1.3): which competitors, how many of them a site must
 * link to, how many sites at most, and what it costs. The server checks it all again.
 */
export function CompetitorBacklinksButton({
  clientId,
  quota,
  preselected,
  unsaved,
  canRefresh,
  disabledReason,
}: {
  clientId: string
  quota: AiQuota
  preselected: string[]
  unsaved: boolean
  canRefresh: boolean
  disabledReason: string | null
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [minShared, setMinShared] = useState(quota.gapMinShared)
  const [maxSites, setMaxSites] = useState(quota.gapMaxSites)
  const [refresh, setRefresh] = useState(false)
  const [pending, startTransition] = useTransition()

  const options = [...new Set([...preselected, ...quota.competitors.map((c) => c.domain)])].slice(0, 12)
  const mode = quota.gapFallback ? "ai_only" : "dataforseo"
  const plan = planGap({ competitors: picked.size, maxSites, mode, searchPrice: quota.webSearchPrice })
  const cachedRecently = Boolean(quota.gapCachedAt) && !refresh
  const limitHit = quota.gapLimit > 0 && quota.gapUsed >= quota.gapLimit
  const reason =
    disabledReason ??
    (limitHit ? `This client has used its ${quota.gapLimit} competitor backlink searches this month.` : null) ??
    (options.length < MIN_COMPETITORS ? `Add at least ${MIN_COMPETITORS} competitors first.` : null)
  const overCap = plan.estimateUsd > quota.maxRunUsd

  function openDialog() {
    setPicked(new Set(preselected.slice(0, MAX_COMPETITORS)))
    setRefresh(false)
    setOpen(true)
  }

  function start() {
    startTransition(async () => {
      const r = await startCompetitorBacklinks(clientId, [...picked], {
        minShared,
        includeSingle: minShared === 1,
        maxSites,
        refresh,
        aiOnly: mode === "ai_only",
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success("Looking at where the competitors get their links. Results appear here in a few minutes.")
      setOpen(false)
    })
  }

  const button = (
    <Button size="sm" onClick={openDialog} disabled={Boolean(reason)} className="gap-1.5">
      <Network className="size-3.5" aria-hidden />
      Competitor backlinks
    </Button>
  )

  return (
    <>
      {reason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex outline-none">
              {button}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">{reason}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Network className="size-4 text-brand" aria-hidden />
              Competitor backlinks
            </DialogTitle>
            <DialogDescription>
              Finds the sites that link to these competitors but not to the client, opens each linking page, and says
              whether the client can get the same link. The best go to the top 30.
            </DialogDescription>
          </DialogHeader>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Competitors to compare</h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {options.map((d) => {
                const checked = picked.has(d)
                const full = !checked && picked.size >= MAX_COMPETITORS
                return (
                  <Label
                    key={d}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 font-normal",
                      checked ? "border-primary/40 bg-brand-soft/50" : "hover:bg-muted/50",
                      full && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={full}
                      onCheckedChange={(c) =>
                        setPicked((prev) => {
                          const next = new Set(prev)
                          if (c) next.add(d)
                          else next.delete(d)
                          return next
                        })
                      }
                    />
                    <span className="truncate text-sm">{d}</span>
                  </Label>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {MIN_COMPETITORS}–{MAX_COMPETITORS} competitors.{unsaved ? " Your unsaved list changes aren't saved by this; save the list to keep them." : ""}
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Show sites that link to at least</h3>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={String(minShared)}
              onValueChange={(v) => v && setMinShared(Number(v))}
              className="justify-start"
            >
              {[1, 2, 3].map((n) => (
                <ToggleGroupItem key={n} value={String(n)} className="px-3">
                  {n === 1 ? "1 competitor" : `${n} competitors`}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {minShared === 1
                ? "Every site that links to any of them: more places, more noise."
                : `A site that links to ${minShared} or more competitors covers this market and links to businesses like the client.`}
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Sites to check at most</h3>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={String(maxSites)}
              onValueChange={(v) => v && setMaxSites(Number(v))}
              className="justify-start"
            >
              {SITE_CAPS.filter((n) => n <= quota.gapMaxSites).map((n) => (
                <ToggleGroupItem key={n} value={String(n)} className="px-3 tabular-nums">
                  {n}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </section>

          {canRefresh && quota.gapCachedAt && mode === "dataforseo" && (
            <Label className="flex items-start gap-2 font-normal">
              <Checkbox checked={refresh} onCheckedChange={(c) => setRefresh(Boolean(c))} className="mt-0.5" />
              <span className="text-sm">
                Pull fresh link data
                <span className="block text-xs text-muted-foreground">
                  Link data from {new Date(quota.gapCachedAt).toLocaleDateString()} is reused for the same competitors
                  (free). A fresh pull costs the full price.
                </span>
              </span>
            </Label>
          )}

          <section className={cn("grid grid-cols-3 divide-x divide-dashed rounded-lg border text-sm", overCap && "border-warning/50")}>
            <div className="flex flex-col gap-0.5 px-3 py-2.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Database className="size-3.5" aria-hidden />
                {mode === "dataforseo" ? "Link data" : "Web searches"}
              </span>
              <span className="font-mono font-semibold tabular-nums">
                {mode === "dataforseo" ? (cachedRecently ? "≤ " : "") + `$${plan.dfsUsd.toFixed(2)}` : plan.searches}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 px-3 py-2.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wallet className="size-3.5" aria-hidden />
                Estimated cost
              </span>
              <span className={cn("font-mono font-semibold tabular-nums", overCap && "text-warning")}>≈ ${plan.estimateUsd.toFixed(2)}</span>
            </div>
            <div className="flex flex-col gap-0.5 px-3 py-2.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" aria-hidden />
                Takes about
              </span>
              <span className="font-mono font-semibold tabular-nums">
                {plan.minutes[0]}–{plan.minutes[1]} min
              </span>
            </div>
          </section>
          {mode === "ai_only" ? (
            <p className="-mt-2 flex gap-1.5 text-xs text-warning">
              <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {quota.gapFallback}. Claude searches the competitors&apos; names instead: results are estimated from
              mentions, without the &quot;links to N of {picked.size || MAX_COMPETITORS}&quot; count.
            </p>
          ) : (
            <p className="-mt-2 text-xs text-muted-foreground">
              DataForSEO link data
              {cachedRecently ? " (reused free when these competitors were pulled in the last 30 days)" : ""}, then Claude
              Haiku checks and judges each linking page. {quota.gapUsed}/{quota.gapLimit} competitor runs used this month.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={start} disabled={pending || picked.size < MIN_COMPETITORS || overCap}>
              {pending ? "Starting…" : "Find their backlinks"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
