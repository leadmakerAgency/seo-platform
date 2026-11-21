import { Check, CircleAlert, Circle, Lock, MapPin, Settings2, Target as TargetIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { BUYER_META, BUYERS, mixLabel, OFFERING_META, OFFERINGS, REACH_META, REACHES, topicCount } from "../brief"
import type { BacklinkSetup } from "../setup"
import { splitMissing } from "../setup-rules"
import { OpenSetupButton } from "./setup-sheet"

/**
 * The backlink setup above the tabs (docs/plans/backlinks/12-shared-setup.md): a slim summary bar
 * when the setup is complete, and the gate that locks the tabs when it isn't.
 */

const placesLine = (setup: BacklinkSetup) => {
  const active = setup.targets.filter((t) => t.active).map((t) => t.label)
  if (!active.length) return "No places"
  return active.length <= 3 ? active.join(" · ") : `${active.slice(0, 3).join(" · ")} · +${active.length - 3} more`
}

export function SetupBar({ setup }: { setup: BacklinkSetup }) {
  const b = setup.brief
  const canEdit = setup.canEditBrief || setup.canEditPlaces
  return (
    <section
      aria-label="Backlink setup"
      className="-mt-2 flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1.5 text-sm">
        <p className="flex min-w-0 items-start gap-2">
          <TargetIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0">
            <span className="font-medium">Brief v{b?.version ?? 1}</span>
            <span className="text-muted-foreground">
              {b
                ? ` · ${mixLabel(b.reach, REACHES, REACH_META)} · ${mixLabel(b.buyer, BUYERS, BUYER_META)} · ${mixLabel(b.offering, OFFERINGS, OFFERING_META)} · ${topicCount(b)} topics`
                : ""}
            </span>
          </span>
        </p>
        <p className="flex min-w-0 items-start gap-2">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0">
            <span className="font-medium">Places</span>
            <span className="text-muted-foreground"> · {placesLine(setup)}</span>
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden items-center gap-1 text-xs text-success sm:flex">
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
          Set up
        </span>
        <OpenSetupButton step="brief" className="w-full sm:w-auto">
          <Settings2 /> {canEdit ? "Edit setup" : "View setup"}
        </OpenSetupButton>
      </div>
    </section>
  )
}

export function SetupGate({ setup, clientName }: { setup: BacklinkSetup; clientName: string }) {
  const { brief: briefMissing, places: placeMissing } = splitMissing(setup.missing)
  const briefDone = Boolean(setup.brief) && briefMissing.length === 0
  const placesDone = Boolean(setup.brief) && placeMissing.length === 0
  const vaBlocked = !setup.brief && !setup.canEditBrief
  const next = !briefDone ? "brief" : "places"
  const steps = [
    {
      n: 1,
      title: "Strategy brief",
      done: briefDone,
      detail: briefDone
        ? `Version ${setup.brief?.version}`
        : setup.brief
          ? briefMissing.join(". ")
          : "Not written yet: who buys, where they are, what the client sells and 10–15 topics",
    },
    {
      n: 2,
      title: "Where the client wants to be found",
      done: placesDone,
      detail: !setup.brief
        ? "After the brief: the cities, regions or countries to search from"
        : placesDone
          ? placesLine(setup)
          : placeMissing.join(". "),
    },
  ]

  return (
    <section
      aria-labelledby="setup-gate-title"
      className="-mt-2 overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex flex-col gap-1 border-b bg-gradient-to-br from-brand-soft/60 to-transparent px-5 py-4">
        <h2 id="setup-gate-title" className="flex items-center gap-2 text-[15px] leading-[22px] font-semibold">
          <Lock className="size-4 text-muted-foreground" aria-hidden />
          Set up backlinks for {clientName}
        </h2>
        <p className="max-w-[70ch] text-sm text-muted-foreground">
          Every search (Standard, Shockwave AI and Manual) is built from this setup, so the tabs open once it&apos;s
          done. It takes about 5 minutes.
        </p>
      </div>
      <ol className="flex flex-col divide-y">
        {steps.map((s) => (
          <li key={s.n} className="flex items-start gap-3 px-5 py-3">
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                s.done ? "border-success bg-success text-white" : "bg-background text-muted-foreground",
              )}
            >
              {s.done ? <Check className="size-3.5" strokeWidth={3} /> : s.n}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium">
                {s.title}
                <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
              </p>
              <p className={cn("text-[13px]", s.done ? "text-muted-foreground" : "text-warning")}>
                {!s.done && <Circle className="mr-1.5 mb-0.5 inline size-3" aria-hidden />}
                {s.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        {vaBlocked ? (
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <CircleAlert className="size-3.5 shrink-0" aria-hidden />
            Only an admin or manager can write the brief.
          </p>
        ) : (
          <span />
        )}
        <OpenSetupButton step={next} variant="default" size="default" className="w-full sm:w-auto">
          {vaBlocked ? "View setup" : setup.brief ? "Continue setup" : "Start setup"}
        </OpenSetupButton>
      </div>
    </section>
  )
}
