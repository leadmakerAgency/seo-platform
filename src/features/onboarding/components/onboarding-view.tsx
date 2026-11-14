"use client"

import {
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  ExternalLink,
  History,
  Link2,
  Loader2,
  Lock,
  LockOpen,
  MessageSquareText,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { PlatformMark } from "@/components/brand/platform-icons"
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
import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { PLATFORM_META, PLATFORMS } from "@/features/connections/constants"
import { actorLabel, describeActivity } from "@/features/team/activity"
import { formatDate, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  applyOnboardingProfile,
  createOnboardingLink,
  extendOnboardingLink,
  markGoogleVerified,
  markOnboardingReviewed,
  reopenOnboarding,
  revokeOnboardingLink,
} from "../actions"
import {
  GOOGLE_ACCESS_OPTIONS,
  ONBOARDING_STATUS_META,
  STEP_STATUS_META,
  STEPS,
  WEBSITE_MANAGERS,
  WEBSITE_PLATFORMS,
} from "../constants"
import type { OnboardingOverview } from "../queries"
import { DetailsReview } from "./details-review"
import { LoginsVault } from "./logins-vault"

type Props = {
  clientId: string
  clientSlug: string
  clientName: string
  overview: OnboardingOverview
  linkUrl: string | null
  nowIso: string
  canManage: boolean
  canReveal: boolean
  reportingEmailSet: boolean
  senderName: string
}

export function OnboardingView(props: Props) {
  const { overview: o, nowIso, canManage, clientId, clientSlug } = props
  const now = new Date(nowIso)
  const router = useRouter()
  const status = o.progress?.status ?? "not_started"
  // Accounts can still be connected after review, so keep watching while the link works.
  const live = o.link?.status === "active"

  // Watch answers arrive while the client is filling the form.
  useEffect(() => {
    if (!live) return
    const timer = window.setInterval(() => router.refresh(), 20_000)
    return () => window.clearInterval(timer)
  }, [live, router])

  return (
    <div className="flex flex-col gap-10">
      <LinkCard {...props} now={now} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight">Progress</h2>
            <StatusTag tone={ONBOARDING_STATUS_META[status].tone}>
              {ONBOARDING_STATUS_META[status].label}
            </StatusTag>
          </div>
          <span className="text-xs text-muted-foreground">
            {live ? "Updates every 20 seconds while the link is active" : ""}
            {o.progress?.submitted_at
              ? ` · Sent ${formatRelative(o.progress.submitted_at, now)}`
              : ""}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-5">
          {STEPS.map((s) => {
            const st = o.progress?.[stepColumn(s.key)] ?? "todo"
            const meta = STEP_STATUS_META[st]
            return (
              <div
                key={s.key}
                className="flex flex-col gap-2 bg-card p-3 last:odd:col-span-2 md:last:odd:col-span-1"
              >
                <span className="text-sm font-medium">{s.label}</span>
                <StatusTag tone={meta.tone} className="w-fit">
                  {meta.label}
                </StatusTag>
              </div>
            )
          })}
        </div>
      </section>

      <DetailsReview
        clientId={clientId}
        submitted={o.submitted}
        profile={o.profile}
        client={o.client}
        canManage={canManage}
        now={now}
        onApply={applyOnboardingProfile}
      />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight">
            Google profile & social media
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/clients/${clientSlug}/connections`}>
              Open Connections
              <ExternalLink />
            </Link>
          </Button>
        </div>
        <ul className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORMS.map((p) => {
            const mine = o.accounts.filter((a) => a.platform === p)
            const skipped = o.notUsing.includes(p)
            return (
              <li
                key={p}
                className="flex items-center gap-3 bg-card px-3 py-2.5 sm:last:odd:col-span-2 lg:last:odd:col-span-1"
              >
                <PlatformMark platform={p} className="size-7 text-[11px]" />
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{PLATFORM_META[p].label}</span>
                  <span
                    className={cn(
                      "truncate text-xs",
                      mine.some((a) => a.status === "needs_reconnect")
                        ? "text-warning"
                        : mine.length
                          ? "text-success"
                          : "text-muted-foreground",
                    )}
                  >
                    {mine.length
                      ? mine.map((a) => a.name).join(", ") +
                        (mine.some((a) => a.status === "needs_reconnect")
                          ? " (needs reconnecting)"
                          : "")
                      : skipped
                        ? "Client doesn't use it"
                        : "Not connected"}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <GoogleAccess {...props} />
      <Website overview={o} />

      <LoginsVault
        clientId={clientId}
        logins={o.logins}
        canManage={canManage}
        canReveal={props.canReveal}
        now={now}
      />

      {canManage && (
        <FinishCard
          clientId={clientId}
          status={status}
          stage={o.client.stage}
          reviewedAt={o.progress?.reviewed_at ?? null}
          now={now}
        />
      )}

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-2 text-muted-foreground">
            <History />
            History ({o.history.length})
            <ChevronDown />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {o.history.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ol className="mt-2 flex flex-col gap-2 border-l pl-4">
              {o.history.map((h) => (
                <li key={h.id} className="text-sm">
                  <span className="font-medium">{actorLabel(h, "The client")}</span>{" "}
                  <span className="text-muted-foreground">
                    {describeActivity({ ...h, clientName: props.clientName })}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatRelative(h.createdAt, now)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

const stepColumn = (key: (typeof STEPS)[number]["key"]) =>
  (
    ({
      business: "business_status",
      social: "social_status",
      google: "google_access_status",
      website: "website_status",
      logins: "logins_status",
    }) as const
  )[key]

function LinkCard({
  clientId,
  clientName,
  overview,
  linkUrl,
  canManage,
  senderName,
  now,
}: Props & { now: Date }) {
  const link = overview.link
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<"new" | "off" | null>(null)
  const [copied, setCopied] = useState<"link" | "message" | null>(null)
  const active = link?.status === "active" && Date.parse(link.expiresAt) > now.getTime()
  // A reviewed onboarding is locked: a new link would only let the client look.
  const locked = overview.progress?.status === "reviewed"
  const [unlock, setUnlock] = useState(true)
  const create = (success: string) =>
    run(() => createOnboardingLink(clientId, { reopen: locked && unlock }), success)

  const unlockChoice = locked && canManage && (
    <label className="flex items-start gap-2 text-sm">
      <Checkbox
        className="mt-0.5"
        checked={unlock}
        onCheckedChange={(c) => setUnlock(c === true)}
      />
      <span>
        Let the client change their answers
        <span className="block text-muted-foreground">
          The onboarding was reviewed, so their answers are locked. Untick to send a link they can
          only look at (they can still connect accounts).
        </span>
      </span>
    </label>
  )

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const r = await action()
      if (!r.ok) toast.error(r.error ?? "Something went wrong.")
      else toast.success(success)
    })
  }

  async function copy(kind: "link" | "message") {
    if (!linkUrl || !link) return
    const text =
      kind === "link"
        ? linkUrl
        : [
            "Hi!",
            "",
            `To get ${clientName} set up with LeadMaker, please fill in this short form and connect your Google and social accounts. It takes about 15 minutes and saves as you go:`,
            linkUrl,
            "",
            `The link is private to you and works until ${formatDate(link.expiresAt)}.`,
            "",
            `Thanks, ${senderName}`,
          ].join("\n")
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error("Couldn't copy. Your browser blocked the clipboard.")
    }
  }

  if (!active) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">
                {link
                  ? link.status === "revoked"
                    ? "The last link was turned off"
                    : "The last link expired"
                  : "No onboarding link yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {canManage
                  ? `Create a private link for ${clientName}. They fill in their details and connect their accounts; nothing to sign in to.`
                  : "An admin or account manager can create the onboarding link."}
              </p>
            </div>
          </div>
          {canManage && (
            <Button
              className="shrink-0"
              disabled={pending}
              onClick={() =>
                create(
                  locked && unlock
                    ? "Link created. The client can change their answers again."
                    : "Onboarding link created",
                )
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              {link ? "Create a new link" : "Create onboarding link"}
            </Button>
          )}
        </div>
        {unlockChoice}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">Onboarding link</p>
        <p className="text-sm text-muted-foreground">
          Send this to {clientName}. Anyone with the link can fill in this client&apos;s onboarding,
          so send it only to them.
        </p>
      </div>
      {linkUrl && (
        <div className="flex flex-col gap-2 lg:flex-row">
          <Input
            readOnly
            value={linkUrl}
            aria-label="Onboarding link"
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => copy("link")}>
              {copied === "link" ? <Check /> : <Copy />}
              {copied === "link" ? "Copied" : "Copy link"}
            </Button>
            <Button variant="outline" onClick={() => copy("message")}>
              {copied === "message" ? <Check /> : <MessageSquareText />}
              {copied === "message" ? "Copied" : "Copy message"}
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Open the onboarding page">
              <a href={linkUrl} target="_blank" rel="noreferrer">
                <ExternalLink />
              </a>
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {link.firstOpenedAt
            ? `Opened by the client ${formatRelative(link.lastOpenedAt ?? link.firstOpenedAt, now)}`
            : "The client hasn't opened it yet"}
          {` · works until ${formatDate(link.expiresAt)}`}
          {link.createdBy ? ` · created by ${link.createdBy}` : ""}
        </span>
        {canManage && (
          <span className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-muted-foreground"
              disabled={pending}
              onClick={() => run(() => extendOnboardingLink(link.id), "Link extended by 30 days")}
            >
              Extend 30 days
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-muted-foreground"
              onClick={() => setConfirm("new")}
            >
              <RefreshCw />
              New link
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-muted-foreground"
              onClick={() => setConfirm("off")}
            >
              Turn off
            </Button>
          </span>
        )}
      </div>

      {locked && (
        <div className="flex flex-col gap-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              The client&apos;s answers are locked because this onboarding was reviewed. With this
              link they can look at their answers and connect accounts, but not change anything.
            </span>
          </p>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 bg-background"
              disabled={pending}
              onClick={() =>
                run(() => reopenOnboarding(clientId), "Unlocked. The client can edit again.")
              }
            >
              <LockOpen />
              Let the client edit again
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "new" ? "Replace the onboarding link?" : "Turn the link off?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              The current link stops working straight away. Everything the client already filled in
              is kept.
              {confirm === "new" ? " Send them the new link." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "new" && unlockChoice}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirm === "new"
                  ? create(
                      locked && unlock
                        ? "New link created and the answers unlocked. The old link is off."
                        : "New link created. The old one is off.",
                    )
                  : run(() => revokeOnboardingLink(link.id), "Link turned off")
              }
            >
              {confirm === "new" ? "Replace link" : "Turn off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function GoogleAccess({ clientId, overview, canManage, reportingEmailSet }: Props) {
  const g = overview.google
  const [pending, startTransition] = useTransition()
  const label = (s: string | undefined) =>
    GOOGLE_ACCESS_OPTIONS.find((o) => o.value === s)?.label ?? "Not answered yet"

  const rows = [
    {
      which: "sc" as const,
      title: "Search Console",
      status: g?.sc_status,
      property: g?.sc_property,
      verified: g?.sc_verified_at,
    },
    {
      which: "ga4" as const,
      title: "Google Analytics (GA4)",
      status: g?.ga4_status,
      property: g?.ga4_property,
      verified: g?.ga4_verified_at,
    },
  ]

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[15px] font-semibold tracking-tight">Google reporting access</h2>
      {!reportingEmailSet && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          GOOGLE_REPORTING_EMAIL isn&apos;t set, so clients are told you&apos;ll send them the email
          to add.
        </p>
      )}
      <ul className="divide-y rounded-lg border bg-card">
        {rows.map((r) => (
          <li key={r.which} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">{r.title}</span>
              <span className="text-sm text-muted-foreground">
                {label(r.status)}
                {r.property ? ` · ${r.property}` : ""}
              </span>
            </div>
            {r.verified ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                <CircleCheck className="size-3.5" /> Verified
              </span>
            ) : null}
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await markGoogleVerified(clientId, r.which, !r.verified)
                    if (!res.ok) toast.error(res.error)
                  })
                }
              >
                {r.verified ? "Unmark" : "Mark verified"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {g?.notes && <p className="text-sm text-muted-foreground">Client note: {g.notes}</p>}
    </section>
  )
}

function Website({ overview }: { overview: OnboardingOverview }) {
  const w = overview.website
  const platform = WEBSITE_PLATFORMS.find((p) => p.value === w?.platform)?.label
  const manager = WEBSITE_MANAGERS.find((m) => m.value === w?.managed_by)?.label
  const access = {
    todo: "Not answered yet",
    invited_us: "Says they invited us",
    login_in_vault: "Shared a login instead",
    later: "Later / needs help",
  }[w?.access_status ?? "todo"]

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[15px] font-semibold tracking-tight">Website</h2>
      {!w ? (
        <p className="text-sm text-muted-foreground">Not answered yet.</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2">
          <Item label="Platform">{platform ?? "—"}</Item>
          <Item label="Address">
            {w.url ? (
              <a
                href={w.url}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-4 hover:underline"
              >
                {w.url}
              </a>
            ) : (
              "—"
            )}
          </Item>
          <Item label="Looked after by">
            {manager ?? "—"}
            {w.developer_name || w.developer_email
              ? ` · ${[w.developer_name, w.developer_email].filter(Boolean).join(", ")}`
              : ""}
          </Item>
          <Item label="Access">{access}</Item>
          {w.notes && (
            <Item label="Notes" className="sm:col-span-2">
              {w.notes}
            </Item>
          )}
        </dl>
      )}
    </section>
  )
}

function Item({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  )
}

function FinishCard({
  clientId,
  status,
  stage,
  reviewedAt,
  now,
}: {
  clientId: string
  status: string
  stage: string
  reviewedAt: string | null
  now: Date
}) {
  const [pending, startTransition] = useTransition()
  const [activate, setActivate] = useState(stage === "onboarding")

  if (status === "reviewed") {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <p className="flex items-center gap-2 text-sm">
          <CircleCheck className="size-4 text-success" aria-hidden />
          Onboarding reviewed {reviewedAt ? formatRelative(reviewedAt, now) : ""}. The client&apos;s
          answers are locked.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await reopenOnboarding(clientId)
              if (!r.ok) toast.error(r.error)
              else toast.success("Reopened. The client can edit again.")
            })
          }
        >
          Let the client edit again
        </Button>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold tracking-tight">Finish onboarding</h2>
        <p className="text-sm text-muted-foreground">
          When you&apos;ve checked everything and applied the details, mark it reviewed. The
          client&apos;s answers are then locked and the Needs attention alert clears.
        </p>
      </div>
      {stage === "onboarding" && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={activate} onCheckedChange={(c) => setActivate(c === true)} />
          Also move the client from Onboarding to Active
        </label>
      )}
      <Button
        className="w-fit"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await markOnboardingReviewed(clientId, activate)
            if (!r.ok) toast.error(r.error)
            else toast.success("Onboarding marked reviewed")
          })
        }
      >
        {pending && <Loader2 className="animate-spin" />}
        Mark onboarding reviewed
      </Button>
    </section>
  )
}
