"use client"

import { ArrowUpRight, Check, CircleAlert, CornerUpLeft, ExternalLink, ListPlus, Quote, ShieldCheck, X } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { StatusTag } from "@/components/common/status"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { REJECT_LABELS, REJECT_REASONS, type RejectReason } from "../../constants"
import { reviewAiProspects } from "../actions"
import { AI_REVIEW_CAP, FINDER_LABELS, type CategoryKey } from "../config"
import type { AiProspect } from "../queries"
import {
  CategoryChip,
  COST_LABEL,
  EFFORT_LABEL,
  FILTER_LABEL,
  FitMeter,
  FLAG_LABEL,
  LinkTag,
  VERDICT_LABEL,
} from "./ai-ui"

type Tab = "review" | "more" | "approved" | "rejected" | "hidden"
const TABS: { key: Tab; label: string; note: string }[] = [
  { key: "review", label: "Top 30", note: `At most ${AI_REVIEW_CAP}, best first` },
  { key: "more", label: "More", note: "Kept, outside the top 30" },
  { key: "approved", label: "Approved", note: "Added to the client's list" },
  { key: "rejected", label: "Rejected", note: "With the reason" },
  { key: "hidden", label: "Hidden", note: "Filtered out, with the reason" },
]

const tabOf = (p: AiProspect): Tab =>
  p.status === "approved"
    ? "approved"
    : p.status === "rejected"
      ? "rejected"
      : p.status === "filtered"
        ? "hidden"
        : p.status === "reserve"
          ? "more"
          : "review"

export function AiProspectsView({
  prospects,
  placeLabels,
  canReview,
}: {
  prospects: AiProspect[]
  placeLabels: Record<string, string>
  canReview: boolean
}) {
  const [tab, setTab] = useState<Tab>("review")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<AiProspect | null>(null)
  const [rejecting, setRejecting] = useState<string[] | null>(null)
  const [pending, startTransition] = useTransition()

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { review: 0, more: 0, approved: 0, rejected: 0, hidden: 0 }
    for (const p of prospects) c[tabOf(p)]++
    return c
  }, [prospects])
  const rows = prospects.filter((p) => tabOf(p) === tab)
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))

  function act(ids: string[], decision: "approve" | "restore" | "promote", done: string) {
    startTransition(async () => {
      const r = await reviewAiProspects(ids, decision)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(done.replace("{n}", String(r.data?.changed ?? ids.length)))
      setSelected(new Set())
      setOpen(null)
    })
  }

  const ids = [...selected].filter((id) => rows.some((r) => r.id === id))

  return (
    <section className="flex flex-col gap-3" aria-label="Places found by Shockwave AI">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Places by status">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key)
              setSelected(new Set())
            }}
            title={t.note}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
              tab === t.key ? "border-primary/40 bg-brand-soft font-medium text-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span className="font-mono text-xs tabular-nums">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {canReview && ids.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-popover px-3 py-2 shadow-sm">
          <span className="text-sm">{ids.length} selected</span>
          <span className="flex-1" />
          {(tab === "review" || tab === "more") && (
            <Button size="sm" disabled={pending} onClick={() => act(ids, "approve", "{n} approved and added to the client's list")}>
              <Check className="size-3.5" aria-hidden />
              Approve
            </Button>
          )}
          {tab === "more" && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(ids, "promote", "{n} moved to the top 30")}>
              <ListPlus className="size-3.5" aria-hidden />
              Move to top 30
            </Button>
          )}
          {(tab === "review" || tab === "more" || tab === "approved") && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejecting(ids)}>
              <X className="size-3.5" aria-hidden />
              Reject
            </Button>
          )}
          {(tab === "rejected" || tab === "hidden" || tab === "approved") && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(ids, "restore", "{n} restored")}>
              <CornerUpLeft className="size-3.5" aria-hidden />
              Restore
            </Button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="hidden grid-cols-[2rem_2.5rem_minmax(0,1.6fr)_minmax(0,1fr)_7rem_6.5rem] items-center gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground md:grid">
            {canReview ? (
              <Checkbox
                checked={allSelected}
                aria-label="Select all"
                onCheckedChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())}
              />
            ) : (
              <span />
            )}
            <span>#</span>
            <span>Place</span>
            <span>Why</span>
            <span>Link</span>
            <span className="text-right">Fit</span>
          </div>
          <ul>
            {rows.map((p) => (
              <li
                key={p.id}
                className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/30 md:grid-cols-[2rem_2.5rem_minmax(0,1.6fr)_minmax(0,1fr)_7rem_6.5rem] md:items-center"
              >
                {canReview ? (
                  <Checkbox
                    className="mt-0.5 md:mt-0"
                    checked={selected.has(p.id)}
                    aria-label={`Select ${p.site}`}
                    onCheckedChange={(c) =>
                      setSelected((prev) => {
                        const next = new Set(prev)
                        if (c) next.add(p.id)
                        else next.delete(p.id)
                        return next
                      })
                    }
                  />
                ) : (
                  <span />
                )}
                <span className="hidden font-mono text-sm text-muted-foreground tabular-nums md:block">{p.shortlistRank ?? "—"}</span>
                <button type="button" onClick={() => setOpen(p)} className="flex min-w-0 flex-col items-start gap-1 text-left outline-none focus-visible:underline">
                  <span className="flex w-full min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{p.site}</span>
                    {p.alsoInStandard && (
                      <span className="shrink-0 rounded-sm border px-1 text-[10px] text-muted-foreground" title="Also found by Standard Search">
                        Also in Standard
                      </span>
                    )}
                  </span>
                  <span className="w-full truncate text-xs text-muted-foreground">{p.pageTitle ?? p.pageUrl}</span>
                  <span className="flex flex-wrap gap-1">
                    <CategoryChip category={p.category} />
                    {p.effort && p.effort !== "unknown" && (
                      <span className="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">{EFFORT_LABEL[p.effort]}</span>
                    )}
                    {p.costType && p.costType !== "unknown" && (
                      <span className="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">{COST_LABEL[p.costType]}</span>
                    )}
                  </span>
                </button>
                <p className="col-start-2 text-xs text-muted-foreground md:col-start-auto md:line-clamp-3">
                  {tab === "hidden" && p.filterReason ? (
                    <span className="text-foreground">{FILTER_LABEL[p.filterReason] ?? p.filterReason}</span>
                  ) : tab === "rejected" && p.rejectReason ? (
                    <span className="text-foreground">{REJECT_LABELS[p.rejectReason]}</span>
                  ) : (
                    p.reason ?? p.evidence.find((e) => e.why)?.why ?? "—"
                  )}
                </p>
                <span className="col-start-2 md:col-start-auto">
                  <LinkTag type={p.linkType} />
                </span>
                <span className="col-start-2 md:col-start-auto md:text-right">
                  <FitMeter fit={p.fit} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ProspectSheet
        prospect={open}
        onOpenChange={(o) => !o && setOpen(null)}
        placeLabels={placeLabels}
        canReview={canReview}
        pending={pending}
        onApprove={(id) => act([id], "approve", "Approved and added to the client's list")}
        onReject={(id) => setRejecting([id])}
        onRestore={(id) => act([id], "restore", "Restored")}
        onPromote={(id) => act([id], "promote", "Moved to the top 30")}
      />
      <RejectDialog
        ids={rejecting}
        onClose={() => setRejecting(null)}
        onDone={() => {
          setRejecting(null)
          setSelected(new Set())
          setOpen(null)
        }}
      />
    </section>
  )
}

function ProspectSheet({
  prospect: p,
  onOpenChange,
  placeLabels,
  canReview,
  pending,
  onApprove,
  onReject,
  onRestore,
  onPromote,
}: {
  prospect: AiProspect | null
  onOpenChange: (open: boolean) => void
  placeLabels: Record<string, string>
  canReview: boolean
  pending: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onRestore: (id: string) => void
  onPromote: (id: string) => void
}) {
  const v = p?.verification ?? {}
  const flags = [...(v.flags ?? []), ...(v.ai_flags ?? [])]
  const tab = p ? tabOf(p) : null
  return (
    <Sheet open={Boolean(p)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {p && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {p.site}
                {p.shortlistRank ? <StatusTag tone="brand">#{p.shortlistRank}</StatusTag> : null}
              </SheetTitle>
              <SheetDescription>{p.pageTitle ?? p.pageUrl}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4 pb-6 text-sm">
              <div className="flex flex-wrap gap-1.5">
                <CategoryChip category={p.category} />
                <LinkTag type={p.linkType} />
                {p.effort && <span className="rounded-md border px-1.5 py-0.5 text-xs">{EFFORT_LABEL[p.effort]}</span>}
                {p.costType && <span className="rounded-md border px-1.5 py-0.5 text-xs">{COST_LABEL[p.costType]}</span>}
                {p.verdict && p.verdict !== "keep" && <StatusTag tone="warning">{VERDICT_LABEL[p.verdict] ?? p.verdict}</StatusTag>}
              </div>

              {p.reason && <p className="text-[15px] leading-6">{p.reason}</p>}
              {p.action && (
                <p>
                  <span className="font-medium">What to do:</span> {p.action}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {p.pageUrl && (
                  <Button asChild size="sm" variant="outline">
                    <a href={p.pageUrl} target="_blank" rel="noreferrer noopener">
                      Open page
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </Button>
                )}
                {v.submit_url && (
                  <Button asChild size="sm" variant="outline">
                    <a href={v.submit_url} target="_blank" rel="noreferrer noopener">
                      Submission link
                      <ArrowUpRight className="size-3.5" aria-hidden />
                    </a>
                  </Button>
                )}
                {v.contact_url && (
                  <Button asChild size="sm" variant="outline">
                    <a href={v.contact_url} target="_blank" rel="noreferrer noopener">
                      Contact
                      <ArrowUpRight className="size-3.5" aria-hidden />
                    </a>
                  </Button>
                )}
              </div>

              {p.scores && (
                <div className="grid grid-cols-4 divide-x divide-dashed rounded-lg border text-center">
                  {(["relevant", "real", "reachable", "worth_it"] as const).map((k) => (
                    <div key={k} className="px-2 py-2">
                      <div className="font-mono text-lg font-semibold tabular-nums">{p.scores?.[k] ?? "—"}<span className="text-xs text-muted-foreground">/5</span></div>
                      <div className="text-xs text-muted-foreground">{k === "worth_it" ? "Worth it" : k.charAt(0).toUpperCase() + k.slice(1)}</div>
                    </div>
                  ))}
                </div>
              )}
              {p.scores?.notes && <p className="-mt-3 text-xs text-muted-foreground">{p.scores.notes}</p>}

              <section className="flex flex-col gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
                  <Quote className="size-3.5" aria-hidden />
                  Evidence
                </h3>
                {v.quote && (
                  <blockquote className="border-l-2 border-primary/40 pl-3 text-[13px]">
                    “{v.quote}” <span className="text-xs text-muted-foreground">(on the page)</span>
                  </blockquote>
                )}
                <ul className="flex flex-col gap-2">
                  {p.evidence.slice(0, 5).map((e, i) => (
                    <li key={i} className="rounded-md border px-3 py-2 text-[13px]">
                      {e.why && <p>{e.why}</p>}
                      {e.quote && <p className="text-muted-foreground">“{e.quote}”</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {FINDER_LABELS[e.finder as CategoryKey] ?? e.finder}
                        {e.query ? ` · search: ${e.query}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="flex flex-col gap-1.5">
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  Page check
                </h3>
                <p className="text-[13px]">
                  {v.status === "ok" ? "Page is live" : v.status ? `Page: ${v.status.replace("_", " ")}` : "Not checked"}
                  {v.lang ? ` · language ${v.lang}` : ""}
                  {v.outbound ? ` · ${v.outbound.total} outbound links (${v.outbound.dofollow} followed)` : ""}
                  {v.updated ? ` · updated ${v.updated}` : ""}
                  {p.authority ? ` · authority ${p.authority}/5 (estimate)` : ""}
                </p>
                {flags.length > 0 ? (
                  <ul className="flex flex-wrap gap-1">
                    {flags.map((f) => (
                      <li key={f} className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning-soft px-1.5 py-0.5 text-xs">
                        <CircleAlert className="size-3 text-warning" aria-hidden />
                        {FLAG_LABEL[f] ?? f}
                      </li>
                    ))}
                  </ul>
                ) : v.status ? (
                  <p className="text-xs text-muted-foreground">No red flags found.</p>
                ) : null}
              </section>

              <p className="text-xs text-muted-foreground">
                Found by: {p.foundBy.map((f) => FINDER_LABELS[f as CategoryKey] ?? f).join(", ")}
                {p.targetIds.length ? ` · for ${p.targetIds.map((t) => placeLabels[t]).filter(Boolean).join(", ")}` : ""}
                {p.alsoInStandard ? " · also found by Standard Search" : ""}
              </p>

              {canReview && (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {(tab === "review" || tab === "more") && (
                    <Button size="sm" disabled={pending} onClick={() => onApprove(p.id)}>
                      <Check className="size-3.5" aria-hidden />
                      Approve
                    </Button>
                  )}
                  {tab === "more" && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => onPromote(p.id)}>
                      Move to top 30
                    </Button>
                  )}
                  {tab !== "rejected" && tab !== "hidden" && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => onReject(p.id)}>
                      Reject
                    </Button>
                  )}
                  {(tab === "rejected" || tab === "hidden" || tab === "approved") && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => onRestore(p.id)}>
                      Restore
                    </Button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function RejectDialog({ ids, onClose, onDone }: { ids: string[] | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<RejectReason>("not_relevant")
  const [note, setNote] = useState("")
  const [pending, startTransition] = useTransition()
  return (
    <Dialog open={Boolean(ids)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject {ids && ids.length > 1 ? `${ids.length} places` : "this place"}</DialogTitle>
          <DialogDescription>The reason helps the next AI search learn what doesn&apos;t fit.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Reason</FieldLabel>
          <Select value={reason} onValueChange={(v) => setReason(v as RejectReason)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REJECT_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {REJECT_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="ai-reject-note">Note (optional)</FieldLabel>
          <Textarea id="ai-reject-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || !ids?.length}
            onClick={() =>
              startTransition(async () => {
                const r = await reviewAiProspects(ids ?? [], "reject", reason, note)
                if (!r.ok) {
                  toast.error(r.error)
                  return
                }
                toast.success(`${r.data?.changed ?? 0} rejected`)
                setNote("")
                onDone()
              })
            }
          >
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
