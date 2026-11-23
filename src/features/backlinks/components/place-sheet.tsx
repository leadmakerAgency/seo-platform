"use client"

import { ArrowUpRight, Ban, Check, RotateCcw, X } from "@/components/icons"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { displayUrl } from "@/lib/format"
import { reviewPlaces, setDirectoryBlocked, updateDirectory } from "../actions"
import {
  COST_LABELS,
  DIRECTORY_TYPES,
  FILTER_LABELS,
  REJECT_LABELS,
  TYPE_LABELS,
  type DirectoryType,
} from "../constants"
import type { Place } from "../queries"
import { CheckStrengthButton, RejectDialog } from "./backlink-dialogs"
import { formatDay, Spam, Strength, TypeTag } from "./bits"

const STATUS_TAG: Record<
  Place["status"],
  { label: string; tone: "warning" | "success" | "danger" | "neutral" }
> = {
  pending_review: { label: "Pending review", tone: "warning" },
  reserve: { label: "More (outside the top 30)", tone: "neutral" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  filtered: { label: "Hidden", tone: "neutral" },
}

export function PlaceSheet({
  place,
  clientId,
  canReview,
  canStrength,
  canForce,
  canLibrary,
  strengthBlocked,
  placeLabels,
  onOpenChange,
}: {
  place: Place | null
  clientId: string
  canReview: boolean
  canStrength: boolean
  canForce: boolean
  canLibrary: boolean
  strengthBlocked: string | null
  placeLabels: Record<string, string>
  onOpenChange: (open: boolean) => void
}) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function decide(decision: "approve" | "restore") {
    if (!place) return
    startTransition(async () => {
      const r = await reviewPlaces([place.id], decision)
      if (!r.ok) toast.error(r.error)
      else toast.success(decision === "approve" ? "Approved." : "Back in Pending review.")
    })
  }

  const blockedSite = place?.directory.status === "blocked"
  return (
    <Sheet open={Boolean(place)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {place && (
          <>
            <SheetHeader className="border-b">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusTag tone={STATUS_TAG[place.status].tone}>
                  {STATUS_TAG[place.status].label}
                </StatusTag>
                <TypeTag type={place.type} />
                {place.isCore && (
                  <StatusTag tone="brand" dot={false}>
                    Core listing
                  </StatusTag>
                )}
              </div>
              <SheetTitle className="text-lg">{place.name}</SheetTitle>
              <SheetDescription>{place.site}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-6 p-4 text-sm">
              {canReview && (
                <div className="flex flex-wrap gap-2">
                  {place.status !== "approved" &&
                    !(place.status === "filtered" && place.filterReason === "blocked") && (
                      <Button onClick={() => decide("approve")} disabled={pending}>
                        <Check /> Approve
                      </Button>
                    )}
                  {place.status !== "rejected" &&
                    !(place.status === "filtered" && place.filterReason === "blocked") && (
                      <Button
                        variant="outline"
                        onClick={() => setRejectOpen(true)}
                        disabled={pending}
                      >
                        <X /> Reject…
                      </Button>
                    )}
                  {place.status !== "pending_review" &&
                    !(place.status === "filtered" && place.filterReason === "blocked") && (
                      <Button variant="ghost" onClick={() => decide("restore")} disabled={pending}>
                        <RotateCcw /> Back to review
                      </Button>
                    )}
                </div>
              )}
              {place.status === "rejected" && place.rejectReason && (
                <p className="text-muted-foreground">
                  Rejected{place.decidedAt ? ` on ${formatDay(place.decidedAt)}` : ""}:{" "}
                  {REJECT_LABELS[place.rejectReason]}
                  {place.rejectNote ? `. ${place.rejectNote}` : "."}
                </p>
              )}
              {place.status === "filtered" && place.filterReason && (
                <p className="text-muted-foreground">
                  Hidden by the search: {FILTER_LABELS[place.filterReason]}.
                  {place.filterReason !== "blocked" && canReview
                    ? " Approve it or send it back to review if that's wrong."
                    : ""}
                </p>
              )}

              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Site strength
                </h3>
                <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Domain Rank (0–100)</span>
                    <Strength place={place} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Spam score</span>
                    <Spam spam={place.spam} />
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground">
                    {place.checkedAt
                      ? `Checked ${formatDay(place.checkedAt)} with DataForSEO.`
                      : "Not checked yet."}{" "}
                    Strength belongs to the site, so one check counts for every client.
                  </p>
                </div>
                {canStrength && (
                  <div className="flex flex-wrap gap-2">
                    <CheckStrengthButton
                      clientId={clientId}
                      ids={[place.id]}
                      disabledReason={strengthBlocked}
                      label={place.checkedAt ? "Check again" : "Check strength"}
                      force={Boolean(place.checkedAt) && canForce}
                      variant="outline"
                    />
                  </div>
                )}
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Why it was chosen
                </h3>
                {place.aiReason && (
                  <div className="rounded-lg border bg-muted/40 px-3 py-2">
                    <p>{place.aiReason}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Claude&apos;s review{place.aiFit !== null ? ` · fit ${place.aiFit} of 5` : ""}
                      {place.shortlistRank ? ` · #${place.shortlistRank} of the top 30` : ""}
                    </p>
                  </div>
                )}
                {place.matchedTopic && (
                  <p className="text-muted-foreground">Matches the topic &ldquo;{place.matchedTopic}&rdquo;.</p>
                )}
                {place.source === "brief" && (
                  <p>Named in the strategy brief as a site the buyers trust.</p>
                )}
                {place.source === "ai_visibility" && (
                  <p>Sent from AI visibility: AI answers rely on this site where competitors are named and the client isn&apos;t.</p>
                )}
                {place.isCore && (
                  <p>A core listing: every business in the client&apos;s country should have it.</p>
                )}
                {place.hits.length > 0 ? (
                  <ul className="divide-y rounded-lg border">
                    {place.hits.map((h, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          <span className="block">&ldquo;{h.query}&rdquo;</span>
                          <span className="block text-xs text-muted-foreground">
                            {h.targetId && placeLabels[h.targetId]
                              ? `Searched from ${placeLabels[h.targetId]}`
                              : "Industry search"}
                          </span>
                          {h.url && (
                            <a
                              href={h.url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                            >
                              {displayUrl(h.url)}
                            </a>
                          )}
                        </span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          #{h.position ?? "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !place.isCore && <p className="text-muted-foreground">No search details saved.</p>
                )}
                {place.isLocal && (
                  <p className="text-muted-foreground">Mentions a place it was searched for.</p>
                )}
              </section>

              {place.foundUrl && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {place.isCore && !place.hits.length ? "Where to start" : "Page found"}
                  </h3>
                  <a
                    href={place.foundUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                  >
                    {place.foundTitle ?? displayUrl(place.foundUrl)}
                    <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
                  </a>
                  {place.foundSnippet && (
                    <p className="text-muted-foreground">{place.foundSnippet}</p>
                  )}
                </section>
              )}

              <SiteDetails key={place.directory.id} place={place} canEdit={canLibrary} />
              {blockedSite && (
                <p className="text-muted-foreground">
                  This site is blocked for every client
                  {place.directory.blockedReason ? `: ${place.directory.blockedReason}` : "."}
                </p>
              )}
            </div>
            <RejectDialog ids={[place.id]} open={rejectOpen} onOpenChange={setRejectOpen} />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function SiteDetails({ place, canEdit }: { place: Place; canEdit: boolean }) {
  const d = place.directory
  const [type, setType] = useState<DirectoryType>(place.type)
  const [url, setUrl] = useState(d.submitUrl ?? "")
  const [cost, setCost] = useState<"free" | "paid" | "unknown">(
    (d.costType as "free" | "paid" | "unknown") ?? "unknown",
  )
  const [notes, setNotes] = useState(d.notes ?? "")
  const [blockReason, setBlockReason] = useState("")
  const [blocking, setBlocking] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!canEdit) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          About the site
        </h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Type</dt>
          <dd>{TYPE_LABELS[place.type]}</dd>
          <dt className="text-muted-foreground">Cost</dt>
          <dd>{COST_LABELS[d.costType] ?? "Not sure"}</dd>
          {d.submitUrl && (
            <>
              <dt className="text-muted-foreground">Sign up</dt>
              <dd className="truncate">
                <a
                  href={d.submitUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-brand hover:underline"
                >
                  {displayUrl(d.submitUrl)}
                </a>
              </dd>
            </>
          )}
          {d.notes && (
            <>
              <dt className="text-muted-foreground">Notes</dt>
              <dd className="whitespace-pre-line">{d.notes}</dd>
            </>
          )}
        </dl>
      </section>
    )
  }

  function save() {
    startTransition(async () => {
      const r = await updateDirectory({
        id: d.id,
        type,
        submitUrl: url || null,
        costType: cost,
        notes: notes || null,
      })
      if (!r.ok) toast.error(r.error)
      else toast.success("Saved for every client.")
    })
  }

  function toggleBlock() {
    startTransition(async () => {
      const r = await setDirectoryBlocked(d.id, d.status !== "blocked", blockReason)
      if (!r.ok) toast.error(r.error)
      else {
        toast.success(
          d.status === "blocked"
            ? "Unblocked. Its places are back in review."
            : "Blocked for every client.",
        )
        setBlocking(false)
        setBlockReason("")
      }
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        About the site (all clients)
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="site-type">Type</FieldLabel>
          <Select value={type} onValueChange={(v) => setType(v as DirectoryType)}>
            <SelectTrigger id="site-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIRECTORY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="site-cost">Cost</FieldLabel>
          <Select value={cost} onValueChange={(v) => setCost(v as "free" | "paid" | "unknown")}>
            <SelectTrigger id="site-cost" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["free", "paid", "unknown"] as const).map((c) => (
                <SelectItem key={c} value={c}>
                  {COST_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="site-url">Sign-up link</FieldLabel>
        <Input
          id="site-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          inputMode="url"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="site-notes">Notes for VAs</FieldLabel>
        <Textarea
          id="site-notes"
          value={notes}
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={save} disabled={pending}>
          Save site
        </Button>
        {d.status === "blocked" ? (
          <Button variant="ghost" onClick={toggleBlock} disabled={pending}>
            Unblock site
          </Button>
        ) : (
          !blocking && (
            <Button
              variant="ghost"
              className="text-danger"
              onClick={() => setBlocking(true)}
              disabled={pending}
            >
              <Ban /> Block for all clients
            </Button>
          )
        )}
      </div>
      {blocking && d.status !== "blocked" && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <Field>
            <FieldLabel htmlFor="block-reason">Why block it?</FieldLabel>
            <Input
              id="block-reason"
              value={blockReason}
              maxLength={300}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Spam site, not a directory, …"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Waiting places on this site move to Hidden for every client. Approved and rejected ones
            stay.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="text-danger"
              onClick={toggleBlock}
              disabled={pending || !blockReason.trim()}
            >
              Block site
            </Button>
            <Button variant="ghost" onClick={() => setBlocking(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
