"use client"

import { FileText, Film, ImageIcon, Trash2, Upload } from "lucide-react"
import { useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { deleteMedia, updateMedia } from "../actions"
import type { MediaRow } from "../queries"
import { useConfirm } from "./confirm"
import { ACCEPT_ATTR, useMediaUpload } from "./use-media-upload"

export const fileSize = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

/** The square preview used in the library, the composer and the editor. */
export function MediaThumb({ m, className }: { m: Pick<MediaRow, "kind" | "previewUrl" | "fileName" | "altText">; className?: string }) {
  const Icon = m.kind === "video" ? Film : m.kind === "document" ? FileText : ImageIcon
  return (
    <span className={cn("relative grid aspect-square place-items-center overflow-hidden rounded-md border bg-muted", className)}>
      {m.previewUrl ? (
        // Signed Storage URLs: next/image can't optimise them.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.previewUrl} alt={m.altText ?? ""} className="size-full object-cover" loading="lazy" />
      ) : (
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      )}
      {m.kind !== "image" && (
        <span className="absolute bottom-1 left-1 rounded-sm bg-background/90 px-1 text-[10px] font-medium uppercase">
          {m.kind === "video" ? "Video" : "PDF"}
        </span>
      )}
    </span>
  )
}

/** Upload button that reports results with toasts. Calls onUploaded with each new id. */
export function UploadButton({
  clientId,
  onUploaded,
  label = "Upload",
  variant = "outline",
  accept = ACCEPT_ATTR,
}: {
  clientId: string
  onUploaded?: (id: string) => void
  label?: string
  variant?: "default" | "outline"
  accept?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const { upload, busy } = useMediaUpload(clientId)
  const onFiles = async (files: FileList | null) => {
    for (const f of Array.from(files ?? []).slice(0, 20)) {
      const r = await upload(f)
      if (r.ok) onUploaded?.(r.id)
      else toast.error(r.error)
    }
    if (input.current) input.current.value = ""
  }
  return (
    <>
      <input ref={input} type="file" multiple accept={accept} className="sr-only" tabIndex={-1} onChange={(e) => onFiles(e.target.files)} />
      <Button type="button" variant={variant} size="sm" disabled={busy} onClick={() => input.current?.click()}>
        <Upload />
        {busy ? "Uploading…" : label}
      </Button>
    </>
  )
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "document", label: "PDFs" },
] as const

export function MediaLibrary({ clientId, media, canWrite }: { clientId: string; media: MediaRow[]; canWrite: boolean }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all")
  const [selected, setSelected] = useState<string | null>(null)
  const list = useMemo(() => (filter === "all" ? media : media.filter((m) => m.kind === filter)), [media, filter])
  const current = media.find((m) => m.id === selected) ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="File type" className="flex rounded-lg border bg-card p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "h-7 rounded-md px-2.5 text-sm",
                filter === f.value ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {canWrite && <UploadButton clientId={clientId} variant="default" label="Upload files" />}
      </div>
      <p className="text-xs text-muted-foreground">
        Images up to 20 MB, videos up to 500 MB, PDFs up to 100 MB (LinkedIn only). Files stay here and go to Zernio when
        a post is scheduled.
      </p>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
          <p className="text-sm font-medium">{media.length ? "Nothing of this type yet" : "No files yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">Upload the client&apos;s photos, videos and PDFs to use them in posts and articles.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {list.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setSelected(m.id === selected ? null : m.id)}
                  aria-pressed={m.id === selected}
                  className={cn(
                    "flex w-full flex-col gap-1.5 rounded-lg p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    m.id === selected && "bg-muted",
                  )}
                >
                  <MediaThumb m={m} />
                  <span className="truncate text-xs font-medium">{m.title || m.fileName}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {fileSize(m.bytes)}
                    {m.usedIn > 0 ? ` · used ${formatNumber(m.usedIn)}×` : ""}
                    {m.kind === "image" && !m.altText ? " · no alt text" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {current ? (
            <MediaDetails key={current.id} clientId={clientId} m={current} canWrite={canWrite} onDone={() => setSelected(null)} />
          ) : (
            <p className="hidden text-sm text-muted-foreground lg:block">Pick a file to add alt text or delete it.</p>
          )}
        </div>
      )}
    </div>
  )
}

function MediaDetails({ clientId, m, canWrite, onDone }: { clientId: string; m: MediaRow; canWrite: boolean; onDone: () => void }) {
  const [alt, setAlt] = useState(m.altText ?? "")
  const [title, setTitle] = useState(m.title ?? "")
  const [pending, start] = useTransition()
  const confirm = useConfirm()
  return (
    <aside className="flex flex-col gap-3 self-start rounded-lg border bg-card p-4 lg:sticky lg:top-20">
      <MediaThumb m={m} className="aspect-video" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">File</dt>
        <dd className="truncate">{m.fileName}</dd>
        <dt className="text-muted-foreground">Size</dt>
        <dd>
          {fileSize(m.bytes)}
          {m.width && m.height ? ` · ${m.width}×${m.height}` : ""}
          {m.durationS ? ` · ${Math.round(m.durationS)} s` : ""}
        </dd>
        <dt className="text-muted-foreground">Added</dt>
        <dd>{m.createdBy ?? "Someone"}</dd>
      </dl>
      {canWrite && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const r = await updateMedia(clientId, m.id, { altText: alt, title })
              if (r.ok) toast.success("Saved")
              else toast.error(r.error)
            })
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`title-${m.id}`}>Name</Label>
            <Input id={`title-${m.id}`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={m.fileName} />
          </div>
          {m.kind === "image" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`alt-${m.id}`}>Alt text</Label>
              <Input id={`alt-${m.id}`} value={alt} maxLength={500} onChange={(e) => setAlt(e.target.value)} placeholder="What the image shows" />
              <p className="text-xs text-muted-foreground">Read by screen readers; sent with posts that allow it.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-danger hover:text-danger"
              disabled={pending}
              onClick={async () => {
                const yes = await confirm({
                  title: `Delete ${m.title || m.fileName}?`,
                  description: "It's removed from the library. Posts and articles already published keep their own copy.",
                  action: "Delete",
                  danger: true,
                })
                if (!yes) return
                start(async () => {
                  const r = await deleteMedia(m.id)
                  if (r.ok) {
                    toast.success("Deleted")
                    onDone()
                  } else toast.error(r.error)
                })
              }}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        </form>
      )}
    </aside>
  )
}
