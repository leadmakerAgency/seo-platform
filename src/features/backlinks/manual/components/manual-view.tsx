"use client"

import { ArrowUpRight, Hand, ListPlus, Search } from "lucide-react"
import Link from "next/link"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { CheckStrengthButton } from "../../components/backlink-dialogs"
import { Strength } from "../../components/bits"
import { bulkUpdateSubmissions } from "../actions"
import {
  ORIGIN_LABELS,
  ORIGINS,
  originOf,
  stageHas,
  STAGE_LABELS,
  type Origin,
  type Stage,
} from "../constants"
import type { KitField } from "../listing-kit"
import type { CatalogSite, Match } from "../match"
import type {
  LoginOption,
  MemberOption,
  OtherDecision,
  Submission,
  SubmissionEvent,
} from "../queries"
import { AddSiteDialog } from "./add-site-dialog"
import { Chip, formatPlainDay, LinkTag, money, PricingTag, StatusPill } from "./bits"
import { CatalogPicker } from "./catalog-picker"
import { SubmissionSheet } from "./submission-sheet"

export type ManualViewProps = {
  clientId: string
  clientName: string
  /** /clients/<slug>/backlinks?mode=manual */
  href: string
  editHref: string
  stage: Stage
  origin: Origin | "default"
  who: "me" | "anyone"
  memberId: string
  today: string
  initialSheet: string | null
  canWork: boolean
  canStrength: boolean
  strengthBlocked: string | null
  submissions: Submission[]
  events: SubmissionEvent[]
  catalog: CatalogSite[]
  matches: Match[]
  decisions: OtherDecision[]
  hasBrief: boolean
  logins: LoginOption[]
  members: MemberOption[]
  kit: { fields: KitField[]; missing: string[] }
}

const NONE = "__none"

export function ManualActions({
  clientId,
  clientName,
  matches,
  submissions,
  decisions,
  hasBrief,
}: Pick<
  ManualViewProps,
  "clientId" | "clientName" | "matches" | "submissions" | "decisions" | "hasBrief"
>) {
  const [pickOpen, setPickOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const picked = useMemo(
    () => Object.fromEntries(submissions.map((s) => [s.site.id, s.status])),
    [submissions],
  )
  return (
    <>
      <Button variant="outline" onClick={() => setAddOpen(true)}>
        <Hand /> Add a site by hand
      </Button>
      <Button onClick={() => setPickOpen(true)}>
        <ListPlus /> Add from catalog
      </Button>
      <CatalogPicker
        clientId={clientId}
        clientName={clientName}
        matches={matches}
        picked={picked}
        decisions={decisions}
        hasBrief={hasBrief}
        open={pickOpen}
        onOpenChange={setPickOpen}
      />
      <AddSiteDialog clientId={clientId} open={addOpen} onOpenChange={setAddOpen} />
    </>
  )
}

export function ManualView(p: ManualViewProps) {
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sheetId, setSheetId] = useState<string | null>(p.initialSheet)
  const [bulkDate, setBulkDate] = useState("")
  const [pending, startTransition] = useTransition()

  const catalogById = useMemo(() => new Map(p.catalog.map((c) => [c.id, c])), [p.catalog])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const order: Record<string, number> = {
      blocked: 0,
      doing: 1,
      submitted: 2,
      todo: 3,
      live: 4,
      skipped: 5,
    }
    return p.submissions
      .filter((s) => stageHas(p.stage, s.status))
      .filter((s) => p.origin === "default" || originOf(s.source, s.catalogId) === p.origin)
      .filter((s) => (p.who === "me" ? s.assignedTo?.id === p.memberId : true))
      .filter((s) => !needle || `${s.site.name} ${s.site.host}`.toLowerCase().includes(needle))
      .sort((a, b) => {
        const fa = a.followUpOn && a.followUpOn <= p.today ? 0 : 1
        const fb = b.followUpOn && b.followUpOn <= p.today ? 0 : 1
        return (
          fa - fb ||
          order[a.status] - order[b.status] ||
          (catalogById.get(b.catalogId ?? "")?.priority ?? 0) -
            (catalogById.get(a.catalogId ?? "")?.priority ?? 0) ||
          a.site.name.localeCompare(b.site.name)
        )
      })
  }, [p.submissions, p.stage, p.origin, p.who, p.memberId, p.today, q, catalogById])

  const sheet = sheetId ? (p.submissions.find((s) => s.id === sheetId) ?? null) : null
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id))

  function openSheet(id: string | null) {
    setSheetId(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("sheet", id)
    else url.searchParams.delete("sheet")
    window.history.replaceState(null, "", url)
  }

  function bulk(patch: Parameters<typeof bulkUpdateSubmissions>[1], done: string) {
    const ids = [...selected]
    startTransition(async () => {
      const r = await bulkUpdateSubmissions(ids, patch)
      if (!r.ok) toast.error(r.error)
      else {
        toast.success(`${done} (${formatNumber(r.data.changed)}).`)
        setSelected(new Set())
      }
    })
  }

  const originHref = (o: string) => {
    const url = new URL(p.href, "http://x")
    url.searchParams.set("stage", p.stage)
    if (o === "default") url.searchParams.delete("from")
    else url.searchParams.set("from", o)
    if (p.who === "me") url.searchParams.set("who", "me")
    return `${url.pathname}${url.search}`
  }
  const whoHref = (w: "me" | "anyone") => {
    const url = new URL(p.href, "http://x")
    url.searchParams.set("stage", p.stage)
    if (p.origin !== "default") url.searchParams.set("from", p.origin)
    if (w === "me") url.searchParams.set("who", "me")
    return `${url.pathname}${url.search}`
  }

  const counts = Object.fromEntries(
    ["default", ...ORIGINS].map((o) => [
      o,
      p.submissions.filter(
        (s) =>
          stageHas(p.stage, s.status) &&
          (o === "default" ? true : originOf(s.source, s.catalogId) === o),
      ).length,
    ]),
  )

  const selectedOpps = p.submissions.filter((s) => selected.has(s.id)).map((s) => s.opportunityId)

  return (
    <section className="flex flex-col gap-3" aria-label="Work list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Where places came from" className="flex flex-wrap gap-1">
          {(["default", ...ORIGINS] as const).map((o) => {
            const active = p.origin === o
            return (
              <Link
                key={o}
                href={originHref(o)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[13px] transition-colors",
                  active
                    ? "border-primary bg-brand-soft font-medium text-brand"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {o === "default" ? "Every source" : ORIGIN_LABELS[o]}
                <span className="tabular-nums opacity-70">{counts[o]}</span>
              </Link>
            )
          })}
          <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
          {(["anyone", "me"] as const).map((w) => (
            <Link
              key={w}
              href={whoHref(w)}
              scroll={false}
              aria-current={p.who === w ? "page" : undefined}
              className={cn(
                "inline-flex h-7 items-center rounded-md border px-2.5 text-[13px] transition-colors",
                p.who === w
                  ? "border-primary bg-brand-soft font-medium text-brand"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {w === "me" ? "Mine" : "Anyone"}
            </Link>
          ))}
        </nav>
        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the work list"
            className="h-8 pl-8"
            aria-label="Search the work list"
          />
        </div>
      </div>

      {selected.size > 0 && p.canWork && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-[13px]">
          <span className="font-medium tabular-nums">{formatNumber(selected.size)} selected</span>
          <Select
            onValueChange={(v) => bulk({ status: v as "todo" }, "Status changed")}
            disabled={pending}
          >
            <SelectTrigger size="sm" className="w-[150px]" aria-label="Set status">
              <SelectValue placeholder="Set status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">To do</SelectItem>
              <SelectItem value="doing">Doing</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="skipped">Skip</SelectItem>
            </SelectContent>
          </Select>
          <Select
            onValueChange={(v) => bulk({ assigned_to: v === NONE ? null : v }, "Assigned")}
            disabled={pending}
          >
            <SelectTrigger size="sm" className="w-[170px]" aria-label="Assign to">
              <SelectValue placeholder="Assign to" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nobody</SelectItem>
              {p.members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="flex items-center gap-1">
            <Input
              type="date"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              className="h-7 w-[150px] text-[13px]"
              aria-label="Follow up on"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !bulkDate}
              onClick={() => bulk({ follow_up_on: bulkDate }, "Follow-up set")}
            >
              Set follow-up
            </Button>
          </span>
          {p.canStrength && (
            <CheckStrengthButton
              clientId={p.clientId}
              ids={selectedOpps}
              disabledReason={p.strengthBlocked}
              label="Check strength"
              onDone={() => setSelected(new Set())}
            />
          )}
          <button
            type="button"
            className="ml-auto text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-5 text-sm">
          <p className="font-medium">
            {p.submissions.length === 0
              ? "Nothing on the work list yet"
              : `Nothing ${p.stage === "all" ? "here" : `in ${STAGE_LABELS[p.stage]}`}`}
          </p>
          <p className="max-w-[68ch] text-muted-foreground">
            {p.submissions.length === 0
              ? "Add the must-have sites from the catalog (they're sorted for this client), or add one you found by hand. Places approved in Standard Search and Shockwave AI show up here too."
              : q
                ? "No listing matches the search."
                : "Pick another tab above, or add more sites."}
          </p>
        </div>
      ) : (
        <>
          {/* Phones: cards. */}
          <ul className="flex flex-col gap-2 sm:hidden">
            {rows.map((s) => {
              const c = s.catalogId ? catalogById.get(s.catalogId) : undefined
              const due =
                s.followUpOn &&
                s.followUpOn <= p.today &&
                ["doing", "submitted", "blocked"].includes(s.status)
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => openSheet(s.id)}
                    className="flex w-full flex-col gap-1.5 rounded-lg border bg-card p-3 text-left"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{s.site.name}</span>
                      <StatusPill status={s.status} />
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {s.site.host && <span>{s.site.host}</span>}
                      {c && <PricingTag pricing={c.pricing} note={c.priceNote} />}
                      {s.assignedTo && <span>· {s.assignedTo.name}</span>}
                      {s.followUpOn && (
                        <span className={cn(due && "text-warning")}>
                          · follow up {formatPlainDay(s.followUpOn)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Wider: table. */}
          <div className="hidden overflow-x-auto rounded-lg border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {p.canWork && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allChecked}
                        onCheckedChange={(v) =>
                          setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())
                        }
                        aria-label="Select every row"
                      />
                    </TableHead>
                  )}
                  <TableHead>Site</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Strength</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Follow up</TableHead>
                  <TableHead>Listing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const c = s.catalogId ? catalogById.get(s.catalogId) : undefined
                  const origin = originOf(s.source, s.catalogId)
                  const due =
                    s.followUpOn &&
                    s.followUpOn <= p.today &&
                    ["doing", "submitted", "blocked"].includes(s.status)
                  return (
                    <TableRow
                      key={s.id}
                      data-state={selected.has(s.id) ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => openSheet(s.id)}
                    >
                      {p.canWork && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(s.id)}
                            onCheckedChange={(v) =>
                              setSelected((prev) => {
                                const next = new Set(prev)
                                if (v === true) next.add(s.id)
                                else next.delete(s.id)
                                return next
                              })
                            }
                            aria-label={`Select ${s.site.name}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="max-w-[280px]">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-medium">{s.site.name}</span>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {s.site.host && <span className="truncate">{s.site.host}</span>}
                            {origin !== "catalog" && <Chip>{ORIGIN_LABELS[origin]}</Chip>}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusPill status={s.status} />
                      </TableCell>
                      <TableCell className="text-[13px]">
                        {s.costUsd !== null ? (
                          <span className="tabular-nums">{money(s.costUsd)}</span>
                        ) : c ? (
                          <PricingTag pricing={c.pricing} note={c.priceNote} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.linkKind ? (
                          <LinkTag kind={s.linkKind} actual />
                        ) : c ? (
                          <LinkTag kind={c.typicalLink} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Strength
                          place={{ authority: s.authority, authorityStatus: s.authorityStatus }}
                          className="text-[13px]"
                        />
                      </TableCell>
                      <TableCell className="text-[13px]">
                        {s.assignedTo?.name ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-[13px] tabular-nums",
                          due ? "font-medium text-warning" : "text-muted-foreground",
                        )}
                      >
                        {s.followUpOn ? formatPlainDay(s.followUpOn) : "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} className="text-[13px]">
                        {s.listingUrl ? (
                          <a
                            href={s.listingUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1 text-brand underline underline-offset-2"
                          >
                            {s.liveOn ? formatPlainDay(s.liveOn) : "Open"}{" "}
                            <ArrowUpRight className="size-3" aria-hidden />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <SubmissionSheet
        submission={sheet}
        site={sheet?.catalogId ? (catalogById.get(sheet.catalogId) ?? null) : null}
        events={p.events}
        logins={p.logins}
        members={p.members}
        kit={p.kit}
        editHref={p.editHref}
        today={p.today}
        canWork={p.canWork}
        onOpenChange={(o) => !o && openSheet(null)}
      />
    </section>
  )
}
