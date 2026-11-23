"use client"

import { ArrowLeft, Check, CircleAlert, Settings2 } from "@/components/icons"
import { useSearchParams } from "next/navigation"
import { useCallback, useState, type ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { Brief, BriefSnapshot } from "../brief"
import type { Target } from "../queries"
import { placeNeeds, splitMissing } from "../setup-rules"
import { StrategyForm } from "./strategy-form"
import { TargetsPanel } from "./targets-panel"

/**
 * The backlink setup sheet (docs/plans/backlinks/12-shared-setup.md): step 1 the strategy brief,
 * step 2 the places. Opened with ?setup=brief|places. The URL changes through the History API, so
 * opening and closing don't re-render the page on the server; saving does (the actions refresh).
 */

export type SetupStep = "brief" | "places"
const isStep = (v: string | null): v is SetupStep => v === "brief" || v === "places"

export type SetupSheetData = {
  brief: BriefSnapshot | null
  draft: Brief
  ideasText: string
  targets: Target[]
  suggestions: string[]
  missing: string[]
  canEditBrief: boolean
  canEditPlaces: boolean
  defaultCountry: string
}

function setStepInUrl(step: SetupStep | null, mode: "push" | "replace") {
  const url = new URL(window.location.href)
  if (step) url.searchParams.set("setup", step)
  else url.searchParams.delete("setup")
  const next = `${url.pathname}${url.search}${url.hash}`
  if (mode === "push") window.history.pushState(null, "", next)
  else window.history.replaceState(null, "", next)
}

/** Opens the setup sheet on a step. */
export function OpenSetupButton({
  step,
  children,
  variant = "outline",
  size = "sm",
  className,
}: {
  step: SetupStep
  children: ReactNode
  variant?: "default" | "outline" | "ghost"
  size?: "sm" | "default"
  className?: string
}) {
  return (
    <Button variant={variant} size={size} className={className} onClick={() => setStepInUrl(step, "push")}>
      {children}
    </Button>
  )
}

/** Same as OpenSetupButton, as an inline text link. */
export function OpenSetupLink({ step, children }: { step: SetupStep; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => setStepInUrl(step, "push")}
      className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
    >
      {children}
    </button>
  )
}

export function SetupSheet({
  clientId,
  clientName,
  data,
  nowIso,
}: {
  clientId: string
  clientName: string
  data: SetupSheetData
  nowIso: string
}) {
  const params = useSearchParams()
  const raw = params.get("setup")
  const step: SetupStep | null = isStep(raw) ? (raw === "places" && !data.brief ? "brief" : raw) : null
  const [dirty, setDirty] = useState(false)
  // Leaving the brief with unsaved changes asks first: to close the sheet, or to go to the places.
  const [confirm, setConfirm] = useState<null | "close" | "places">(null)
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), [])

  const go = (s: SetupStep) => {
    setDirty(false)
    setStepInUrl(s, "replace")
  }
  const close = (force = false) => {
    if (!force && dirty && step === "brief") return setConfirm("close")
    setDirty(false)
    setConfirm(null)
    setStepInUrl(null, "replace")
  }

  const needs = placeNeeds(data.brief, data.targets)
  const { brief: briefMissing, places: placeMissing } = splitMissing(data.missing)
  const complete = data.missing.length === 0
  const briefDone = Boolean(data.brief) && briefMissing.length === 0
  const placesDone = Boolean(data.brief) && placeMissing.length === 0

  return (
    <>
      <Sheet open={step !== null} onOpenChange={(o) => !o && close()}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-3xl">
          <SheetHeader className="border-b px-4 py-4 pr-12 sm:px-6">
            <SheetTitle className="flex items-center gap-2">
              <Settings2 className="size-4 text-muted-foreground" aria-hidden />
              Backlink setup
            </SheetTitle>
            <SheetDescription>
              {clientName}. Every Backlinks tab (Standard, Shockwave AI and Manual) works from this brief and these places.
            </SheetDescription>
            <nav aria-label="Setup steps" className="mt-3">
              <ol className="flex items-center gap-2">
                <StepPill n={1} label="Strategy brief" active={step === "brief"} done={briefDone} onClick={() => step !== "brief" && go("brief")} />
                <li aria-hidden className="h-px w-6 shrink-0 bg-border sm:w-10" />
                <StepPill
                  n={2}
                  label="Where the client wants to be found"
                  short="Places"
                  active={step === "places"}
                  done={placesDone}
                  disabled={!data.brief}
                  disabledNote="Save the brief first"
                  onClick={() => step !== "places" && (dirty ? setConfirm("places") : go("places"))}
                />
              </ol>
            </nav>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {step === "brief" && (
              <StrategyForm
                key={data.brief?.version ?? 0}
                clientId={clientId}
                initial={data.draft}
                isNew={!data.brief}
                ideasText={data.ideasText}
                canEdit={data.canEditBrief}
                onSaved={() => go("places")}
                onCancel={() => close()}
                onDirtyChange={onDirtyChange}
              />
            )}
            {step === "brief" && !data.canEditBrief && (
              <p className="order-first mx-4 mt-4 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground sm:mx-6">
                <CircleAlert className="size-4 shrink-0" aria-hidden />
                Only an admin or manager can change the brief.
                {!data.brief && " Ask one to write it; you can add the places once it's saved."}
              </p>
            )}
            {step === "places" && (
              <div className="flex flex-col gap-4 px-4 pt-5 pb-8 sm:px-6">
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-[15px] leading-[22px] font-semibold">Where the client wants to be found</h2>
                  <p className="text-sm text-muted-foreground">
                    Every tab searches from these places. Add each city, region or country where the client wants
                    customers; the client&apos;s own address doesn&apos;t matter here. Places save as you add them.
                  </p>
                </div>
                <TargetsPanel
                  clientId={clientId}
                  targets={data.targets}
                  defaultCountry={data.defaultCountry}
                  suggestions={data.suggestions}
                  canEdit={data.canEditPlaces}
                  nowIso={nowIso}
                  needs={needs}
                  reach={data.brief?.reach}
                  heading={false}
                />
              </div>
            )}
          </div>

          {step === "places" && (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t px-4 py-3 sm:px-6">
              {!complete && (
                <p className="mr-auto flex min-w-0 items-start gap-1.5 text-[13px] text-warning">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>{data.missing.join(". ")}.</span>
                </p>
              )}
              <Button variant="outline" onClick={() => go("brief")}>
                <ArrowLeft /> Brief
              </Button>
              <Button onClick={() => close(true)} disabled={!complete} title={complete ? undefined : "Finish the checklist first"}>
                <Check /> Done
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard the brief changes?</AlertDialogTitle>
            <AlertDialogDescription>The changes to the brief aren&apos;t saved yet.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirm === "places") {
                  setConfirm(null)
                  go("places")
                } else close(true)
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function StepPill({
  n,
  label,
  short,
  active,
  done,
  disabled,
  disabledNote,
  onClick,
}: {
  n: number
  label: string
  short?: string
  active: boolean
  done: boolean
  disabled?: boolean
  disabledNote?: string
  onClick: () => void
}) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={disabled ? disabledNote : undefined}
        aria-current={active ? "step" : undefined}
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:opacity-50",
          active ? "border-primary/40 bg-brand-soft font-medium text-foreground" : "bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
            done ? "bg-success text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {done ? <Check className="size-3" strokeWidth={3} /> : n}
        </span>
        <span className="truncate">
          {short ? (
            <>
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </>
          ) : (
            label
          )}
        </span>
        {done && <span className="sr-only">(done)</span>}
      </button>
    </li>
  )
}
