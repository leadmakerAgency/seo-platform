"use client"

import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  ImagePlus,
  Pencil,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { PlatformLogo } from "@/components/brand/platform-icons"
import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { PLATFORM_META } from "@/features/connections/constants"
import { formatNumber, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  cancelPost,
  checkPost,
  deletePost,
  duplicatePost,
  editPublishedText,
  retryFailedPost,
  savePost,
  schedulePost,
  unpublishTarget,
  type PostInput,
} from "../actions"
import {
  checkTarget,
  CTA_TYPES,
  EDITABLE_STATUSES,
  PLATFORM_RULES,
  TARGET_META,
  textLength,
  TIKTOK_PRIVACY,
  type Issue,
  type PostPlatform,
  type TargetSettings,
} from "../constants"
import type { ContentAccount, ContentEvent, ContentSettings, MediaRow, PostRow } from "../queries"
import { formatInZone, utcToZoned, zonedToUtc, zoneLabel } from "../time"
import { useConfirm } from "./confirm"
import { MediaThumb, UploadButton } from "./media-library"

type TargetDraft = { customContent: string | null; customMediaIds: string[] | null; settings: TargetSettings }



const FIX: Record<string, string> = {
  auth_expired: "Reconnect this account in Connections, then try again.",
  account_issue: "Check the account in Connections.",
  user_content: "Change the text or files, then duplicate the post and send it again.",
  platform_rate_limit: "The platform is limiting posts right now. Try again later.",
  quota_exhausted: "This account reached its daily posting limit. Try again tomorrow.",
  platform_error: "The platform had a problem. Try again.",
  system_error: "Zernio had a problem. Try again.",
}

type Common = {
  clientId: string
  /** /clients/<slug>/content */
  contentHref: string
  connectionsHref: string
  media: MediaRow[]
  settings: ContentSettings
  canWrite: boolean
  events: ContentEvent[]
}

/** The post page: the writer for drafts and scheduled posts, the results for sent ones. */
export function PostWorkspace(props: Common & { post: PostRow | null; initialDate: string | null; accounts: ContentAccount[] }) {
  const { post } = props
  if (post && !EDITABLE_STATUSES.has(post.status)) return <SentPost {...props} post={post} />
  return <Writer key={post?.id ?? "new"} {...props} />
}

// ---------------------------------------------------------------------------
// Writing and scheduling
// ---------------------------------------------------------------------------

function Writer({
  clientId,
  contentHref,
  connectionsHref,
  post,
  initialDate,
  accounts,
  media,
  settings,
  canWrite,
  events,
}: Common & { post: PostRow | null; initialDate: string | null; accounts: ContentAccount[] }) {
  const router = useRouter()
  const confirm = useConfirm()
  const tz = settings.timezone
  const startWhen = post?.scheduledFor ? utcToZoned(post.scheduledFor, tz) : { date: initialDate ?? "", time: initialDate ? "09:00" : "" }

  const [postId, setPostId] = useState<string | null>(post?.id ?? null)
  const [label, setLabel] = useState(post?.title ?? "")
  const [content, setContent] = useState(post?.content ?? "")
  const [mediaIds, setMediaIds] = useState<string[]>(post?.mediaIds ?? [])
  const [date, setDate] = useState(startWhen.date)
  const [time, setTime] = useState(startWhen.time)
  const [chosen, setChosen] = useState<string[]>(() => post?.targets.map((t) => t.socialAccountId).filter((x): x is string => Boolean(x)) ?? [])
  const [drafts, setDrafts] = useState<Record<string, TargetDraft>>(() =>
    Object.fromEntries(
      (post?.targets ?? [])
        .filter((t) => t.socialAccountId)
        .map((t) => [t.socialAccountId!, { customContent: t.customContent, customMediaIds: t.customMediaIds, settings: t.settings }]),
    ),
  )
  const [tab, setTab] = useState<string>("all")
  const [zernio, setZernio] = useState<{ errors: string[]; warnings: string[] } | null>(null)
  const [busy, setBusy] = useState<null | "save" | "schedule" | "now" | "check" | "cancel">(null)
  const [, startTransition] = useTransition()
  // The clock for "at least 2 minutes ahead", ticking while the page is open.
  // Set after mount (never during render) and every 30 s; 0 until then means "not too soon".
  const [now, setNow] = useState(0)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = window.setTimeout(tick, 0)
    const t = window.setInterval(tick, 30_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(t)
    }
  }, [])
  const scheduled = post?.status === "scheduled"
  const behind = scheduled && post && post.sentVersion !== null && post.version > post.sentVersion

  const byId = useMemo(() => new Map(media.map((m) => [m.id, m])), [media])
  const selected = accounts.filter((a) => chosen.includes(a.id))
  const draftOf = (id: string): TargetDraft => drafts[id] ?? { customContent: null, customMediaIds: null, settings: {} }
  const setDraft = (id: string, patch: Partial<TargetDraft>) => setDrafts((d) => ({ ...d, [id]: { ...draftOf(id), ...patch } }))

  const toggle = (a: ContentAccount) => {
    setChosen((c) => (c.includes(a.id) ? c.filter((x) => x !== a.id) : [...c, a.id]))
    if (a.platform === "googlebusiness" && !drafts[a.id] && settings.defaultCtaUrl) {
      setDraft(a.id, { settings: { ctaType: "LEARN_MORE", ctaUrl: settings.defaultCtaUrl } })
    }
    if (tab === a.id) setTab("all")
  }

  const issuesFor = (a: ContentAccount): Issue[] => {
    const d = draftOf(a.id)
    const items = (d.customMediaIds ?? mediaIds).map((id) => byId.get(id)).filter((m): m is MediaRow => Boolean(m))
    const out = checkTarget(a.platform as PostPlatform, d.customContent ?? content, items, d.settings)
    if (a.status !== "connected") out.unshift({ level: "error", message: "Needs reconnecting in Connections." })
    if (a.canPost === false) out.unshift({ level: "warning", message: "Zernio says this account can't post right now." })
    return out
  }
  const allIssues = selected.map((a) => ({ a, issues: issuesFor(a) }))
  const errorCount = allIssues.reduce((n, x) => n + x.issues.filter((i) => i.level === "error").length, 0)
  const blocking = errorCount > 0 || selected.length === 0
  const scheduledFor = date && time ? zonedToUtc(date, time, tz) : null
  const tooSoon = scheduledFor && now ? Date.parse(scheduledFor) < now + 2 * 60 * 1000 : false

  const input = (): PostInput => ({
    id: postId,
    title: label.trim() || null,
    content,
    mediaIds,
    scheduledFor,
    timezone: tz,
    targets: selected.map((a) => ({ socialAccountId: a.id, ...draftOf(a.id) })),
  })

  /** Saves; a new post gets its own address without reloading the page. */
  const save = async (quiet = false): Promise<string | null> => {
    const r = await savePost(clientId, input())
    if (!r.ok) {
      toast.error(r.error)
      return null
    }
    if (r.data.warning) toast.warning(r.data.warning)
    else if (!quiet) toast.success(scheduled ? "Changes saved and sent to Zernio" : "Draft saved")
    if (!postId) {
      setPostId(r.data.id)
      window.history.replaceState(null, "", `${contentHref}/posts/${r.data.id}`)
    }
    return r.data.id
  }

  // Every question is asked before the work starts, never inside a transition.
  const run = async (kind: NonNullable<typeof busy>, work: () => Promise<void>) => {
    setBusy(kind)
    try {
      await work()
    } finally {
      setBusy(null)
    }
  }

  const send = async (mode: "schedule" | "now") => {
    if (mode === "schedule" && (!scheduledFor || tooSoon)) {
      toast.error("Pick a date and time at least 2 minutes from now.")
      return
    }
    const yes = await confirm(
      mode === "now"
        ? {
            title: "Publish now?",
            description: `This goes out right away to ${selected.length} ${selected.length === 1 ? "account" : "accounts"}: ${selected.map((a) => a.name).join(", ")}.`,
            action: "Publish now",
          }
        : {
            title: `Schedule for ${formatInZone(scheduledFor!, tz, { weekday: "short" })}?`,
            description: `Zernio publishes it at that time (${zoneLabel(tz)}) to ${selected.length} ${selected.length === 1 ? "account" : "accounts"}. You can change or cancel it until then.`,
            action: "Schedule",
          },
    )
    if (!yes) return
    await run(mode, async () => {
      const id = await save(true)
      if (!id) return
      const r = await schedulePost(id, mode)
      if (!r.ok) {
        toast.error(r.error, { duration: 12_000 })
        startTransition(() => router.refresh())
        return
      }
      toast.success(
        mode === "now"
          ? r.data.status === "published"
            ? "Published"
            : "Sent to Zernio. Publishing now…"
          : `Scheduled for ${formatInZone(scheduledFor!, tz)}`,
        { action: { label: "View", onClick: () => router.push(`${contentHref}/posts/${id}`) } },
      )
      // Back to the Posts list, where the post now shows with its status.
      router.push(`${contentHref}?tab=posts`)
    })
  }

  const disabled = Boolean(busy) || !canWrite

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      {/* Left: writing */}
      <div className="flex min-w-0 flex-col gap-6">
        <Card title="Post to" description="Pick one or more of the client's connected accounts.">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No social accounts are connected.{" "}
              <Link className="underline" href={connectionsHref}>
                Connect them in Connections
              </Link>
              .
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
              {accounts.map((a) => {
                const on = chosen.includes(a.id)
                const broken = a.status !== "connected"
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={!canWrite || (broken && !on)}
                    onClick={() => toggle(a)}
                    aria-pressed={on}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                      on ? "border-foreground/50 bg-muted" : "bg-background hover:bg-muted/50",
                      broken && "opacity-60",
                    )}
                  >
                    <PlatformLogo platform={a.platform} className="size-5" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{a.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {broken ? "Needs reconnecting" : PLATFORM_META[a.platform].label}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border",
                        on ? "border-foreground bg-foreground text-background" : "border-input",
                      )}
                    >
                      {on && <Check className="size-3.5" />}
                      {!on && broken && <TriangleAlert className="size-3 text-warning" />}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        <Card title="Text" description="One text for everyone. Open an account to give it its own text, files and options.">
          <div role="tablist" aria-label="Text for" className="-mt-1 flex max-w-full gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabButton active={tab === "all"} onClick={() => setTab("all")}>
              Everyone
            </TabButton>
            {selected.map((a) => {
              const err = issuesFor(a).some((i) => i.level === "error")
              const own = draftOf(a.id).customContent !== null || draftOf(a.id).customMediaIds !== null
              return (
                <TabButton key={a.id} active={tab === a.id} onClick={() => setTab(a.id)}>
                  <PlatformLogo platform={a.platform} className="size-3.5" />
                  <span className="max-w-[140px] truncate">{a.name}</span>
                  {own && <span className="size-1.5 rounded-full bg-brand" aria-label="Customised" />}
                  {err && <CircleAlert className="size-3.5 text-danger" aria-label="Has problems" />}
                </TabButton>
              )
            })}
          </div>

          {tab === "all" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="post-text" className="sr-only">
                Text
              </Label>
              <Textarea
                id="post-text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
                placeholder="What should the post say?"
                disabled={!canWrite}
                className="min-h-[220px] text-[15px] leading-6"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {selected.length === 0 && <span className="text-muted-foreground">{formatNumber(textLength(content))} characters</span>}
                  {[...new Set(selected.map((a) => a.platform as PostPlatform))].map((p) => {
                    const len = textLength(content)
                    const lim = PLATFORM_RULES[p].limit
                    return (
                      <span key={p} className={cn("flex items-center gap-1 tabular-nums", len > lim ? "text-danger" : len > lim * 0.9 ? "text-warning" : "text-muted-foreground")}>
                        <PlatformLogo platform={p} className="size-3" />
                        {formatNumber(len)}/{formatNumber(lim)}
                      </span>
                    )
                  })}
                </div>
                {settings.signature && canWrite && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setContent((c) => (c.includes(settings.signature!) ? c : `${c.trimEnd()}\n\n${settings.signature}`))}
                  >
                    Add signature
                  </Button>
                )}
              </div>
            </div>
          ) : (
            (() => {
              const a = selected.find((x) => x.id === tab)
              if (!a) return null
              return (
                <AccountPanel
                  key={a.id}
                  account={a}
                  draft={draftOf(a.id)}
                  mainContent={content}
                  mainMedia={mediaIds}
                  media={media}
                  clientId={clientId}
                  canWrite={canWrite}
                  onChange={(patch) => setDraft(a.id, patch)}
                />
              )
            })()
          )}
        </Card>

        <Card
          title="Images and video"
          description="Instagram, TikTok, YouTube and Pinterest need one. The first file is the cover."
          actions={
            canWrite ? (
              <div className="flex gap-2">
                <MediaPicker media={media} chosen={mediaIds} onPick={(id) => setMediaIds((m) => (m.includes(id) ? m : [...m, id].slice(0, 20)))} />
                <UploadButton
                  clientId={clientId}
                  onUploaded={(id) => {
                    setMediaIds((m) => [...m, id].slice(0, 20))
                    startTransition(() => router.refresh())
                  }}
                />
              </div>
            ) : null
          }
        >
          <MediaStrip ids={mediaIds} byId={byId} canWrite={canWrite} onChange={setMediaIds} />
        </Card>

        {post && events.length > 0 && (
          <Card title="History">
            <History events={events} />
          </Card>
        )}
      </div>

      {/* Right: publish, checks, preview */}
      <aside className="flex flex-col gap-4 xl:sticky xl:top-20">
        <Card title={scheduled ? "Scheduled" : "Publish"}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="post-date">Date</Label>
              <Input id="post-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={disabled} className="w-[160px]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="post-time">Time</Label>
              <Input id="post-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={disabled} className="w-[120px]" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {zoneLabel(tz)}
            {tooSoon && <span className="text-warning"> · pick a time at least 2 minutes ahead</span>}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="post-label">Internal name (optional)</Label>
            <Input id="post-label" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder="Shown on the calendar" disabled={disabled} />
          </div>

          {behind && <p className="text-xs text-warning">Zernio has an older version. Save changes to send this one.</p>}
          {post?.lastError && (
            <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft p-2 text-sm text-danger">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {post.lastError}
            </p>
          )}

          {canWrite && (
            <div className="flex flex-col gap-2 border-t pt-3">
              {scheduled ? (
                <>
                  <Button disabled={disabled || blocking} onClick={() => run("save", async () => void (await save()))}>
                    {busy === "save" ? "Saving…" : "Save changes"}
                  </Button>
                  <Button variant="outline" disabled={disabled || blocking} onClick={() => send("now")}>
                    <Send />
                    {busy === "now" ? "Publishing…" : "Publish now instead"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-danger hover:text-danger"
                    disabled={disabled}
                    onClick={async () => {
                      const yes = await confirm({
                        title: "Cancel this post?",
                        description: "It won't go out. It stays here as a draft you can schedule again.",
                        action: "Cancel post",
                        danger: true,
                      })
                      if (!yes || !post) return
                      await run("cancel", async () => {
                        const r = await cancelPost(post.id)
                        if (r.ok) {
                          toast.success("Cancelled. It's a draft again.")
                          startTransition(() => router.refresh())
                        } else toast.error(r.error)
                      })
                    }}
                  >
                    {busy === "cancel" ? "Cancelling…" : "Cancel post"}
                  </Button>
                </>
              ) : (
                <>
                  <Button disabled={disabled || blocking || !scheduledFor || tooSoon} onClick={() => send("schedule")}>
                    <CalendarClock />
                    {busy === "schedule" ? "Scheduling…" : "Schedule"}
                  </Button>
                  <Button variant="outline" disabled={disabled || blocking} onClick={() => send("now")}>
                    <Send />
                    {busy === "now" ? "Publishing…" : "Publish now"}
                  </Button>
                  <Button variant="ghost" disabled={disabled} onClick={() => run("save", async () => void (await save()))}>
                    {busy === "save" ? "Saving…" : "Save draft"}
                  </Button>
                </>
              )}
              {blocking && (
                <p className="text-xs text-muted-foreground">
                  {selected.length === 0 ? "Pick at least one account." : `Fix ${errorCount} ${errorCount === 1 ? "problem" : "problems"} below first.`}
                </p>
              )}
            </div>
          )}
        </Card>

        {selected.length > 0 && (
          <Card
            title="Checks"
            actions={
              canWrite ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    run("check", async () => {
                      const id = await save(true)
                      if (!id) return
                      const r = await checkPost(id)
                      if (r.ok) setZernio(r.data)
                      else toast.error(r.error)
                    })
                  }
                >
                  <ShieldCheck />
                  {busy === "check" ? "Checking…" : "Check with Zernio"}
                </Button>
              ) : null
            }
          >
            <ul className="flex flex-col gap-1.5 text-sm">
              {allIssues.map(({ a, issues }) =>
                issues.length === 0 ? (
                  <li key={a.id} className="flex items-center gap-2 text-muted-foreground">
                    <PlatformLogo platform={a.platform} className="size-3.5" />
                    <span className="truncate">{a.name}: ready</span>
                    <Check className="size-3.5 text-success" aria-hidden />
                  </li>
                ) : (
                  issues.map((i, n) => (
                    <li key={`${a.id}-${n}`} className={cn("flex items-start gap-2", i.level === "error" ? "text-danger" : "text-warning")}>
                      <PlatformLogo platform={a.platform} className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        {a.name}: {i.message}
                      </span>
                    </li>
                  ))
                ),
              )}
            </ul>
            {zernio && (
              <div className="rounded-md border bg-muted/40 p-2 text-sm">
                <p className="font-medium">Zernio&apos;s check</p>
                {zernio.errors.length === 0 && zernio.warnings.length === 0 && <p className="text-success">No problems found.</p>}
                {zernio.errors.map((e) => (
                  <p key={e} className="text-danger">
                    {e}
                  </p>
                ))}
                {zernio.warnings.map((w) => (
                  <p key={w} className="text-warning">
                    {w}
                  </p>
                ))}
              </div>
            )}
          </Card>
        )}

        {selected.length > 0 && (
          <Card title="Preview" description="Roughly how each account shows it.">
            <div className="flex flex-col gap-3">
              {selected.map((a) => {
                const d = draftOf(a.id)
                const text = d.customContent ?? content
                const first = (d.customMediaIds ?? mediaIds).map((id) => byId.get(id)).find(Boolean)
                const fold = PLATFORM_RULES[a.platform as PostPlatform].fold
                return (
                  <article key={a.id} className="flex flex-col gap-2 rounded-lg border bg-background p-3">
                    <header className="flex items-center gap-2 text-sm font-medium">
                      <PlatformLogo platform={a.platform} className="size-4" />
                      <span className="truncate">{a.name}</span>
                    </header>
                    {d.settings.title && <p className="text-sm font-semibold">{d.settings.title}</p>}
                    <p className="text-sm break-words whitespace-pre-wrap">
                      {text.length > fold ? (
                        <>
                          {text.slice(0, fold)}
                          <span className="text-muted-foreground">… see more</span>
                        </>
                      ) : (
                        text || <span className="text-muted-foreground">No text</span>
                      )}
                    </p>
                    {first && <MediaThumb m={first} className="aspect-video" />}
                  </article>
                )
              })}
            </div>
          </Card>
        )}
      </aside>
    </div>
  )
}

function Card({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-sm whitespace-nowrap",
        active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function MediaStrip({
  ids,
  byId,
  canWrite,
  onChange,
}: {
  ids: string[]
  byId: Map<string, MediaRow>
  canWrite: boolean
  onChange: (ids: string[]) => void
}) {
  if (!ids.length) return <p className="text-sm text-muted-foreground">No files yet.</p>
  const move = (i: number, d: -1 | 1) => {
    const next = [...ids]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  return (
    <ol className="flex flex-wrap gap-3">
      {ids.map((id, i) => {
        const m = byId.get(id)
        return (
          <li key={id} className="flex w-[112px] flex-col gap-1">
            {m ? <MediaThumb m={m} /> : <span className="grid aspect-square place-items-center rounded-md border text-xs text-muted-foreground">Removed</span>}
            {canWrite && (
              <div className="flex justify-between">
                <Button type="button" variant="ghost" size="icon" className="size-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">
                  <ArrowLeft />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-7" disabled={i === ids.length - 1} onClick={() => move(i, 1)} aria-label="Move later">
                  <ArrowRight />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => onChange(ids.filter((x) => x !== id))} aria-label="Remove">
                  <X />
                </Button>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function MediaPicker({ media, chosen, onPick }: { media: MediaRow[]; chosen: string[]; onPick: (id: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={media.length === 0}>
          <ImagePlus />
          From library
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,420px)]">
        <ul className="grid max-h-[320px] grid-cols-4 gap-2 overflow-y-auto">
          {media.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onPick(m.id)}
                className={cn("w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring", chosen.includes(m.id) && "opacity-40")}
                title={m.title || m.fileName}
                aria-label={`Add ${m.title || m.fileName}`}
              >
                <MediaThumb m={m} />
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

/** One account's own text, files and options. */
function AccountPanel({
  account: a,
  draft,
  mainContent,
  mainMedia,
  media,
  clientId,
  canWrite,
  onChange,
}: {
  account: ContentAccount
  draft: TargetDraft
  mainContent: string
  mainMedia: string[]
  media: MediaRow[]
  clientId: string
  canWrite: boolean
  onChange: (patch: Partial<TargetDraft>) => void
}) {
  const p = a.platform as PostPlatform
  const s = draft.settings
  const set = (patch: Partial<TargetSettings>) => onChange({ settings: { ...s, ...patch } })
  const byId = new Map(media.map((m) => [m.id, m]))
  const ownText = draft.customContent !== null
  const ownMedia = draft.customMediaIds !== null
  const len = textLength(draft.customContent ?? mainContent)
  const lim = PLATFORM_RULES[p].limit

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{PLATFORM_RULES[p].hint}</p>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={ownText} disabled={!canWrite} onCheckedChange={(v) => onChange({ customContent: v ? mainContent : null })} />
        Different text for this account
      </label>
      {ownText && (
        <div className="flex flex-col gap-1">
          <Textarea value={draft.customContent ?? ""} rows={8} disabled={!canWrite} onChange={(e) => onChange({ customContent: e.target.value })} aria-label={`Text for ${a.name}`} />
          <span className={cn("text-xs tabular-nums", len > lim ? "text-danger" : "text-muted-foreground")}>
            {formatNumber(len)}/{formatNumber(lim)}
          </span>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={ownMedia} disabled={!canWrite} onCheckedChange={(v) => onChange({ customMediaIds: v ? [...mainMedia] : null })} />
        Different files for this account
      </label>
      {ownMedia && (
        <div className="flex flex-col gap-2">
          {canWrite && (
            <div className="flex gap-2">
              <MediaPicker media={media} chosen={draft.customMediaIds ?? []} onPick={(id) => onChange({ customMediaIds: [...(draft.customMediaIds ?? []), id].slice(0, 20) })} />
              <UploadButton clientId={clientId} onUploaded={(id) => onChange({ customMediaIds: [...(draft.customMediaIds ?? []), id].slice(0, 20) })} />
            </div>
          )}
          <MediaStrip ids={draft.customMediaIds ?? []} byId={byId} canWrite={canWrite} onChange={(ids) => onChange({ customMediaIds: ids })} />
        </div>
      )}

      {(p === "instagram" || p === "facebook") && (
        <Field label="Post as">
          <Select value={s.contentType ?? "feed"} onValueChange={(v) => set({ contentType: v as TargetSettings["contentType"] })} disabled={!canWrite}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="feed">{p === "instagram" ? "Feed post or Reel" : "Feed post"}</SelectItem>
              <SelectItem value="story">Story</SelectItem>
              {p === "facebook" && <SelectItem value="reel">Reel</SelectItem>}
            </SelectContent>
          </Select>
        </Field>
      )}
      {(p === "youtube" || p === "pinterest") && (
        <Field label={p === "youtube" ? "Video title" : "Pin title (optional)"}>
          <Input value={s.title ?? ""} maxLength={100} disabled={!canWrite} onChange={(e) => set({ title: e.target.value })} />
        </Field>
      )}
      {p === "youtube" && (
        <Field label="Who can see it">
          <Select value={s.visibility ?? "public"} onValueChange={(v) => set({ visibility: v as TargetSettings["visibility"] })} disabled={!canWrite}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="unlisted">Unlisted</SelectItem>
              <SelectItem value="private">Private</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}
      {p === "pinterest" && (
        <>
          <Field label="Board ID" hint="From the board's page in Pinterest, or ask the client which board to use.">
            <Input value={s.boardId ?? ""} disabled={!canWrite} onChange={(e) => set({ boardId: e.target.value })} />
          </Field>
          <Field label="Link (optional)">
            <Input value={s.link ?? ""} inputMode="url" placeholder="https://" disabled={!canWrite} onChange={(e) => set({ link: e.target.value })} />
          </Field>
        </>
      )}
      {p === "googlebusiness" && (
        <>
          <Field label="Button">
            <Select value={s.ctaType ?? "none"} onValueChange={(v) => set({ ctaType: v === "none" ? undefined : v })} disabled={!canWrite}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No button</SelectItem>
                {CTA_TYPES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {s.ctaType && s.ctaType !== "CALL" && (
            <Field label="Button link">
              <Input value={s.ctaUrl ?? ""} inputMode="url" placeholder="https://" disabled={!canWrite} onChange={(e) => set({ ctaUrl: e.target.value })} />
            </Field>
          )}
        </>
      )}
      {p === "tiktok" && (
        <>
          <Field label="Who can watch">
            <Select value={s.privacy ?? "PUBLIC_TO_EVERYONE"} onValueChange={(v) => set({ privacy: v })} disabled={!canWrite}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIKTOK_PRIVACY.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={s.allowComments ?? true} disabled={!canWrite} onCheckedChange={(v) => set({ allowComments: Boolean(v) })} />
            Allow comments
          </label>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={Boolean(s.consent)} disabled={!canWrite} onCheckedChange={(v) => set({ consent: Boolean(v) })} />
            The client agreed to TikTok&apos;s Music Usage Confirmation and to publishing this content.
          </label>
        </>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sent posts: per account status, links, fixes
// ---------------------------------------------------------------------------

function SentPost({ post, contentHref, connectionsHref, settings, canWrite, events, media }: Common & { post: PostRow }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [text, setText] = useState("")
  const byId = new Map(media.map((m) => [m.id, m]))
  const when = post.publishedAt ?? post.scheduledFor

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card title="What went out" description={when ? formatInZone(when, settings.timezone, { year: "numeric", weekday: "short" }) : undefined}>
          <p className="text-[15px] leading-6 break-words whitespace-pre-wrap">{post.content || <span className="text-muted-foreground">No text</span>}</p>
          {post.mediaIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {post.mediaIds.map((id) => {
                const m = byId.get(id)
                return m ? <MediaThumb key={id} m={m} className="w-24" /> : null
              })}
            </div>
          )}
          {post.lastError && (
            <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft p-2 text-sm text-danger">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {post.lastError}
            </p>
          )}
        </Card>

        <Card title="Accounts">
          <ul className="divide-y rounded-lg border">
            {post.targets.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <PlatformLogo platform={t.platform} className="size-4" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.accountName ?? PLATFORM_META[t.platform].label}</span>
                  <StatusTag tone={TARGET_META[t.status].tone}>{TARGET_META[t.status].label}</StatusTag>
                  {t.url && (
                    <Button asChild variant="ghost" size="sm">
                      <a href={t.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink />
                        Open
                      </a>
                    </Button>
                  )}
                </div>
                {t.customContent !== null && t.customContent !== post.content && (
                  <p className="text-xs text-muted-foreground">Own text: {t.customContent.slice(0, 160)}{t.customContent.length > 160 ? "…" : ""}</p>
                )}
                {t.error && (
                  <div className="text-sm">
                    <p className="text-danger">{t.error}</p>
                    {t.errorCategory && FIX[t.errorCategory] && (
                      <p className="text-muted-foreground">
                        {FIX[t.errorCategory]}{" "}
                        {(t.errorCategory === "auth_expired" || t.errorCategory === "account_issue") && (
                          <Link className="underline" href={connectionsHref}>
                            Open Connections
                          </Link>
                        )}
                      </p>
                    )}
                  </div>
                )}
                {canWrite && t.status === "published" && (
                  <div className="flex flex-wrap gap-2">
                    {editing === t.id ? (
                      <form
                        className="flex w-full flex-col gap-2"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void run(async () => {
                            const r = await editPublishedText(t.id, text)
                            if (r.ok) {
                              toast.success("Text changed on the platform")
                              setEditing(null)
                              router.refresh()
                            } else toast.error(r.error)
                          })
                        }}
                      >
                        <Textarea value={text} rows={5} onChange={(e) => setText(e.target.value)} aria-label="New text" />
                        <div className="flex gap-2">
                          <Button size="sm" type="submit" disabled={busy}>
                            Save on {PLATFORM_META[t.platform].label}
                          </Button>
                          <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setText(t.customContent ?? post.content)
                            setEditing(t.id)
                          }}
                        >
                          <Pencil />
                          Edit text
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger hover:text-danger"
                          disabled={busy}
                          onClick={async () => {
                            const yes = await confirm({
                              title: `Take the post down from ${PLATFORM_META[t.platform].label}?`,
                              description: "It's removed from the platform. This can't be undone there.",
                              action: "Take it down",
                              danger: true,
                            })
                            if (!yes) return
                            await run(async () => {
                              const r = await unpublishTarget(t.id)
                              if (r.ok) {
                                toast.success("Taken down")
                                router.refresh()
                              } else toast.error(r.error)
                            })
                          }}
                        >
                          <Undo2 />
                          Take down
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-20">
        {canWrite && (
          <Card title="Actions">
            <div className="flex flex-col gap-2">
              {(post.status === "failed" || post.status === "partial") && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await retryFailedPost(post.id)
                      if (r.ok) {
                        toast.success("Trying again on the failed accounts")
                        router.refresh()
                      } else toast.error(r.error)
                    })
                  }
                >
                  <RotateCcw />
                  Try again
                </Button>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await duplicatePost(post.id)
                    if (!r.ok) {
                      toast.error(r.error)
                      return
                    }
                    toast.success("Copied as a new draft")
                    router.push(`${contentHref}/posts/${r.data.id}`)
                  })
                }
              >
                <Copy />
                Duplicate as a new draft
              </Button>
              {post.status === "failed" && (
                <Button
                  variant="ghost"
                  className="text-danger hover:text-danger"
                  disabled={busy}
                  onClick={async () => {
                    const yes = await confirm({ title: "Delete this post?", description: "It's removed here and at Zernio. Nothing was published.", action: "Delete", danger: true })
                    if (!yes) return
                    await run(async () => {
                      const r = await deletePost(post.id)
                      if (r.ok) {
                        toast.success("Deleted")
                        router.push(`${contentHref}?tab=posts`)
                      } else toast.error(r.error)
                    })
                  }}
                >
                  <Trash2 />
                  Delete
                </Button>
              )}
            </div>
          </Card>
        )}
        {events.length > 0 && (
          <Card title="History">
            <History events={events} />
          </Card>
        )}
      </aside>
    </div>
  )
}

const EVENT_WORDS: Record<string, string> = {
  created: "created it",
  edited: "edited it",
  scheduled: "scheduled it",
  publishing: "started publishing",
  published: "published",
  partial: "published to some accounts",
  failed: "failed",
  cancelled: "cancelled it",
  retried: "tried again",
  unpublished: "took it down",
  deleted_on_platform: "it was removed on the platform",
  draft: "moved it back to draft",
}

export function History({ events }: { events: ContentEvent[] }) {
  const [now] = useState(() => new Date())
  return (
    <ol className="flex flex-col gap-1.5 border-l pl-4 text-sm">
      {events.map((e) => (
        <li key={e.id}>
          <span className="font-medium">{e.actor ?? (["published", "failed", "partial"].includes(e.kind) ? "Zernio" : "Someone")}</span>{" "}
          <span className="text-muted-foreground">{EVENT_WORDS[e.kind] ?? e.kind}</span>
          {typeof e.detail.error === "string" && e.detail.error && <span className="text-danger">: {e.detail.error}</span>}
          <span className="ml-2 text-xs text-muted-foreground">{formatRelative(e.at, now)}</span>
        </li>
      ))}
    </ol>
  )
}
