import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { StatusTag } from "@/components/common/status"
import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { getClientBySlug } from "@/features/clients/queries"
import { ConfirmProvider } from "@/features/content/components/confirm"
import { EDITABLE, PostWorkspace } from "@/features/content/components/post-editor"
import { postTitle } from "@/features/content/components/views"
import { STATUS_META } from "@/features/content/constants"
import { getContentBase, getEvents, getMedia, getPost } from "@/features/content/queries"
import { zoneLabel } from "@/features/content/time"
import { OverviewRefresher } from "@/features/overview/components/overview-refresher"
import { getCurrentMember } from "@/lib/auth"
import { clientHref, findClientSection } from "@/lib/navigation"
import { can } from "@/lib/roles"

export const metadata: Metadata = { title: "Post" }

type Props = PageProps<"/clients/[clientSlug]/content/posts/[postId]">

export default function PostPage({ params, searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        <AccessGuard item={findClientSection("content")!} />
      </Suspense>
      <Suspense fallback={<PostSkeleton />}>
        <Body params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Body({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ clientSlug, postId }, search, member] = await Promise.all([params, searchParams, getCurrentMember()])
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()
  const isNew = postId === "new"
  const canWrite = can(member.role, "content.write")
  if (isNew && !canWrite) notFound()

  const [post, base, media, events] = await Promise.all([
    isNew ? Promise.resolve(null) : getPost(client.id, postId),
    getContentBase(client.id),
    getMedia(client.id),
    isNew ? Promise.resolve([]) : getEvents("post", postId),
  ])
  if (!isNew && !post) notFound()

  const contentHref = clientHref(client.slug, "content")
  const rawDate = Array.isArray(search.date) ? search.date[0] : search.date
  const initialDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null
  const editable = !post || EDITABLE.has(post.status)
  const title = isNew ? "New post" : editable ? (post!.status === "scheduled" ? "Scheduled post" : "Edit post") : postTitle(post!)
  const description = editable
    ? `Write once, then send it to any of ${client.name}'s connected accounts. Times are in ${zoneLabel(base.settings.timezone)}.`
    : "What went out, and where. Published posts can be edited or taken down per account."

  return (
    <ConfirmProvider>
      <Link href={`${contentHref}?tab=posts`} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Content · Posts
      </Link>
      <PageHeader
        eyebrow={client.name}
        title={title}
        description={description}
        actions={post ? <StatusTag tone={STATUS_META[post.status].tone}>{STATUS_META[post.status].label}</StatusTag> : null}
      />
      <PostWorkspace
        clientId={client.id}
        contentHref={contentHref}
        connectionsHref={clientHref(client.slug, "connections")}
        post={post}
        initialDate={initialDate}
        accounts={base.accounts}
        media={media}
        settings={base.settings}
        canWrite={canWrite}
        events={events}
      />
      {post?.status === "publishing" && <OverviewRefresher every={8_000} />}
    </ConfirmProvider>
  )
}

function PostSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-16 w-[420px] max-w-full" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-[140px] rounded-lg" />
          <Skeleton className="h-[320px] rounded-lg" />
        </div>
        <Skeleton className="h-[360px] rounded-lg" />
      </div>
    </div>
  )
}
