"use client"

import Image from "@tiptap/extension-image"
import { Placeholder } from "@tiptap/extensions"
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  Bold,
  CalendarClock,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Send,
  Trash2,
  Undo2,
  Unlink,
  X,
} from "@/components/icons"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { ChipsInput } from "@/components/common/chips-input"
import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  deleteArticleDraft,
  deleteArticleFromWordPress,
  markSeoPasted,
  publishArticle,
  saveArticle,
  unpublishArticle,
  updateArticleOnWordPress,
  type ArticleInput,
} from "../actions"
import { articleChecks, META_MAX, SEO_TITLE_MAX, slugify, STATUS_META, wordsOf } from "../constants"
import type { ArticleFull, ContentEvent, ContentSettings, MediaRow } from "../queries"
import { formatInZone, utcToZoned, zonedToUtc, zoneLabel } from "../time"
import { useConfirm } from "./confirm"
import { MediaThumb, UploadButton } from "./media-library"
import { History } from "./post-editor"
import { useMediaUpload } from "./use-media-upload"

type Keyword = { id: string; phrase: string }

const AUTOSAVE_MS = 10_000

export function ArticleEditor({
  clientId,
  listHref,
  connectionsHref,
  settingsHref,
  article,
  media,
  keywords,
  settings,
  hasWordPress,
  canWrite,
  events,
}: {
  clientId: string
  listHref: string
  connectionsHref: string
  settingsHref: string
  article: ArticleFull | null
  media: MediaRow[]
  keywords: Keyword[]
  settings: ContentSettings
  hasWordPress: boolean
  canWrite: boolean
  events: ContentEvent[]
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const tz = settings.timezone
  const [id, setId] = useState<string | null>(article?.id ?? null)
  const [title, setTitle] = useState(article?.title ?? "")
  const [slug, setSlug] = useState(article?.slug ?? "")
  const [slugTouched, setSlugTouched] = useState(Boolean(article?.slug))
  const [html, setHtml] = useState(article?.bodyHtml ?? "")
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "")
  const [tags, setTags] = useState<string[]>(article?.tags ?? settings.wpDefaultTags)
  const [featured, setFeatured] = useState<string | null>(article?.featuredMediaId ?? null)
  const [seoTitle, setSeoTitle] = useState(article?.seoTitle ?? "")
  const [meta, setMeta] = useState(article?.metaDescription ?? "")
  const [focus, setFocus] = useState(article?.focusKeyword ?? "")
  const [keywordId, setKeywordId] = useState<string | null>(article?.keywordId ?? null)
  const [topic, setTopic] = useState(article?.topic ?? "")
  const [author, setAuthor] = useState(article?.author ?? "")
  const start0 = article?.publishAt ? utcToZoned(article.publishAt, tz) : { date: "", time: "" }
  const [date, setDate] = useState(start0.date)
  const [time, setTime] = useState(start0.time || "09:00")
  const [saved, setSaved] = useState<"saved" | "saving" | "dirty" | "error">("saved")
  const [pending, start] = useTransition()
  const dirty = useRef(false)
  const saving = useRef<Promise<string | null> | null>(null)

  const status = article?.status ?? "draft"
  const onWordPress = Boolean(article?.wpArticleId)
  const readOnly = !canWrite || status === "publishing"
  const images = useMemo(() => media.filter((m) => m.kind === "image"), [media])
  const featuredRow = images.find((m) => m.id === featured) ?? null

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: "Write the article…" }),
    ],
    content: article?.bodyHtml ?? "",
    editorProps: { attributes: { class: "article-body min-h-[420px] px-1 py-2", "aria-label": "Article text" } },
    onUpdate: ({ editor: e }) => {
      setHtml(e.getHTML())
      markDirty()
    },
  })

  const markDirty = () => {
    dirty.current = true
    setSaved("dirty")
  }

  const input = useCallback(
    (): ArticleInput => ({
      id,
      title,
      slug: slug || null,
      bodyHtml: editor?.getHTML() ?? html,
      excerpt: excerpt || null,
      tags,
      featuredMediaId: featured,
      seoTitle: seoTitle || null,
      metaDescription: meta || null,
      focusKeyword: focus || null,
      keywordId,
      topic: topic || null,
      author: author || null,
      publishAt: date && time ? zonedToUtc(date, time, tz) : null,
    }),
    [id, title, slug, editor, html, excerpt, tags, featured, seoTitle, meta, focus, keywordId, topic, author, date, time, tz],
  )

  const save = useCallback(async (): Promise<string | null> => {
    if (saving.current) await saving.current
    const run = (async () => {
      setSaved("saving")
      dirty.current = false
      const r = await saveArticle(clientId, input())
      if (!r.ok) {
        dirty.current = true
        setSaved("error")
        toast.error(r.error)
        return null
      }
      setSaved(dirty.current ? "dirty" : "saved")
      if (!id) {
        setId(r.data.id)
        // Keep the editor (and the cursor) where it is; only the address changes.
        window.history.replaceState(null, "", `${listHref}/articles/${r.data.id}`)
      }
      return r.data.id
    })()
    saving.current = run
    try {
      return await run
    } finally {
      saving.current = null
    }
  }, [clientId, input, id, listHref])

  // Autosave while typing, and before leaving.
  useEffect(() => {
    if (readOnly) return
    const t = window.setInterval(() => {
      if (dirty.current && !saving.current && (title.trim() || (editor?.getText().trim().length ?? 0) > 0)) void save()
    }, AUTOSAVE_MS)
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => {
      window.clearInterval(t)
      window.removeEventListener("beforeunload", warn)
    }
  }, [save, readOnly, title, editor])

  const field = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    markDirty()
  }

  const checks = articleChecks({
    title,
    bodyHtml: html,
    featured: Boolean(featured),
    focusKeyword: focus,
    seoTitle,
    metaDescription: meta,
  })
  const words = wordsOf(html)
  const publishAt = date && time ? zonedToUtc(date, time, tz) : null
  const changedSinceSent = Boolean(article && article.sentVersion !== null && article.version > article.sentVersion) || saved === "dirty" || saved === "error"
  const wpEdit = article?.wpArticleId && settings.wpSiteUrl ? `${settings.wpSiteUrl.replace(/\/+$/, "")}/wp-admin/post.php?post=${encodeURIComponent(article.wpArticleId)}&action=edit` : null

  // Questions come first, outside the transition (a dialog opened inside one never shows).
  type Ask = Parameters<typeof confirm>[0]
  const act = async (fn: () => Promise<void>, ask?: Ask) => {
    if (ask && !(await confirm(ask))) return
    start(fn)
  }

  const publish = (mode: "now" | "schedule") => {
    if (mode === "schedule" && !publishAt) {
      toast.error("Pick a publish date and time.")
      return
    }
    void act(
      async () => {
        const saved = await save()
        if (!saved) return
        const r = await publishArticle(saved, mode)
        if (!r.ok) {
          toast.error(r.error, { duration: 10_000 })
          router.refresh()
          return
        }
        toast.success(r.data.status === "scheduled" ? "Scheduled on WordPress" : "Published on WordPress", {
          action: { label: "View", onClick: () => router.push(`${listHref}/articles/${saved}`) },
        })
        // Back to the Articles list, where the article now shows with its status and link.
        dirty.current = false
        router.push(`${listHref}?tab=articles`)
      },
      {
        title: mode === "now" ? "Publish on WordPress now?" : `Schedule for ${formatInZone(publishAt!, tz)}?`,
        description:
          mode === "now"
            ? "The article goes live on the client's site right away."
            : "WordPress publishes it at that time by itself. You can still edit or unschedule it here.",
        action: mode === "now" ? "Publish now" : "Schedule",
      },
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Writing */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusTag tone={STATUS_META[status].tone}>{STATUS_META[status].label}</StatusTag>
          <span aria-live="polite">
            {saved === "saving" ? "Saving…" : saved === "dirty" ? "Unsaved changes" : saved === "error" ? "Not saved" : id ? "Saved" : "Not saved yet"}
          </span>
          <span>·</span>
          <span className="tabular-nums">
            {words} words · {Math.max(1, Math.round(words / 230))} min read
          </span>
          {canWrite && (
            <Button size="sm" variant="ghost" className="ml-auto" disabled={pending || saved === "saving"} onClick={() => act(async () => void (await save()))}>
              Save
            </Button>
          )}
        </div>

        {article?.lastError && (
          <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft p-2 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            {article.lastError}
          </p>
        )}

        <Textarea
          aria-label="Title"
          value={title}
          rows={1}
          maxLength={300}
          disabled={readOnly}
          onChange={(e) => {
            field(setTitle)(e.target.value)
            if (!slugTouched) setSlug(slugify(e.target.value))
          }}
          placeholder="Article title"
          className="min-h-0 resize-none border-0 px-1 text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-3xl"
        />

        <div className="rounded-lg border bg-card">
          {editor && !readOnly && <Toolbar editor={editor} clientId={clientId} />}
          <div className="px-4 py-2">
            <EditorContent editor={editor} />
          </div>
        </div>

        {events.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">History</h2>
            <History events={events} />
          </section>
        )}
      </div>

      {/* Side panel */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-1">
        <Panel title="Publish">
          {!hasWordPress ? (
            <p className="text-sm text-muted-foreground">
              No WordPress site is connected.{" "}
              <Link className="underline" href={connectionsHref}>
                Connect it
              </Link>{" "}
              to publish.
            </p>
          ) : !settings.wpBlogId ? (
            <p className="text-sm text-muted-foreground">
              Pick the WordPress blog in{" "}
              <Link className="underline" href={settingsHref}>
                Content settings
              </Link>{" "}
              first.
            </p>
          ) : null}
          {article?.wpUrl && (
            <a href={article.wpUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-brand underline-offset-2 hover:underline">
              <ExternalLink className="size-3.5" />
              View on the site
            </a>
          )}
          {status !== "published" && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="pub-date" className="text-xs">
                    Publish date
                  </Label>
                  <Input id="pub-date" type="date" value={date} disabled={readOnly} onChange={(e) => field(setDate)(e.target.value)} className="h-8 w-[150px]" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="pub-time" className="text-xs">
                    Time
                  </Label>
                  <Input id="pub-time" type="time" value={time} disabled={readOnly} onChange={(e) => field(setTime)(e.target.value)} className="h-8 w-[110px]" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{zoneLabel(tz)}</p>
            </div>
          )}
          {canWrite && hasWordPress && settings.wpBlogId && (
            <div className="flex flex-wrap gap-2">
              {status === "published" ? (
                <>
                  <Button size="sm" disabled={pending || !changedSinceSent} onClick={() => act(async () => {
                    if (!(await save())) return
                    const r = await updateArticleOnWordPress(article!.id)
                    if (r.ok) toast.success("Updated on WordPress")
                    else toast.error(r.error)
                    router.refresh()
                  })}>
                    <Send />
                    Update on WordPress
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(async () => {
                    const r = await unpublishArticle(article!.id)
                    if (r.ok) toast.success("Moved back to a WordPress draft")
                    else toast.error(r.error)
                    router.refresh()
                  }, { title: "Unpublish this article?", description: "It goes back to a draft on WordPress and comes off the site. You can publish it again.", action: "Unpublish", danger: true })}>
                    <Undo2 />
                    Unpublish
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" disabled={pending || !title.trim()} onClick={() => publish("now")}>
                    <Send />
                    Publish now
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending || !title.trim() || !publishAt} onClick={() => publish("schedule")}>
                    <CalendarClock />
                    {status === "scheduled" ? "Reschedule" : "Schedule"}
                  </Button>
                  {status === "scheduled" && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(async () => {
                      const r = await unpublishArticle(article!.id)
                      if (r.ok) toast.success("Unscheduled. It's a WordPress draft now.")
                      else toast.error(r.error)
                      router.refresh()
                    })}>
                      Unschedule
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
          {status === "scheduled" && article?.publishAt && (
            <p className="text-xs text-muted-foreground">WordPress publishes it on {formatInZone(article.publishAt, tz, { year: "numeric" })}.</p>
          )}
          {canWrite && (onWordPress || id) && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {onWordPress ? (
                <Button size="sm" variant="ghost" className="text-danger hover:text-danger" disabled={pending} onClick={() => act(async () => {
                  const r = await deleteArticleFromWordPress(article!.id)
                  if (r.ok) toast.success("Deleted from WordPress")
                  else toast.error(r.error)
                  router.refresh()
                }, { title: "Delete it from WordPress?", description: "WordPress deletes it for good (not to the trash). It stays here as a draft.", action: "Delete from WordPress", danger: true })}>
                  <Trash2 />
                  Delete from WordPress
                </Button>
              ) : (
                <Button size="sm" variant="ghost" className="text-danger hover:text-danger" disabled={pending} onClick={() => act(async () => {
                  if (!id) return
                  const r = await deleteArticleDraft(id)
                  if (!r.ok) {
                    toast.error(r.error)
                    return
                  }
                  dirty.current = false
                  router.push(listHref + "?tab=articles")
                }, { title: "Delete this draft?", description: "It's removed for good. Nothing was published.", action: "Delete", danger: true })}>
                  <Trash2 />
                  Delete draft
                </Button>
              )}
            </div>
          )}
        </Panel>

        {status === "published" && (
          <SeoPasteStep articleId={article!.id} seoTitle={seoTitle} meta={meta} done={Boolean(article!.seoPastedAt)} wpEdit={wpEdit} canWrite={canWrite} />
        )}

        <Panel title="Search appearance">
          <SeoField id="seo-title" label="SEO title" value={seoTitle} max={SEO_TITLE_MAX} hardMax={70} disabled={readOnly} onChange={field(setSeoTitle)} placeholder={title} />
          <SeoField id="meta" label="Meta description" value={meta} max={META_MAX} hardMax={170} disabled={readOnly} onChange={field(setMeta)} multiline />
          <div className="rounded-md border bg-background p-3">
            <p className="truncate text-xs text-muted-foreground">{(settings.wpSiteUrl ?? "https://example.com").replace(/\/+$/, "")}/{slug || "…"}</p>
            <p className="line-clamp-1 text-[15px] text-[#1a0dab] dark:text-[#8ab4f8]">{seoTitle || title || "Article title"}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{meta || excerpt || "The meta description shows here."}</p>
          </div>
          <p className="text-xs text-muted-foreground">Zernio can&apos;t set SEO plugin fields; after publishing you paste these into WordPress.</p>
        </Panel>

        <Panel title="Details">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">Web address</Label>
            <Input
              id="slug"
              value={slug}
              disabled={readOnly}
              onChange={(e) => {
                setSlugTouched(true)
                field(setSlug)(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 200))
              }}
              onBlur={() => setSlug((s) => slugify(s))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Focus keyword</Label>
            {keywords.length > 0 && (
              <Select
                value={keywordId ?? "free"}
                onValueChange={(v) => {
                  if (v === "free") {
                    field(setKeywordId)(null)
                    return
                  }
                  field(setKeywordId)(v)
                  setFocus(keywords.find((k) => k.id === v)?.phrase ?? "")
                }}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Type my own</SelectItem>
                  {keywords.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.phrase}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {(!keywordId || keywords.length === 0) && (
              <Input value={focus} maxLength={120} disabled={readOnly} onChange={(e) => field(setFocus)(e.target.value)} placeholder="e.g. emergency plumber phoenix" aria-label="Focus keyword" />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="excerpt">Excerpt</Label>
            <Textarea id="excerpt" rows={3} maxLength={600} value={excerpt} disabled={readOnly} onChange={(e) => field(setExcerpt)(e.target.value)} placeholder="Shown on blog lists. Empty = the first lines." />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tags">Tags</Label>
            <ChipsInput id="tags" values={tags} onChange={field(setTags)} max={20} maxLength={50} placeholder="Type a tag and press Enter" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="topic">Topic</Label>
              <Input id="topic" value={topic} maxLength={120} disabled={readOnly} onChange={(e) => field(setTopic)(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="author">Author no.</Label>
              <Input id="author" inputMode="numeric" value={author} disabled={readOnly} placeholder={settings.wpDefaultAuthor ?? "Default"} onChange={(e) => field(setAuthor)(e.target.value.replace(/\D/g, "").slice(0, 12))} />
            </div>
          </div>
        </Panel>

        <Panel title="Featured image">
          {featuredRow ? (
            <div className="flex flex-col gap-2">
              <MediaThumb m={featuredRow} className="aspect-video" />
              {!featuredRow.altText && <p className="text-xs text-warning">No alt text. Add it in the Media tab.</p>}
              {featuredRow.bytes > 10 * 1024 * 1024 && <p className="text-xs text-danger">Over 10 MB: WordPress won&apos;t take it as a featured image.</p>}
              {!readOnly && (
                <Button size="sm" variant="ghost" className="w-fit" onClick={() => field(setFeatured)(null)}>
                  <X />
                  Remove
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">WordPress copies it into its media library when the article is published.</p>
          )}
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" disabled={images.length === 0}>
                    <ImagePlus />
                    From library
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(92vw,360px)]">
                  <ul className="grid max-h-[300px] grid-cols-3 gap-2 overflow-y-auto">
                    {images.map((m) => (
                      <li key={m.id}>
                        <button type="button" className="w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => field(setFeatured)(m.id)} aria-label={`Use ${m.title || m.fileName}`}>
                          <MediaThumb m={m} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
              <UploadButton
                clientId={clientId}
                accept="image/jpeg,image/png,image/webp,image/gif"
                onUploaded={(mid) => {
                  field(setFeatured)(mid)
                  router.refresh()
                }}
              />
            </div>
          )}
        </Panel>

        <Panel title="Before you publish">
          <ul className="flex flex-col gap-1.5 text-sm">
            {checks.map((c) => (
              <li key={c.label} className={cn("flex items-start gap-2", c.ok ? "text-muted-foreground" : "text-foreground")}>
                {c.ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-label="To do" />}
                {c.label}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Tips only; nothing here stops publishing.</p>
        </Panel>
      </aside>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function SeoField({
  id,
  label,
  value,
  max,
  hardMax,
  disabled,
  onChange,
  placeholder,
  multiline = false,
}: {
  id: string
  label: string
  value: string
  max: number
  hardMax: number
  disabled: boolean
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  const n = value.length
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className={cn("text-xs tabular-nums", n > max ? "text-warning" : "text-muted-foreground")}>
          {n}/{max}
        </span>
      </div>
      {multiline ? (
        <Textarea id={id} rows={3} maxLength={hardMax} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input id={id} maxLength={hardMax} value={value} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

/** After publishing: paste the SEO title and meta description into the SEO plugin by hand. */
function SeoPasteStep({
  articleId,
  seoTitle,
  meta,
  done,
  wpEdit,
  canWrite,
}: {
  articleId: string
  seoTitle: string
  meta: string
  done: boolean
  wpEdit: string | null
  canWrite: boolean
}) {
  const [checked, setChecked] = useState(done)
  const [pending, start] = useTransition()
  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${what} copied`),
      () => toast.error("Couldn't copy. Select the text and copy it instead."),
    )
  return (
    <section className={cn("flex flex-col gap-3 rounded-lg border p-4", checked ? "bg-card" : "border-warning/40 bg-warning-soft")}>
      <h2 className="text-sm font-semibold">Paste the SEO fields into WordPress</h2>
      <p className="text-sm text-muted-foreground">Open the post in WordPress and paste these into Yoast or Rank Math.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!seoTitle} onClick={() => copy(seoTitle, "SEO title")}>
          <Copy />
          SEO title
        </Button>
        <Button size="sm" variant="outline" disabled={!meta} onClick={() => copy(meta, "Meta description")}>
          <Copy />
          Meta description
        </Button>
        {wpEdit && (
          <Button asChild size="sm" variant="ghost">
            <a href={wpEdit} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              Open in WordPress
            </a>
          </Button>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={checked}
          disabled={!canWrite || pending}
          onCheckedChange={(v) => {
            const next = Boolean(v)
            setChecked(next)
            start(async () => {
              const r = await markSeoPasted(articleId, next)
              if (!r.ok) {
                setChecked(!next)
                toast.error(r.error)
              }
            })
          }}
        />
        Done: pasted into WordPress
      </label>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function Toolbar({ editor, clientId }: { editor: Editor; clientId: string }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const c = () => editor.chain().focus()
  return (
    <div role="toolbar" aria-label="Formatting" className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-card/95 px-2 py-1 backdrop-blur">
      <Tool label="Heading" active={state.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        <Heading2 />
      </Tool>
      <Tool label="Subheading" active={state.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>
        <Heading3 />
      </Tool>
      <Sep />
      <Tool label="Bold" active={state.bold} onClick={() => c().toggleBold().run()}>
        <Bold />
      </Tool>
      <Tool label="Italic" active={state.italic} onClick={() => c().toggleItalic().run()}>
        <Italic />
      </Tool>
      <LinkTool editor={editor} active={state.link} />
      <Sep />
      <Tool label="Bulleted list" active={state.bullet} onClick={() => c().toggleBulletList().run()}>
        <List />
      </Tool>
      <Tool label="Numbered list" active={state.ordered} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered />
      </Tool>
      <Tool label="Quote" active={state.quote} onClick={() => c().toggleBlockquote().run()}>
        <Quote />
      </Tool>
      <Tool label="Divider" onClick={() => c().setHorizontalRule().run()}>
        <Minus />
      </Tool>
      <ImageTool editor={editor} clientId={clientId} />
      <Sep />
      <Tool label="Undo" disabled={!state.canUndo} onClick={() => c().undo().run()}>
        <Undo2 />
      </Tool>
      <Tool label="Redo" disabled={!state.canRedo} onClick={() => c().redo().run()}>
        <Redo2 />
      </Tool>
    </div>
  )
}

function Tool({ label, active = false, disabled = false, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" className={cn("size-8", active && "bg-muted text-foreground")} aria-label={label} aria-pressed={active} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}

const Sep = () => <span aria-hidden className="mx-1 h-5 w-px bg-border" />

function LinkTool({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setUrl((editor.getAttributes("link").href as string | undefined) ?? "")
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className={cn("size-8", active && "bg-muted")} aria-label="Link" title="Link">
          <Link2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px]" align="start">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const href = url.trim()
            if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
              toast.error("Links start with https://, mailto: or tel:")
              return
            }
            editor.chain().focus().extendMarkRange("link").setLink({ href }).run()
            setOpen(false)
          }}
        >
          <Label htmlFor="link-url">Link to</Label>
          <Input id="link-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" autoFocus />
          <div className="flex gap-2">
            <Button size="sm" type="submit">
              Set link
            </Button>
            {active && (
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run()
                  setOpen(false)
                }}
              >
                <Unlink />
                Remove
              </Button>
            )}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function ImageTool({ editor, clientId }: { editor: Editor; clientId: string }) {
  const { uploadInline, busy } = useMediaUpload(clientId)
  const [open, setOpen] = useState(false)
  const [alt, setAlt] = useState("")
  const file = useRef<HTMLInputElement>(null)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Image" title="Image" disabled={busy}>
          <ImagePlus />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px]" align="start">
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = file.current?.files?.[0]
            if (!f) {
              toast.error("Pick an image.")
              return
            }
            const r = await uploadInline(f)
            if (!r.ok) {
              toast.error(r.error)
              return
            }
            editor.chain().focus().setImage({ src: r.url, alt: alt.trim() || undefined }).run()
            setAlt("")
            if (file.current) file.current.value = ""
            setOpen(false)
          }}
        >
          <Label htmlFor="img-file">Image</Label>
          <input id="img-file" ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="text-sm" />
          <Label htmlFor="img-alt">Alt text</Label>
          <Input id="img-alt" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="What the image shows" />
          <Button size="sm" type="submit" disabled={busy}>
            {busy ? "Uploading…" : "Insert"}
          </Button>
          <p className="text-xs text-muted-foreground">The site shows it from LeadMaker&apos;s file storage.</p>
        </form>
      </PopoverContent>
    </Popover>
  )
}
