import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { AccessGuard } from "@/components/layout/access-guard"
import { Skeleton } from "@/components/ui/skeleton"
import { getClientBySlug } from "@/features/clients/queries"
import { ArticleEditor } from "@/features/content/components/article-editor"
import { ConfirmProvider } from "@/features/content/components/confirm"
import { getArticle, getContentBase, getEvents, getKeywordChoices, getMedia } from "@/features/content/queries"
import { getCurrentMember } from "@/lib/auth"
import { clientHref, findClientSection } from "@/lib/navigation"
import { can } from "@/lib/roles"

export const metadata: Metadata = { title: "Article" }

type Props = PageProps<"/clients/[clientSlug]/content/articles/[articleId]">

export default function ArticlePage({ params }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        <AccessGuard item={findClientSection("content")!} />
      </Suspense>
      <Suspense fallback={<EditorSkeleton />}>
        <Body params={params} />
      </Suspense>
    </div>
  )
}

async function Body({ params }: Pick<Props, "params">) {
  const [{ clientSlug, articleId }, member] = await Promise.all([params, getCurrentMember()])
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()
  const isNew = articleId === "new"
  const canWrite = can(member.role, "content.write")
  if (isNew && !canWrite) notFound()

  const [article, base, media, keywords, events] = await Promise.all([
    isNew ? Promise.resolve(null) : getArticle(client.id, articleId),
    getContentBase(client.id),
    getMedia(client.id),
    getKeywordChoices(client.id),
    isNew ? Promise.resolve([]) : getEvents("article", articleId),
  ])
  if (!isNew && !article) notFound()
  const list = clientHref(client.slug, "content")

  return (
    <ConfirmProvider>
      <div className="flex flex-col gap-1">
        <Link href={`${list}?tab=articles`} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          {client.name} · Articles
        </Link>
      </div>
      <ArticleEditor
        key={article?.id ?? "new"}
        clientId={client.id}
        listHref={list}
        connectionsHref={clientHref(client.slug, "connections")}
        settingsHref={`${list}?tab=settings`}
        article={article}
        media={media}
        keywords={keywords}
        settings={base.settings}
        hasWordPress={base.wordpress.length > 0}
        canWrite={canWrite}
        events={events}
      />
    </ConfirmProvider>
  )
}

function EditorSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-[520px] w-full rounded-lg" />
      </div>
      <Skeleton className="h-[520px] w-full rounded-lg" />
    </div>
  )
}
