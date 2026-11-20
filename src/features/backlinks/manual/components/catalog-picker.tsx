"use client"

import { ChevronDown, Plus, Search, TriangleAlert } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Strength } from "../../components/bits"
import { FILTER_LABELS, REJECT_LABELS, type FilterReason, type RejectReason } from "../../constants"
import { pickCatalogSites } from "../actions"
import {
  CATEGORIES,
  CATEGORY_LABELS,
  costsMoney,
  MAX_PICK,
  PRIORITY_LABELS,
  type CatalogCategory,
  type SubmissionStatus,
} from "../constants"
import type { Match } from "../match"
import type { OtherDecision } from "../queries"
import { Chip, LinkTag, PricingTag, StatusPill } from "./bits"

type Scope = "suggested" | "fits" | "all"

const reasonLabel = (r: string | null) =>
  r
    ? (REJECT_LABELS[r as RejectReason] ?? FILTER_LABELS[r as FilterReason] ?? r.replace(/_/g, " "))
    : null

export function CatalogPicker({
  clientId,
  clientName,
  matches,
  picked,
  decisions,
  hasBrief,
  open,
  onOpenChange,
}: {
  clientId: string
  clientName: string
  matches: Match[]
  /** directory id → submission status for sites already on the work list. */
  picked: Record<string, SubmissionStatus>
  decisions: OtherDecision[]
  hasBrief: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [q, setQ] = useState("")
  const [scope, setScope] = useState<Scope>("suggested")
  const [category, setCategory] = useState<"all" | CatalogCategory>("all")
  const [cost, setCost] = useState<"any" | "free" | "paid">("any")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const byDir = useMemo(() => new Map(decisions.map((d) => [d.directoryId, d])), [decisions])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return matches.filter((m) => {
      if (scope === "suggested" && !m.suggested) return false
      if (scope === "fits" && !m.fits) return false
      if (category !== "all" && m.site.category !== category) return false
      if (cost === "free" && costsMoney(m.site.pricing)) return false
      if (cost === "paid" && !costsMoney(m.site.pricing)) return false
      if (
        needle &&
        !`${m.site.name} ${m.site.host} ${CATEGORY_LABELS[m.site.category]}`
          .toLowerCase()
          .includes(needle)
      )
        return false
      return true
    })
  }, [matches, q, scope, category, cost])

  const blockedOf = (m: Match) => {
    const d = byDir.get(m.site.directoryId)
    return d && (d.status === "rejected" || d.status === "filtered") ? d : null
  }
  const selectable = (m: Match) => !picked[m.site.directoryId] && !blockedOf(m)
  const counts = {
    suggested: matches.filter((m) => m.suggested).length,
    fits: matches.filter((m) => m.fits).length,
    all: matches.length,
  }

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const m of visible) if (selectable(m) && next.size < MAX_PICK) next.add(m.site.id)
      return next
    })
  }

  function submit() {
    const ids = [...selected]
    startTransition(async () => {
      const r = await pickCatalogSites(clientId, ids)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      const added = r.data.added + r.data.approved
      const parts = [
        `Added ${formatNumber(added)} ${added === 1 ? "site" : "sites"} to the work list`,
      ]
      if (r.data.approved)
        parts.push(`${r.data.approved} were waiting in Standard Search and are now approved`)
      if (r.data.already) parts.push(`${r.data.already} were already on it`)
      toast.success(`${parts.join(". ")}.`)
      if (r.data.refused.length)
        toast.warning(
          `Not added: ${r.data.refused.map((x) => x.name).join(", ")} (rejected or hidden before for this client).`,
        )
      setSelected(new Set())
      onOpenChange(false)
    })
  }

  const paidSelected = matches.filter(
    (m) => selected.has(m.site.id) && costsMoney(m.site.pricing),
  ).length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>Add from the catalog</SheetTitle>
          <SheetDescription>
            {hasBrief
              ? `Sorted for ${clientName}: the countries of the brief's places, reach, buyers, what they sell and their industry.`
              : `Sorted for ${clientName} by country and industry. Write the strategy brief for sharper suggestions.`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 border-b px-4 py-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search sites"
              className="pl-8"
              aria-label="Search the catalog"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={scope}
              onValueChange={(v) => v && setScope(v as Scope)}
              aria-label="Which sites"
            >
              <ToggleGroupItem value="suggested">
                Suggested{" "}
                <span className="text-muted-foreground tabular-nums">{counts.suggested}</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="fits">
                All that fit{" "}
                <span className="text-muted-foreground tabular-nums">{counts.fits}</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="all">
                Every site <span className="text-muted-foreground tabular-nums">{counts.all}</span>
              </ToggleGroupItem>
            </ToggleGroup>
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger size="sm" className="w-[190px]" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every category</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={cost} onValueChange={(v) => setCost(v as typeof cost)}>
              <SelectTrigger size="sm" className="w-[130px]" aria-label="Cost">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any cost</SelectItem>
                <SelectItem value="free">Free only</SelectItem>
                <SelectItem value="paid">Costs money</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No catalog sites match. Try &ldquo;Every site&rdquo; or clear the search.
            </p>
          ) : (
            <ul className="divide-y">
              {visible.map((m) => {
                const s = m.site
                const pickedStatus = picked[s.directoryId]
                const blocked = blockedOf(m)
                const waiting = byDir.get(s.directoryId)
                const can = selectable(m)
                const expanded = openRow === s.id
                return (
                  <li key={s.id} className={cn("flex gap-3 px-4 py-3", !can && "bg-muted/40")}>
                    <Checkbox
                      className="mt-0.5"
                      checked={selected.has(s.id)}
                      disabled={!can || (!selected.has(s.id) && selected.size >= MAX_PICK)}
                      onCheckedChange={(v) => toggle(s.id, v === true)}
                      aria-label={`Add ${s.name}`}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium">{s.name}</span>
                        {s.host && <span className="text-xs text-muted-foreground">{s.host}</span>}
                        {s.kind === "play" && <Chip tone="brand">Play</Chip>}
                        {pickedStatus && <StatusPill status={pickedStatus} />}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PricingTag pricing={s.pricing} note={s.priceNote} />
                        <LinkTag kind={s.typicalLink} />
                        <Chip>{CATEGORY_LABELS[s.category]}</Chip>
                        {m.reasons.map((r) => (
                          <Chip key={r} tone={r === "Must-have" ? "brand" : "neutral"}>
                            {r}
                          </Chip>
                        ))}
                        {!m.fits && m.misfit && <Chip tone="warning">{m.misfit}</Chip>}
                        <Strength
                          place={{ authority: s.authority, authorityStatus: s.authorityStatus }}
                          className="text-xs"
                        />
                      </div>
                      {s.priceNote && costsMoney(s.pricing) && (
                        <p className="text-xs text-muted-foreground">{s.priceNote}</p>
                      )}
                      {m.warnings.filter((w) => w !== s.priceNote).length > 0 && (
                        <p className="flex items-start gap-1 text-xs text-warning">
                          <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
                          {m.warnings.filter((w) => w !== s.priceNote).join(" · ")}
                        </p>
                      )}
                      {blocked && (
                        <p className="text-xs text-muted-foreground">
                          {blocked.status === "rejected" ? "Rejected" : "Hidden"} for this client
                          before
                          {reasonLabel(blocked.reason) ? ` (${reasonLabel(blocked.reason)})` : ""}.
                          Restore it in Standard Search to add it.
                        </p>
                      )}
                      {!pickedStatus && !blocked && waiting && (
                        <p className="text-xs text-muted-foreground">
                          Already found by{" "}
                          {waiting.source === "ai" ? "Shockwave AI" : "Standard Search"}; adding it
                          approves it there too.
                        </p>
                      )}
                      {(s.howTo || s.warnings || s.notes || s.submitUrl || s.homeUrl) && (
                        <button
                          type="button"
                          onClick={() => setOpenRow(expanded ? null : s.id)}
                          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          aria-expanded={expanded}
                        >
                          <ChevronDown
                            className={cn("size-3 transition-transform", expanded && "rotate-180")}
                            aria-hidden
                          />
                          How it works · {PRIORITY_LABELS[s.priority]}
                        </button>
                      )}
                      {expanded && (
                        <div className="flex flex-col gap-1.5 rounded-md border bg-card p-3 text-[13px]">
                          {s.howTo && <p className="whitespace-pre-line">{s.howTo}</p>}
                          {s.notes && <p className="text-muted-foreground">{s.notes}</p>}
                          {s.warnings && <p className="text-warning">{s.warnings}</p>}
                          {(s.submitUrl || s.homeUrl) && (
                            <a
                              href={s.submitUrl || s.homeUrl || undefined}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="w-fit text-brand underline underline-offset-2"
                            >
                              Open the start page
                            </a>
                          )}
                          {!s.verifiedAt && (
                            <p className="text-xs text-muted-foreground">
                              Cost and link type not checked by the team yet.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <SheetFooter className="flex-row flex-wrap items-center justify-between gap-2 border-t">
          <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
            <span className="tabular-nums">
              {formatNumber(selected.size)} selected
              {paidSelected ? ` · ${paidSelected} cost money` : ""}
            </span>
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={selectAllVisible}
            >
              Tick all shown
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            )}
          </div>
          <Button onClick={submit} disabled={pending || selected.size === 0}>
            <Plus />
            {pending
              ? "Adding…"
              : `Add ${selected.size || ""} ${selected.size === 1 ? "site" : "sites"}`.replace(
                  "  ",
                  " ",
                )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
