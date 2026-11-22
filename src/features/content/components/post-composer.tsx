"use client"

import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
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
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { PlatformLogo } from "@/components/brand/platform-icons"
import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { PLATFORM_META } from "@/features/connections/constants"
import { formatNumber, formatRelative } from "@/lib/format"
import { clientHref } from "@/lib/navigation"
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
  PLATFORM_RULES,
  STATUS_META,
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

const EDITABLE = new Set(["draft", "cancelled", "scheduled"])

const FIX: Record<string, string> = {
  auth_expired: "Reconnect this account in Connections, then try again.",
  account_issue: "Check the account in Connections.",
  user_content: "Change the text or files, then duplicate the post and send it again.",
  platform_rate_limit: "The platform is limiting posts right now. Try again later.",
  quota_exhausted: "This account reached its daily posting limit. Try again tomorrow.",
  platform_error: "The platform had a problem. Try again.",
  system_error: "Zernio had a problem. Try again.",
}

/** Closes the sheet by dropping ?post and ?date from the URL. */
function useClose() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  return () => {
    const next = new URLSearchParams(params.toString())
    next.delete("post")
    next.delete("date")
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false })
  }
}

export function PostComposer({
  clientId,
  clientSlug,
  post,
  isNew,
  initialDate,
  accounts,
  media,
  settings,
  canWrite,
  events,
}: {
  clientId: string
  clientSlug: string
  post: PostRow | null
  isNew: boolean
  initialDate: string | null
  accounts: ContentAccount[]
  media: MediaRow[]
  settings: ContentSettings
  canWrite: boolean
  events: ContentEvent[]
}) {
  const close = useClose()
  const open = isNew || Boolean(post)
  const title = isNew ? "New post" : post && EDITABLE.has(post.status) ? "Edit post" : "Post"
  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {title}
            {post && <StatusTag tone={STATUS_META[post.status].tone}>{STATUS_META[post.status].label}</StatusTag>}
          </SheetTitle>
          <SheetDescription>
            {post?.status && !EDITABLE.has(post.status)
              ? "What went out, and where. Published posts can be edited or taken down per account."
              : `Times are in the client's time zone: ${zoneLabel(settings.timezone)}.`}
          </SheetDescription>
        </SheetHeader>
        {open &&
          (post && !EDITABLE.has(post.status) ? (
            <SentPost key={post.id} post={post} clientSlug={clientSlug} settings={settings} canWrite={canWrite} events={events} media={media} onClose={close} />
          ) : (
            <Editor
              key={post?.id ?? `new-${initialDate ?? ""}`}
              clientId={clientId}
              clientSlug={clientSlug}
              post={post}
              initialDate={initialDate}
              accounts={accounts}
              media={media}
              settings={settings}
              canWrite={canWrite}
              events={events}
              onClose={close}
            />
          ))}
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Writing and scheduling
// ---------------------------------------------------------------------------

function Editor({
  clientId,
  clientSlug,
  post,
  initialDate,
  accounts,
  media,
  settings,
  canWrite,
  events,
  onClose,
}: {
  clientId: string
  clientSlug: string
  post: PostRow | null
  initialDate: string | null
  accounts: ContentAccount[]
  media: MediaRow[]
  settings: ContentSettings
  canWrite: boolean
  events: ContentEvent[]
  onClose: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
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
  const [pending, start] = useTransition()
  const scheduled = post?.status === "scheduled"
  const dirtyServer = scheduled && post && post.sentVersion !== null && post.version > post.sentVersion

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
  const blocking = allIssues.some((x) => x.issues.some((i) => i.level === "error")) || selected.length === 0
  const scheduledFor = date && time ? zonedToUtc(date, time, tz) : null

  const input = (): PostInput => ({
    id: postId,
    title: label.trim() || null,
    content,
    mediaIds,
    scheduledFor,
    timezone: tz,
    targets: selected.map((a) => ({ socialAccountId: a.id, ...draftOf(a.id) })),
  })

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
      const next = new URLSearchParams(params.toString())
      next.set("post", r.data.id)
      next.delete("date")
      router.replace(`${pathname}?${next}`, { scroll: false })
    }
    return r.data.id
  }

  const send = (mode: "schedule" | "now") =>
    start(async () => {
      if (mode === "schedule" && !scheduledFor) {
        toast.error("Pick a date and time first.")
        return
      }
      if (mode === "now") {
        const yes = await confirm({
          title: "Publish now?",
          description: `This goes out right away to ${selected.length} ${selected.length === 1 ? "account" : "accounts"}.`,
          action: "Publish now",
        })
        if (!yes) return
      }
      const id = await save(true)
      if (!id) return
      const r = await schedulePost(id, mode)
      if (!r.ok) {
        toast.error(r.error, { duration: 10_000 })
        return
      }
      toast.success(mode === "now" ? (r.data.status === "published" ? "Published" : "Sent. Publishing now…") : `Scheduled for ${formatInZone(scheduledFor!, tz)}`)
      onClose()
    })

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-6 px-5 py-5">
        {/* Accounts */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Post to</h3>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No social accounts are connected.{" "}
              <Link className="underline" href={clientHref(clientSlug, "connections")}>
                Connect them in Connections
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
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
                    title={broken ? "Needs reconnecting in Connections" : PLATFORM_META[a.platform].label}
                    className={cn(
                      "flex h-9 max-w-full items-center gap-2 rounded-md border px-2.5 text-sm transition-colors",
                      on ? "border-foreground/40 bg-muted font-medium" : "bg-card text-muted-foreground hover:text-foreground",
                      broken && "opacity-60",
                    )}
                  >
                    <PlatformLogo platform={a.platform} className="size-4" />
                    <span className="truncate">{a.name}</span>
                    {broken && <TriangleAlert className="size-3.5 text-warning" aria-label="Needs reconnecting" />}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* Text, per account */}
        <section className="flex flex-col gap-3">
          <div role="tablist" aria-label="Text for" className="flex max-w-full gap-1 overflow-x-auto border-b">
            <TabButton active={tab === "all"} onClick={() => setTab("all")}>
              Everyone
            </TabButton>
            {selected.map((a) => {
              const issues = issuesFor(a)
              const err = issues.some((i) => i.level === "error")
              return (
                <TabButton key={a.id} active={tab === a.id} onClick={() => setTab(a.id)}>
                  <PlatformLogo platform={a.platform} className="size-3.5" />
                  <span className="max-w-[140px] truncate">{a.name}</span>
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
                rows={7}
                placeholder="What should the post say?"
                disabled={!canWrite}
                className="text-[15px]"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {[...new Set(selected.map((a) => a.platform as PostPlatform))].map((p) => {
                    const len = textLength(content)
                    const lim = PLATFORM_RULES[p].limit
                    return (
                      <span key={p} className={cn("tabular-nums", len > lim ? "text-danger" : len > lim * 0.9 ? "text-warning" : "text-muted-foreground")}>
                        {PLATFORM_META[p].label} {formatNumber(len)}/{formatNumber(lim)}
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
        </section>

        {/* Files */}
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Images and video</h3>
            {canWrite && (
              <div className="flex gap-2">
                <MediaPicker media={media} chosen={mediaIds} onPick={(id) => setMediaIds((m) => (m.includes(id) ? m : [...m, id].slice(0, 20)))} />
                <UploadButton clientId={clientId} onUploaded={(id) => setMediaIds((m) => [...m, id].slice(0, 20))} />
              </div>
            )}
          </div>
          <MediaStrip ids={mediaIds} byId={byId} canWrite={canWrite} onChange={setMediaIds} />
        </section>

        {/* When */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">When</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="post-date">Date</Label>
              <Input id="post-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!canWrite} className="w-[170px]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="post-time">Time</Label>
              <Input id="post-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!canWrite} className="w-[130px]" />
            </div>
            <p className="pb-2 text-xs text-muted-foreground">{zoneLabel(tz)}</p>
          </div>
          <div className="flex flex-col gap-1.5 sm:max-w-sm">
            <Label htmlFor="post-label">Internal name (optional)</Label>
            <Input id="post-label" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder="Shown on the calendar" disabled={!canWrite} />
          </div>
        </section>

        {/* Checks */}
        {selected.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Checks</h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {allIssues.map(({ a, issues }) =>
                issues.length === 0 ? (
                  <li key={a.id} className="flex items-center gap-2 text-muted-foreground">
                    <PlatformLogo platform={a.platform} className="size-3.5" />
                    {a.name}: ready
                  </li>
                ) : (
                  issues.map((i, n) => (
                    <li key={`${a.id}-${n}`} className={cn("flex items-start gap-2", i.level === "error" ? "text-danger" : "text-warning")}>
                      <PlatformLogo platform={a.platform} className="mt-0.5 size-3.5" />
                      <span>
                        {a.name}: {i.message}
                      </span>
                    </li>
                  ))
                ),
              )}
              {zernio && (
                <li className="mt-1 rounded-md border bg-muted/40 p-2">
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
                </li>
              )}
            </ul>
          </section>
        )}

        {/* Previews */}
        {selected.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Preview</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {selected.map((a) => {
                const d = draftOf(a.id)
                const text = d.customContent ?? content
                const first = (d.customMediaIds ?? mediaIds).map((id) => byId.get(id)).find(Boolean)
                const fold = PLATFORM_RULES[a.platform as PostPlatform].fold
                return (
                  <article key={a.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
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
          </section>
        )}

        {post && events.length > 0 && <History events={events} />}
      </div>

      {canWrite && (
        <footer className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background px-5 py-3">
          {scheduled ? (
            <>
              <Button disabled={pending || blocking} onClick={() => start(async () => void (await save()))}>
                Save changes
              </Button>
              <Button variant="outline" disabled={pending || blocking} onClick={() => send("now")}>
                <Send />
                Publish now
              </Button>
              <Button
                variant="ghost"
                className="text-danger hover:text-danger"
                disabled={pending}
                onClick={async () => {
                  const yes = await confirm({ title: "Cancel this post?", description: "It won't go out. It stays here as a draft you can schedule again.", action: "Cancel post", danger: true })
                  if (!yes || !post) return
                  start(async () => {
                    const r = await cancelPost(post.id)
                    if (r.ok) toast.success("Cancelled")
                    else toast.error(r.error)
                  })
                }}
              >
                Cancel post
              </Button>
              {dirtyServer && <span className="text-xs text-warning">Zernio has an older version. Save changes to send it.</span>}
            </>
          ) : (
            <>
              <Button disabled={pending || blocking || !scheduledFor} onClick={() => send("schedule")}>
                <CalendarClock />
                Schedule
              </Button>
              <Button variant="outline" disabled={pending || blocking} onClick={() => send("now")}>
                <Send />
                Publish now
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => start(async () => void (await save()))}>
                Save draft
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            className="ml-auto"
            disabled={pending || selected.length === 0}
            onClick={() =>
              start(async () => {
                const id = await save(true)
                if (!id) return
                const r = await checkPost(id)
                if (r.ok) setZernio(r.data)
                else toast.error(r.error)
              })
            }
          >
            <ShieldCheck />
            Check with Zernio
          </Button>
        </footer>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
  if (!ids.length) return <p className="text-sm text-muted-foreground">No files. Instagram, TikTok, YouTube and Pinterest need one.</p>
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
          <li key={id} className="flex w-[104px] flex-col gap-1">
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

function MediaPicker({ media, chosen, onPick, label = "From library" }: { media: MediaRow[]; chosen: string[]; onPick: (id: string) => void; label?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={media.length === 0}>
          <ImagePlus />
          {label}
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
          <Textarea value={draft.customContent ?? ""} rows={6} disabled={!canWrite} onChange={(e) => onChange({ customContent: e.target.value })} aria-label={`Text for ${a.name}`} />
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
            <SelectTrigger className="w-[200px]">
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
            <SelectTrigger className="w-[200px]">
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
              <SelectTrigger className="w-[200px]">
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
              <SelectTrigger className="w-[200px]">
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

function SentPost({
  post,
  clientSlug,
  settings,
  canWrite,
  events,
  media,
  onClose,
}: {
  post: PostRow
  clientSlug: string
  settings: ContentSettings
  canWrite: boolean
  events: ContentEvent[]
  media: MediaRow[]
  onClose: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const confirm = useConfirm()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<string | null>(null)
  const [text, setText] = useState("")
  const byId = new Map(media.map((m) => [m.id, m]))
  const when = post.publishedAt ?? post.scheduledFor

  return (
    <div className="flex flex-col gap-6 px-5 py-5">
      <div className="flex flex-col gap-2">
        {when && <p className="text-sm text-muted-foreground">{formatInZone(when, settings.timezone, { year: "numeric" })}</p>}
        <p className="text-[15px] break-words whitespace-pre-wrap">{post.content || <span className="text-muted-foreground">No text</span>}</p>
        {post.mediaIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.mediaIds.map((id) => {
              const m = byId.get(id)
              return m ? <MediaThumb key={id} m={m} className="w-20" /> : null
            })}
          </div>
        )}
        {post.lastError && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft p-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {post.lastError}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Accounts</h3>
        <ul className="divide-y rounded-lg border bg-card">
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
              {t.error && (
                <div className="text-sm">
                  <p className="text-danger">{t.error}</p>
                  {t.errorCategory && FIX[t.errorCategory] && (
                    <p className="text-muted-foreground">
                      {FIX[t.errorCategory]}{" "}
                      {(t.errorCategory === "auth_expired" || t.errorCategory === "account_issue") && (
                        <Link className="underline" href={clientHref(clientSlug, "connections")}>
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
                        start(async () => {
                          const r = await editPublishedText(t.id, text)
                          if (r.ok) {
                            toast.success("Text changed on the platform")
                            setEditing(null)
                          } else toast.error(r.error)
                        })
                      }}
                    >
                      <Textarea value={text} rows={5} onChange={(e) => setText(e.target.value)} aria-label="New text" />
                      <div className="flex gap-2">
                        <Button size="sm" type="submit" disabled={pending}>
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
                        disabled={pending}
                        onClick={async () => {
                          const yes = await confirm({
                            title: `Take the post down from ${PLATFORM_META[t.platform].label}?`,
                            description: "It's removed from the platform. This can't be undone there.",
                            action: "Take it down",
                            danger: true,
                          })
                          if (!yes) return
                          start(async () => {
                            const r = await unpublishTarget(t.id)
                            if (r.ok) toast.success("Taken down")
                            else toast.error(r.error)
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
      </section>

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          {(post.status === "failed" || post.status === "partial") && (
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await retryFailedPost(post.id)
                  if (r.ok) toast.success("Trying again on the failed accounts")
                  else toast.error(r.error)
                })
              }
            >
              <RotateCcw />
              Try again
            </Button>
          )}
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await duplicatePost(post.id)
                if (!r.ok) {
                  toast.error(r.error)
                  return
                }
                toast.success("Copied as a new draft")
                const next = new URLSearchParams()
                next.set("tab", "posts")
                next.set("post", r.data.id)
                router.replace(`${pathname}?${next}`, { scroll: false })
              })
            }
          >
            <Copy />
            Duplicate
          </Button>
          {post.status === "failed" && (
            <Button
              variant="ghost"
              className="text-danger hover:text-danger"
              disabled={pending}
              onClick={async () => {
                const yes = await confirm({ title: "Delete this post?", description: "It's removed here and at Zernio. Nothing was published.", action: "Delete", danger: true })
                if (!yes) return
                start(async () => {
                  const r = await deletePost(post.id)
                  if (r.ok) {
                    toast.success("Deleted")
                    onClose()
                  } else toast.error(r.error)
                })
              }}
            >
              <Trash2 />
              Delete
            </Button>
          )}
        </div>
      )}

      {events.length > 0 && <History events={events} />}
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
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">History</h3>
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
    </section>
  )
}
