import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, ExternalLink, FileText, Plus } from "@/components/icons"
import Link from "next/link"

import { PlatformLogo } from "@/components/brand/platform-icons"
import { StatusDot, StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { POST_FILTER_LABEL, POST_FILTERS, STATUS_META, TARGET_META, type PostFilter } from "../constants"
import type { ArticleRow, ContentBase, PostRow } from "../queries"
import { formatInZone, utcToZoned } from "../time"

/** Builds Content page links that keep the current tab and filters. */
export type Href = (patch: Record<string, string | null>) => string

// ---------------------------------------------------------------------------
// Month progress
// ---------------------------------------------------------------------------

export function ProgressStrip({ progress, href }: { progress: ContentBase["progress"]; href: Href }) {
  const items = [
    { key: "articles", label: "Articles this month", value: progress.articles, of: progress.articlesTarget, to: href({ tab: "articles", status: null }) },
    { key: "gbp", label: "Google posts this month", value: progress.gbpPosts, of: progress.gbpTarget, to: href({ tab: "posts", status: "published" }) },
    { key: "scheduled", label: "Scheduled", value: progress.scheduledPosts + progress.scheduledArticles, of: null, to: href({ tab: "posts", status: "scheduled" }) },
    { key: "failed", label: "Needs attention", value: progress.failed, of: null, to: href({ tab: "posts", status: "failed" }) },
  ]
  return (
    <nav aria-label="This month" className="grid grid-cols-2 divide-x divide-y rounded-lg border bg-card sm:grid-cols-4 sm:divide-y-0">
      {items.map((i) => (
        <Link key={i.key} href={i.to} scroll={false} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50">
          <span className="text-xs text-muted-foreground">{i.label}</span>
          <span className={cn("text-xl font-semibold tabular-nums", i.key === "failed" && i.value > 0 && "text-danger")}>
            {formatNumber(i.value)}
            {i.of !== null && i.of > 0 && <span className="text-sm font-normal text-muted-foreground"> of {formatNumber(i.of)}</span>}
          </span>
        </Link>
      ))}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export type CalendarItem = {
  id: string
  kind: "post" | "article"
  when: string
  title: string
  status: PostRow["status"]
  platforms: PostRow["targets"][number]["platform"][]
  href: string
}

const pad = (n: number) => String(n).padStart(2, "0")
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const addDaysUtc = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** The days the calendar shows (Sunday weeks), as yyyy-mm-dd. */
export function calendarRange(view: "month" | "week", anchor: string): { days: string[]; from: string; to: string } {
  const a = parse(anchor)
  let start: Date
  let count: number
  if (view === "week") {
    start = addDaysUtc(a, -a.getUTCDay())
    count = 7
  } else {
    const first = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1))
    start = addDaysUtc(first, -first.getUTCDay())
    const last = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0))
    const end = addDaysUtc(last, 6 - last.getUTCDay())
    count = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  }
  const days = Array.from({ length: count }, (_, i) => ymd(addDaysUtc(start, i)))
  return { days, from: days[0], to: ymd(addDaysUtc(parse(days.at(-1)!), 1)) }
}

export function shiftAnchor(view: "month" | "week", anchor: string, by: number) {
  const a = parse(anchor)
  return view === "week" ? ymd(addDaysUtc(a, by * 7)) : ymd(new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + by, 1)))
}

export function Calendar({
  view,
  anchor,
  today,
  items,
  tz,
  href,
  canWrite,
}: {
  view: "month" | "week"
  anchor: string
  today: string
  items: CalendarItem[]
  tz: string
  href: Href
  canWrite: boolean
}) {
  const { days } = calendarRange(view, anchor)
  const month = parse(anchor).getUTCMonth()
  const byDay = new Map<string, CalendarItem[]>()
  for (const it of items) {
    const d = utcToZoned(it.when, tz).date
    byDay.set(d, [...(byDay.get(d) ?? []), it].sort((x, y) => x.when.localeCompare(y.when)))
  }
  const title =
    view === "month"
      ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(parse(anchor))
      : `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(parse(days[0]))} – ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parse(days[6]))}`
  const agenda = days.filter((d) => (byDay.get(d)?.length ?? 0) > 0 && (view === "week" || parse(d).getUTCMonth() === month))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" className="size-8">
            <Link href={href({ d: shiftAnchor(view, anchor, -1) })} scroll={false} aria-label="Previous">
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" className="size-8">
            <Link href={href({ d: shiftAnchor(view, anchor, 1) })} scroll={false} aria-label="Next">
              <ChevronRight />
            </Link>
          </Button>
          <h2 className="ml-2 text-[15px] font-semibold tracking-tight">{title}</h2>
          <Button asChild variant="ghost" size="sm" className="ml-1">
            <Link href={href({ d: null })} scroll={false}>
              Today
            </Link>
          </Button>
        </div>
        <div role="radiogroup" aria-label="Calendar view" className="flex rounded-lg border bg-card p-0.5">
          {(["month", "week"] as const).map((v) => (
            <Link
              key={v}
              role="radio"
              aria-checked={view === v}
              href={href({ view: v === "month" ? null : v })}
              scroll={false}
              className={cn("h-7 rounded-md px-2.5 text-sm leading-7 capitalize", view === v ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>

      {/* Grid (tablet and up) */}
      <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-xs text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const list = byDay.get(d) ?? []
            const out = view === "month" && parse(d).getUTCMonth() !== month
            const past = d < today
            return (
              <div
                key={d}
                className={cn(
                  "group flex flex-col gap-1 border-b p-1.5",
                  i % 7 !== 6 && "border-r",
                  view === "week" ? "min-h-[320px]" : "min-h-[112px]",
                  out && "bg-muted/30",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full text-xs tabular-nums",
                      d === today ? "bg-foreground font-semibold text-background" : out ? "text-muted-foreground/60" : "text-muted-foreground",
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                  {canWrite && !past && (
                    <Link
                      href={href({ post: "new", date: d })}
                      scroll={false}
                      className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100"
                      aria-label={`New post on ${d}`}
                    >
                      <Plus className="size-3.5" />
                    </Link>
                  )}
                </div>
                <ul className="flex flex-col gap-1">
                  {list.slice(0, view === "week" ? 20 : 4).map((it) => (
                    <li key={`${it.kind}-${it.id}`}>
                      <CalendarChip item={it} tz={tz} />
                    </li>
                  ))}
                  {view === "month" && list.length > 4 && (
                    <li>
                      <Link href={href({ view: "week", d })} scroll={false} className="px-1 text-xs text-muted-foreground hover:underline">
                        {list.length - 4} more
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      {/* Agenda (phones) */}
      <div className="md:hidden">
        {agenda.length === 0 ? (
          <p className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Nothing planned in this {view}.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {agenda.map((d) => (
              <li key={d} className="flex flex-col gap-1.5">
                <h3 className={cn("text-xs font-medium", d === today ? "text-foreground" : "text-muted-foreground")}>
                  {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(parse(d))}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {(byDay.get(d) ?? []).map((it) => (
                    <li key={`${it.kind}-${it.id}`}>
                      <CalendarChip item={it} tz={tz} large />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function CalendarChip({ item, tz, large = false }: { item: CalendarItem; tz: string; large?: boolean }) {
  const meta = STATUS_META[item.status]
  return (
    <Link
      href={item.href}
      scroll={false}
      className={cn(
        "flex items-center gap-1.5 rounded-md border bg-background px-1.5 text-left transition-colors hover:bg-muted",
        large ? "h-10 px-3 text-sm" : "h-6 text-xs",
      )}
      title={`${meta.label}: ${item.title}`}
    >
      <StatusDot tone={meta.tone} />
      <span className="shrink-0 text-muted-foreground tabular-nums">{formatInZone(item.when, tz, { month: undefined, day: undefined })}</span>
      {item.kind === "article" ? (
        <FileText className="size-3 shrink-0 text-muted-foreground" aria-label="Article" />
      ) : (
        <span className="flex shrink-0 -space-x-0.5">
          {[...new Set(item.platforms)].slice(0, 3).map((p) => (
            <PlatformLogo key={p} platform={p} className="size-3" />
          ))}
        </span>
      )}
      <span className="min-w-0 truncate">{item.title}</span>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Posts list
// ---------------------------------------------------------------------------

export const postTitle = (p: Pick<PostRow, "title" | "content">) =>
  p.title || p.content.replace(/\s+/g, " ").trim().slice(0, 90) || "Untitled post"

export function PostsList({
  posts,
  filter,
  counts,
  tz,
  href,
  canWrite,
}: {
  posts: PostRow[]
  filter: PostFilter
  counts: Partial<Record<PostFilter, number>>
  tz: string
  href: Href
  canWrite: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Post status" className="flex max-w-full overflow-x-auto rounded-lg border bg-card p-0.5">
          {POST_FILTERS.map((f) => (
            <Link
              key={f}
              href={href({ status: f === "all" ? null : f, post: null })}
              scroll={false}
              aria-current={filter === f ? "page" : undefined}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap",
                filter === f ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {POST_FILTER_LABEL[f]}
              {counts[f] !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(counts[f]!)}</span>}
            </Link>
          ))}
        </nav>
        {canWrite && (
          <Button asChild size="sm">
            <Link href={href({ post: "new", date: null })} scroll={false}>
              <Plus />
              New post
            </Link>
          </Button>
        )}
      </div>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
          <p className="text-sm font-medium">{filter === "all" ? "No posts yet" : `No ${POST_FILTER_LABEL[filter].toLowerCase()}`}</p>
          <p className="mt-1 text-sm text-muted-foreground">Write a post once and send it to every connected account, now or on a schedule.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {posts.map((p) => {
            const meta = STATUS_META[p.status]
            const when = p.publishedAt ?? p.scheduledFor
            const failed = p.targets.filter((t) => t.status === "failed").length
            return (
              <li key={p.id}>
                <Link href={href({ post: p.id })} scroll={false} className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-[140px] shrink-0 text-sm text-muted-foreground tabular-nums">
                    {when ? formatInZone(when, tz) : <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />No date</span>}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{postTitle(p)}</span>
                  <span className="flex items-center gap-1.5">
                    {p.targets.map((t) => (
                      <span key={t.id} className="relative" title={`${t.accountName ?? t.platform}: ${TARGET_META[t.status].label}${t.error ? ` (${t.error})` : ""}`}>
                        <PlatformLogo platform={t.platform} className="size-4" />
                        {p.status !== "draft" && p.status !== "cancelled" && (
                          <StatusDot tone={TARGET_META[t.status].tone} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-card" />
                        )}
                      </span>
                    ))}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {failed > 0 && p.status !== "failed" && <CircleAlert className="size-4 text-danger" aria-label={`${failed} failed`} />}
                    <StatusTag tone={meta.tone}>{meta.label}</StatusTag>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Articles list
// ---------------------------------------------------------------------------

export function ArticlesList({
  articles,
  tz,
  editorHref,
  canWrite,
  hasWordPress,
  connectionsHref,
}: {
  articles: ArticleRow[]
  tz: string
  editorHref: (id: string) => string
  canWrite: boolean
  hasWordPress: boolean
  connectionsHref: string
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {hasWordPress ? (
            "Articles go to the client's WordPress site."
          ) : (
            <>
              No WordPress site yet. Articles can be written now and published once the site is{" "}
              <Link className="underline" href={connectionsHref}>
                connected
              </Link>
              .
            </>
          )}
        </p>
        {canWrite && (
          <Button asChild size="sm">
            <Link href={editorHref("new")}>
              <Plus />
              New article
            </Link>
          </Button>
        )}
      </div>
      {articles.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
          <p className="text-sm font-medium">No articles yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Write blog articles for the client&apos;s keywords and publish or schedule them on WordPress.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Keyword</th>
                <th className="px-3 py-2 text-right font-medium">Words</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">SEO fields</th>
                <th className="px-3 py-2 font-medium">
                  <span className="sr-only">Link</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {articles.map((a) => {
                const meta = STATUS_META[a.status]
                const when = a.publishedAt ?? a.publishAt
                return (
                  <tr key={a.id} className="hover:bg-muted/40">
                    <td className="max-w-[320px] px-4 py-2.5">
                      <Link href={editorHref(a.id)} className="block truncate font-medium hover:underline">
                        {a.title || "Untitled article"}
                      </Link>
                      {a.lastError && <span className="block truncate text-xs text-danger">{a.lastError}</span>}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground">{a.focusKeyword ?? "–"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(a.wordCount)}</td>
                    <td className="px-3 py-2.5">
                      <StatusTag tone={meta.tone}>{meta.label}</StatusTag>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">{when ? formatInZone(when, tz) : "–"}</td>
                    <td className="px-3 py-2.5">
                      {a.status === "published" ? (
                        a.seoPastedAt ? (
                          <StatusTag tone="success">Pasted</StatusTag>
                        ) : (
                          <StatusTag tone="warning">To paste</StatusTag>
                        )
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {a.wpUrl && (
                        <a href={a.wpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" aria-label="Open on the site">
                          <ExternalLink className="size-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
