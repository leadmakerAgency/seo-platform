"use client"

import { ArrowUpRight, Ban, Eye, EyeOff, KeyRound, Flag, SkipForward } from "@/components/icons"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { revealLogin } from "@/features/onboarding/actions"
import { cn } from "@/lib/utils"
import { Strength, Spam } from "../../components/bits"
import {
  addBacklinkLogin,
  reportCatalogProblem,
  updateSubmission,
  type SubmissionPatch,
} from "../actions"
import {
  BLOCK_LABELS,
  BLOCK_REASONS,
  CATEGORY_LABELS,
  LINK_KINDS,
  LINK_LABELS,
  NEED_LABELS,
  ORIGIN_LABELS,
  originOf,
  STATUS_META,
  type LinkKind,
  type SubmissionBlock,
  type SubmissionStatus,
} from "../constants"
import type { KitField } from "../listing-kit"
import type { CatalogSite } from "../match"
import type { LoginOption, MemberOption, Submission, SubmissionEvent } from "../queries"
import { Chip, formatPlainDay, formatStamp, LinkTag, PricingTag, StatusPill } from "./bits"
import { ListingKit } from "./listing-kit"

const STEPS: SubmissionStatus[] = ["todo", "doing", "submitted", "live"]
const NONE = "__none"

export function SubmissionSheet(props: {
  submission: Submission | null
  site: CatalogSite | null
  events: SubmissionEvent[]
  logins: LoginOption[]
  members: MemberOption[]
  kit: { fields: KitField[]; missing: string[] }
  editHref: string
  today: string
  canWork: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={Boolean(props.submission)} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {props.submission && (
          <Body key={props.submission.id} {...props} submission={props.submission} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function Body({
  submission: s,
  site,
  events,
  logins,
  members,
  kit,
  editHref,
  today,
  canWork,
}: Parameters<typeof SubmissionSheet>[0] & { submission: Submission }) {
  const [pending, startTransition] = useTransition()
  const [listingUrl, setListingUrl] = useState(s.listingUrl ?? "")
  const [linkKind, setLinkKind] = useState<LinkKind | "">(s.linkKind ?? site?.typicalLink ?? "")
  const [assigned, setAssigned] = useState(s.assignedTo?.id ?? NONE)
  const [followUp, setFollowUp] = useState(s.followUpOn ?? "")
  const [submittedOn, setSubmittedOn] = useState(s.submittedOn ?? "")
  const [liveOn, setLiveOn] = useState(s.liveOn ?? "")
  const [cost, setCost] = useState(s.costUsd === null ? "" : String(s.costUsd))
  const [costNote, setCostNote] = useState(s.costNote ?? "")
  const [notes, setNotes] = useState(s.notes ?? "")
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockReason, setBlockReason] = useState<SubmissionBlock | "">(s.blockReason ?? "")
  const [blockNote, setBlockNote] = useState(s.blockNote ?? "")
  const [urlError, setUrlError] = useState<string | null>(null)

  const origin = originOf(s.source, s.catalogId)
  const startUrl = site?.submitUrl || site?.homeUrl || s.site.submitUrl || s.foundUrl
  const mine = events.filter((e) => e.submissionId === s.id)

  function save(patch: SubmissionPatch, done: string) {
    startTransition(async () => {
      const r = await updateSubmission(s.id, patch)
      if (!r.ok) toast.error(r.error)
      else toast.success(done)
    })
  }

  function fieldsPatch(): SubmissionPatch {
    return {
      listing_url: listingUrl.trim() || null,
      link_kind: linkKind || null,
      assigned_to: assigned === NONE ? null : assigned,
      follow_up_on: followUp || null,
      submitted_on: submittedOn || null,
      live_on: liveOn || null,
      cost_usd: cost.trim() === "" ? null : Number(cost),
      cost_note: costNote.trim() || null,
      notes: notes.trim() || null,
    }
  }

  function moveTo(status: SubmissionStatus) {
    if (status === "live" && !listingUrl.trim()) {
      setUrlError("Paste the live listing URL first.")
      document.getElementById("sub-url")?.focus()
      return
    }
    if (cost.trim() !== "" && !Number.isFinite(Number(cost))) {
      toast.error("The cost must be a number.")
      return
    }
    setUrlError(null)
    save({ ...fieldsPatch(), status }, `Moved to ${STATUS_META[status].label}.`)
  }

  function saveBlocked() {
    if (!blockReason) {
      toast.error("Pick why it's blocked.")
      return
    }
    save(
      {
        ...fieldsPatch(),
        status: "blocked",
        block_reason: blockReason,
        block_note: blockNote.trim() || null,
      },
      "Marked as blocked.",
    )
    setBlockOpen(false)
  }

  const followDue =
    followUp && followUp <= today && ["doing", "submitted", "blocked"].includes(s.status)

  return (
    <>
      <SheetHeader className="border-b">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={s.status} />
          <Chip>{ORIGIN_LABELS[origin]}</Chip>
          {site && <Chip>{CATEGORY_LABELS[site.category]}</Chip>}
        </div>
        <SheetTitle className="text-lg">{s.site.name}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {s.site.host && <span>{s.site.host}</span>}
          {startUrl && (
            <a
              href={startUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-brand underline underline-offset-2"
            >
              Open the start page <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          )}
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-[13px]">
          {site && <PricingTag pricing={site.pricing} note={site.priceNote} />}
          {site && <LinkTag kind={site.typicalLink} />}
          <Strength place={{ authority: s.authority, authorityStatus: s.authorityStatus }} />
          <Spam spam={s.spam} />
        </div>
      </SheetHeader>

      <div className="flex flex-col gap-6 p-4">
        {/* Status */}
        <section className="flex flex-col gap-2" aria-label="Status">
          <ol className="grid grid-cols-4 gap-1.5">
            {STEPS.map((st, i) => {
              const reached =
                STEPS.indexOf(s.status) >= i && s.status !== "blocked" && s.status !== "skipped"
              const current = s.status === st
              return (
                <li key={st}>
                  <button
                    type="button"
                    disabled={!canWork || pending || current}
                    onClick={() => moveTo(st)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-default",
                      current
                        ? "border-primary bg-brand-soft"
                        : reached
                          ? "bg-muted/50"
                          : "hover:bg-muted/50",
                    )}
                  >
                    <span className={cn("font-medium", current && "text-brand")}>
                      {STATUS_META[st].label}
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:block">
                      {STATUS_META[st].help}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          {canWork && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setBlockOpen((v) => !v)}
              >
                <Ban /> {s.status === "blocked" ? "Change why it's blocked" : "Blocked…"}
              </Button>
              {s.status !== "skipped" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => moveTo("skipped")}
                >
                  <SkipForward /> Skip
                </Button>
              )}
            </div>
          )}
          {s.status === "blocked" && s.blockReason && !blockOpen && (
            <p className="rounded-md border border-danger/30 bg-danger-soft p-2.5 text-[13px] text-danger">
              {BLOCK_LABELS[s.blockReason]}
              {s.blockNote ? `: ${s.blockNote}` : ""}
            </p>
          )}
          {blockOpen && (
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <Select
                value={blockReason}
                onValueChange={(v) => setBlockReason(v as SubmissionBlock)}
              >
                <SelectTrigger className="w-full" aria-label="Why it's blocked">
                  <SelectValue placeholder="Why is it blocked?" />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {BLOCK_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={blockNote}
                onChange={(e) => setBlockNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="What's needed to unblock it"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setBlockOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveBlocked} disabled={pending}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Details */}
        <section className="flex flex-col gap-4" aria-label="Details">
          <Field data-invalid={Boolean(urlError) || undefined}>
            <FieldLabel htmlFor="sub-url">Live listing URL</FieldLabel>
            <Input
              id="sub-url"
              value={listingUrl}
              onChange={(e) => {
                setListingUrl(e.target.value)
                setUrlError(null)
              }}
              placeholder="https://… (the page that shows the client)"
              disabled={!canWork}
            />
            {urlError ? (
              <p className="text-[13px] text-destructive">{urlError}</p>
            ) : (
              <FieldDescription>
                Needed to mark it live. Live listings count toward this month&apos;s backlinks.
              </FieldDescription>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Link on the listing</FieldLabel>
              <Select
                value={linkKind || NONE}
                onValueChange={(v) => setLinkKind(v === NONE ? "" : (v as LinkKind))}
                disabled={!canWork}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not checked</SelectItem>
                  {LINK_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {LINK_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Assigned to</FieldLabel>
              <Select value={assigned} onValueChange={setAssigned} disabled={!canWork}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nobody</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="sub-follow">Follow up on</FieldLabel>
              <Input
                id="sub-follow"
                type="date"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                disabled={!canWork}
              />
              {followDue && <p className="text-[13px] text-warning">Follow-up is due.</p>}
            </Field>
            <Field>
              <FieldLabel htmlFor="sub-submitted">Submitted on</FieldLabel>
              <Input
                id="sub-submitted"
                type="date"
                value={submittedOn}
                max={today}
                onChange={(e) => setSubmittedOn(e.target.value)}
                disabled={!canWork}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sub-live">Live on</FieldLabel>
              <Input
                id="sub-live"
                type="date"
                value={liveOn}
                max={today}
                onChange={(e) => setLiveOn(e.target.value)}
                disabled={!canWork}
              />
              <FieldDescription>Set when you mark it live (today if empty).</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="sub-cost">Cost paid (USD)</FieldLabel>
              <Input
                id="sub-cost"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0"
                disabled={!canWork}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="sub-cost-note">Cost note</FieldLabel>
            <Input
              id="sub-cost-note"
              value={costNote}
              onChange={(e) => setCostNote(e.target.value)}
              maxLength={200}
              placeholder="Yearly, monthly, one-off, paid by the client…"
              disabled={!canWork}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sub-notes">Notes</FieldLabel>
            <Textarea
              id="sub-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="What you did, what's next. Never put passwords here: save logins below."
              disabled={!canWork}
            />
          </Field>
          {canWork && (
            <div className="flex justify-end">
              <Button
                disabled={pending}
                onClick={() => {
                  if (cost.trim() !== "" && !Number.isFinite(Number(cost))) {
                    toast.error("The cost must be a number.")
                    return
                  }
                  save(fieldsPatch(), "Saved.")
                }}
              >
                {pending ? "Saving…" : "Save details"}
              </Button>
            </div>
          )}
        </section>

        <LoginSection
          submission={s}
          logins={logins}
          canWork={canWork}
          siteName={s.site.name}
          siteUrl={startUrl ?? ""}
        />

        {site && <HowTo site={site} canWork={canWork} />}

        <section className="flex flex-col gap-2" aria-label="Listing kit">
          <h3 className="text-sm font-semibold">Listing kit</h3>
          <ListingKit fields={kit.fields} missing={kit.missing} editHref={editHref} compact />
        </section>

        <section className="flex flex-col gap-2" aria-label="History">
          <h3 className="text-sm font-semibold">History</h3>
          {mine.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nothing yet.</p>
          ) : (
            <ol className="flex flex-col gap-2 border-l pl-3">
              {mine.map((e) => (
                <li key={e.id} className="text-[13px]">
                  <span className="text-muted-foreground tabular-nums">{formatStamp(e.at)}</span>
                  <span className="mx-1.5 text-muted-foreground">·</span>
                  <span>{describeEvent(e, members)}</span>
                  {e.actor && <span className="text-muted-foreground"> by {e.actor}</span>}
                  {e.note && <p className="text-muted-foreground">{e.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  )
}

function describeEvent(e: SubmissionEvent, members: MemberOption[]): string {
  const parts: string[] = []
  if (!e.from && e.to) parts.push(`Added as ${STATUS_META[e.to].label}`)
  else if (e.to)
    parts.push(`${e.from ? STATUS_META[e.from].label : "—"} → ${STATUS_META[e.to].label}`)
  const c = e.change
  if ("assigned_to" in c)
    parts.push(
      c.assigned_to
        ? `assigned to ${members.find((m) => m.id === c.assigned_to)?.name ?? "someone"}`
        : "unassigned",
    )
  if ("follow_up_on" in c)
    parts.push(
      c.follow_up_on ? `follow up ${formatPlainDay(String(c.follow_up_on))}` : "follow-up cleared",
    )
  if ("listing_url" in c) parts.push(c.listing_url ? "listing URL saved" : "listing URL removed")
  if ("link_kind" in c && c.link_kind)
    parts.push(`link: ${LINK_LABELS[c.link_kind as LinkKind] ?? c.link_kind}`)
  if ("cost_usd" in c) parts.push(c.cost_usd === null ? "cost cleared" : `cost $${c.cost_usd}`)
  if ("login" in c) parts.push(c.login ? "login linked" : "login unlinked")
  if ("notes" in c) parts.push("notes edited")
  if ("submitted_on" in c && c.submitted_on && !e.to)
    parts.push(`submitted ${formatPlainDay(String(c.submitted_on))}`)
  if ("live_on" in c && c.live_on && !e.to) parts.push(`live ${formatPlainDay(String(c.live_on))}`)
  return parts.join(", ") || "Updated"
}

function LoginSection({
  submission: s,
  logins,
  canWork,
  siteName,
  siteUrl,
}: {
  submission: Submission
  logins: LoginOption[]
  canWork: boolean
  siteName: string
  siteUrl: string
}) {
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ siteName, siteUrl, username: "", password: "", has2fa: false })
  const [shown, setShown] = useState<string | null>(null)
  const current = s.login

  function link(id: string) {
    startTransition(async () => {
      const r = await updateSubmission(s.id, { login_id: id === NONE ? null : id })
      if (!r.ok) toast.error(r.error)
      else toast.success(id === NONE ? "Login unlinked." : "Login linked.")
    })
  }

  function saveNew() {
    startTransition(async () => {
      const r = await addBacklinkLogin(s.id, form)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success("Saved to the vault and linked.")
      setAdding(false)
      setForm({ siteName, siteUrl, username: "", password: "", has2fa: false })
    })
  }

  function reveal() {
    if (!current) return
    if (shown) {
      setShown(null)
      return
    }
    startTransition(async () => {
      const r = await revealLogin(current.id)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setShown(r.data.password)
      setTimeout(() => setShown(null), 30_000)
    })
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Login">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <KeyRound className="size-3.5 text-muted-foreground" aria-hidden /> Login for this site
      </h3>
      {current ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-[13px]">
          <span className="font-medium">{current.siteName}</span>
          <span className="text-muted-foreground">{current.username}</span>
          {current.has2fa && <StatusTag tone="info">2FA</StatusTag>}
          {shown && (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs break-all">{shown}</code>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={reveal} disabled={pending}>
            {shown ? <EyeOff /> : <Eye />} {shown ? "Hide" : "Show password"}
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          No login linked. Passwords live only in the vault, never in notes.
        </p>
      )}
      {canWork && (
        <div className="flex flex-wrap items-center gap-2">
          {logins.length > 0 && (
            <Select value={current?.id ?? NONE} onValueChange={link} disabled={pending}>
              <SelectTrigger size="sm" className="w-[240px]" aria-label="Link a saved login">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No login</SelectItem>
                {logins.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.siteName} · {l.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancel" : "Save a new login"}
          </Button>
        </div>
      )}
      {adding && (
        <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="lg-site">Site</FieldLabel>
            <Input
              id="lg-site"
              value={form.siteName}
              onChange={(e) => setForm({ ...form, siteName: e.target.value })}
              maxLength={120}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="lg-url">Login page</FieldLabel>
            <Input
              id="lg-url"
              value={form.siteUrl}
              onChange={(e) => setForm({ ...form, siteUrl: e.target.value })}
              placeholder="https://"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="lg-user">Username or email</FieldLabel>
            <Input
              id="lg-user"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoComplete="off"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="lg-pass">Password</FieldLabel>
            <Input
              id="lg-pass"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
            />
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id="lg-2fa"
              checked={form.has2fa}
              onCheckedChange={(v) => setForm({ ...form, has2fa: v === true })}
            />
            <Label htmlFor="lg-2fa" className="font-normal">
              Has two-factor sign-in
            </Label>
            <Button size="sm" className="ml-auto" onClick={saveNew} disabled={pending}>
              Save to the vault
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function HowTo({ site, canWork }: { site: CatalogSite; canWork: boolean }) {
  const [reporting, setReporting] = useState(false)
  const [note, setNote] = useState("")
  const [pending, startTransition] = useTransition()
  return (
    <section className="flex flex-col gap-2" aria-label="How it works">
      <h3 className="text-sm font-semibold">How it works</h3>
      <div className="flex flex-col gap-2 rounded-md border p-3 text-[13px]">
        {site.howTo ? (
          <p className="whitespace-pre-line">{site.howTo}</p>
        ) : (
          <p className="text-muted-foreground">
            No steps written yet: open the start page and follow the sign-up.
          </p>
        )}
        {site.needs.length > 0 && (
          <p>
            <span className="text-muted-foreground">You&apos;ll need: </span>
            {site.needs.map((n) => NEED_LABELS[n] ?? n).join(", ")}
          </p>
        )}
        {site.priceNote && (
          <p>
            <span className="text-muted-foreground">Cost: </span>
            {site.priceNote}
          </p>
        )}
        {site.notes && <p className="text-muted-foreground">{site.notes}</p>}
        {site.warnings && <p className="text-warning">{site.warnings}</p>}
        <p className="text-xs text-muted-foreground">
          {site.verifiedAt
            ? `Checked${site.verifiedBy ? ` by ${site.verifiedBy}` : ""} on ${formatStamp(site.verifiedAt)}.`
            : "Cost and link type not checked by the team yet: note what you find."}
        </p>
        {site.problemNote && (
          <p className="text-xs text-warning">Reported problem: {site.problemNote}</p>
        )}
      </div>
      {canWork && !reporting && (
        <button
          type="button"
          onClick={() => setReporting(true)}
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Flag className="size-3" aria-hidden /> Report a problem with this catalog entry
        </button>
      )}
      {reporting && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Wrong price, dead link, now nofollow…"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setReporting(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await reportCatalogProblem(site.id, note)
                  if (!r.ok) toast.error(r.error)
                  else {
                    toast.success("Sent to the managers.")
                    setReporting(false)
                    setNote("")
                  }
                })
              }
            >
              Send
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
