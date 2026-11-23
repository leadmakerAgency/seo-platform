import { CircleAlert, FileText, Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { after } from "next/server"
import { Suspense } from "react"

import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getClientBySlug } from "@/features/clients/queries"
import type { Db } from "@/features/connections/sync"
import { ConfirmProvider } from "@/features/content/components/confirm"
import { MediaLibrary } from "@/features/content/components/media-library"
import { SettingsForm } from "@/features/content/components/settings-form"
import {
  ArticlesList,
  Calendar,
  calendarRange,
  PostsList,
  postTitle,
  ProgressStrip,
  type CalendarItem,
  type Href,
} from "@/features/content/components/views"
import {
  POST_FILTERS,
  statusesFor,
  TAB_LABEL,
  TABS,
  type ContentTab,
  type PostFilter,
} from "@/features/content/constants"
import {
  getArticles,
  getContentBase,
  getMedia,
  getPosts,
  needsReconcile,
} from "@/features/content/queries"
import { reconcileContent } from "@/features/content/server"
import { utcToZoned } from "@/features/content/time"
import { OverviewRefresher } from "@/features/overview/components/overview-refresher"
import { getCurrentMember } from "@/lib/auth"
import { hasZernioApiKey } from "@/lib/env.server"
import { formatNumber } from "@/lib/format"
import { clientHref, findClientSection } from "@/lib/navigation"
import { can } from "@/lib/roles"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Content" }

type Props = PageProps<"/clients/[clientSlug]/content">

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null

export default function ContentPage({ params, searchParams }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <AccessGuard item={findClientSection("content")!} />
      </Suspense>
      <Suspense fallback={<PageSkeleton />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Content({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ clientSlug }, search, member] = await Promise.all([params, searchParams, getCurrentMember()])
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()

  const base = clientHref(client.slug, "content")
  const q = {
    tab: (TABS as readonly string[]).includes(one(search.tab) ?? "") ? (one(search.tab) as ContentTab) : "calendar",
    status: (POST_FILTERS as readonly string[]).includes(one(search.status) ?? "") ? (one(search.status) as PostFilter) : "all",
    view: one(search.view) === "week" ? ("week" as const) : ("month" as const),
    d: /^\d{4}-\d{2}-\d{2}$/.test(one(search.d) ?? "") ? one(search.d)! : null,
    post: one(search.post),
    date: /^\d{4}-\d{2}-\d{2}$/.test(one(search.date) ?? "") ? one(search.date) : null,
  }
  // Old links (?post=…) open the post's own page now.
  if (q.post) redirect(`${base}/posts/${encodeURIComponent(q.post)}${q.date ? `?date=${q.date}` : ""}`)

  // Links keep the tab and filters. A post (or a new post on a day) has its own page.
  const href: Href = (patch) => {
    if (patch.post) return `${base}/posts/${patch.post}${patch.date ? `?date=${patch.date}` : ""}`
    const merged: Record<string, string | null> = { tab: q.tab, status: q.status, view: q.view, d: q.d, post: null, date: null, ...patch }
    if (merged.tab === "calendar") merged.tab = null
    if (merged.status === "all") merged.status = null
    if (merged.view === "month") merged.view = null
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v)
    return `${base}${sp.size ? `?${sp}` : ""}`
  }

  const canWrite = can(member.role, "content.write")
  const canSettings = can(member.role, "content.settings")
  const data = await getContentBase(client.id)
  const tz = data.settings.timezone
  const nowIso = new Date().toISOString()
  const today = utcToZoned(nowIso, tz).date
  const anchor = q.d ?? today
  const zernioReady = hasZernioApiKey()

  // Posts whose time passed and articles WordPress should have published: look again, quietly.
  if (zernioReady && hasSupabaseSecretKey() && (await needsReconcile(client.id))) {
    after(async () => {
      try {
        await reconcileContent(createSupabaseAdminClient() as unknown as Db, { clientId: client.id, budget: 30 })
      } catch (error) {
        console.error("[content] page reconcile failed", error)
      }
    })
  }

  const range = calendarRange(q.view, anchor)
  const [posts, articles, media] = await Promise.all([
    q.tab === "calendar"
      ? getPosts(client.id, { from: addDayIso(range.from, -1), to: addDayIso(range.to, 1), limit: 500 })
      : q.tab === "posts"
        ? getPosts(client.id, { statuses: statusesFor(q.status) })
        : Promise.resolve([]),
    q.tab === "calendar"
      ? getArticles(client.id, { from: addDayIso(range.from, -1), to: addDayIso(range.to, 1) })
      : q.tab === "articles"
        ? getArticles(client.id)
        : Promise.resolve([]),
    q.tab === "media" ? getMedia(client.id) : Promise.resolve([]),
  ])
  const sending = posts.some((p) => p.status === "publishing")
  const editorHref = (id: string) => `${base}/articles/${id}`

  const calendarItems: CalendarItem[] =
    q.tab === "calendar"
      ? [
          ...posts.flatMap<CalendarItem>((p) => {
            const when = p.scheduledFor ?? p.publishedAt
            return when
              ? [{ id: p.id, kind: "post", when, title: postTitle(p), status: p.status, platforms: p.targets.map((t) => t.platform), href: href({ post: p.id }) }]
              : []
          }),
          ...articles.flatMap<CalendarItem>((a) => {
            const when = a.publishAt ?? a.publishedAt
            return when ? [{ id: a.id, kind: "article", when, title: a.title || "Untitled article", status: a.status, platforms: [], href: editorHref(a.id) }] : []
          }),
        ]
      : []

  const nothingConnected = data.accounts.length === 0 && data.wordpress.length === 0

  return (
    <ConfirmProvider>
      <PageHeader
        eyebrow={client.name}
        title="Content"
        description="Social posts and blog articles for this client, written by the team and published through Zernio."
        actions={
          canWrite ? (
            <>
              <Button asChild variant="outline">
                <Link href={editorHref("new")}>
                  <FileText />
                  New article
                </Link>
              </Button>
              <Button asChild>
                <Link href={href({ post: "new", date: null })} scroll={false}>
                  <Plus />
                  New post
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      {!zernioReady && <Notice>Zernio isn&apos;t set up yet, so nothing can be published. An admin needs to add ZERNIO_API_KEY.</Notice>}
      {zernioReady && nothingConnected && (
        <Notice>
          Nothing is connected for {client.name} yet. Connect their social accounts and WordPress site in{" "}
          <Link className="underline" href={clientHref(client.slug, "connections")}>
            Connections
          </Link>{" "}
          to publish. Drafts can be written now.
        </Notice>
      )}

      <ProgressStrip progress={data.progress} href={href} />

      <nav aria-label="Content sections" className="flex w-fit max-w-full overflow-x-auto rounded-lg border bg-card p-0.5">
        {TABS.map((t) => {
          const active = t === q.tab
          const count = t === "posts" ? data.progress.scheduledPosts : t === "articles" ? data.progress.scheduledArticles : undefined
          return (
            <Link
              key={t}
              href={href({ tab: t, status: null, view: null, d: null })}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap transition-colors",
                active ? "bg-foreground text-background dark:bg-muted dark:text-foreground dark:ring-1 dark:ring-input" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {TAB_LABEL[t]}
              {count ? (
                <span className={cn("rounded-sm px-1.5 text-xs tabular-nums", active ? "bg-background/20 dark:bg-background" : "bg-muted")} title="Scheduled">
                  {formatNumber(count)}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      {q.tab === "calendar" && <Calendar view={q.view} anchor={anchor} today={today} items={calendarItems} tz={tz} href={href} canWrite={canWrite} />}
      {q.tab === "posts" && <PostsList posts={posts} filter={q.status} counts={{}} tz={tz} href={href} canWrite={canWrite} />}
      {q.tab === "articles" && (
        <ArticlesList
          articles={articles}
          tz={tz}
          editorHref={editorHref}
          canWrite={canWrite}
          hasWordPress={data.wordpress.length > 0}
          connectionsHref={clientHref(client.slug, "connections")}
        />
      )}
      {q.tab === "media" && <MediaLibrary clientId={client.id} media={media} canWrite={canWrite} />}
      {q.tab === "settings" && (
        <SettingsForm
          clientId={client.id}
          settings={data.settings}
          wordpress={data.wordpress}
          canEdit={canSettings}
          connectionsHref={clientHref(client.slug, "connections")}
        />
      )}


      {sending && <OverviewRefresher every={10_000} />}
    </ConfirmProvider>
  )
}

/** A day's UTC midnight, moved by whole days (a day of slack covers any time zone). */
const addDayIso = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 86_400_000).toISOString()

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p>{children}</p>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-16 w-[420px] max-w-full" />
      <Skeleton className="h-[70px] w-full rounded-lg" />
      <Skeleton className="h-9 w-[420px] max-w-full rounded-lg" />
      <Skeleton className="h-[480px] w-full rounded-lg" />
    </div>
  )
}
