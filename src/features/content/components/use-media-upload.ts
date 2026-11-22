"use client"

import { useCallback, useState } from "react"

import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { recordMedia } from "../actions"

/**
 * Uploads go from the browser straight to Supabase Storage (the person's own session; storage
 * RLS checks the client), then the row is recorded. Nothing passes through our server.
 */

export const ACCEPT: Record<string, { kind: "image" | "video" | "document"; max: number }> = {
  "image/jpeg": { kind: "image", max: 20 },
  "image/png": { kind: "image", max: 20 },
  "image/webp": { kind: "image", max: 20 },
  "image/gif": { kind: "image", max: 20 },
  "video/mp4": { kind: "video", max: 500 },
  "video/quicktime": { kind: "video", max: 500 },
  "video/webm": { kind: "video", max: 500 },
  "application/pdf": { kind: "document", max: 100 },
}
export const ACCEPT_ATTR = Object.keys(ACCEPT).join(",")
const INLINE = ["image/jpeg", "image/png", "image/webp", "image/gif"]

const safe = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-100) || "file"

type Meta = { width: number | null; height: number | null; durationS: number | null; thumb: Blob | null }

async function readMeta(file: File, kind: "image" | "video" | "document"): Promise<Meta> {
  const none = { width: null, height: null, durationS: null, thumb: null }
  try {
    if (kind === "image") {
      const bmp = await createImageBitmap(file)
      const m = { width: bmp.width, height: bmp.height, durationS: null, thumb: null }
      bmp.close()
      return m
    }
    if (kind === "video") {
      const url = URL.createObjectURL(file)
      try {
        const video = document.createElement("video")
        video.preload = "metadata"
        video.muted = true
        video.playsInline = true
        video.src = url
        await new Promise<void>((res, rej) => {
          video.onloadeddata = () => res()
          video.onerror = () => rej(new Error("unreadable"))
          setTimeout(() => rej(new Error("timeout")), 15_000)
        })
        video.currentTime = Math.min(1, (video.duration || 2) / 2)
        await new Promise<void>((res) => {
          video.onseeked = () => res()
          setTimeout(res, 5_000)
        })
        const w = video.videoWidth
        const h = video.videoHeight
        let thumb: Blob | null = null
        if (w && h) {
          const scale = Math.min(1, 640 / Math.max(w, h))
          const canvas = document.createElement("canvas")
          canvas.width = Math.round(w * scale)
          canvas.height = Math.round(h * scale)
          canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height)
          thumb = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.8))
        }
        return { width: w || null, height: h || null, durationS: Number.isFinite(video.duration) ? video.duration : null, thumb }
      } finally {
        URL.revokeObjectURL(url)
      }
    }
  } catch {
    return none
  }
  return none
}

export function checkFile(file: File): string | null {
  const rule = ACCEPT[file.type]
  if (!rule) return `${file.name}: use JPG, PNG, WebP or GIF images, MP4, MOV or WebM videos, or a PDF.`
  if (file.size > rule.max * 1024 * 1024) return `${file.name} is larger than ${rule.max} MB.`
  if (file.size === 0) return `${file.name} is empty.`
  return null
}

export function useMediaUpload(clientId: string) {
  const [busy, setBusy] = useState(0)

  const upload = useCallback(
    async (file: File): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
      const problem = checkFile(file)
      if (problem) return { ok: false, error: problem }
      const rule = ACCEPT[file.type]
      setBusy((n) => n + 1)
      try {
        const sb = createSupabaseBrowserClient()
        const id = crypto.randomUUID()
        const path = `${clientId}/${id}/${safe(file.name)}`
        const meta = await readMeta(file, rule.kind)
        const { error } = await sb.storage.from("content-media").upload(path, file, { contentType: file.type, upsert: false })
        if (error) {
          return {
            ok: false,
            error: /exceed|too large|maximum/i.test(error.message)
              ? `${file.name} is larger than the storage upload limit. An admin can raise it in Supabase (Storage → Settings).`
              : `Couldn't upload ${file.name}. Try again.`,
          }
        }
        let thumbPath: string | null = null
        if (meta.thumb) {
          const tp = `${clientId}/${id}/preview.jpg`
          const { error: te } = await sb.storage.from("content-media").upload(tp, meta.thumb, { contentType: "image/jpeg", upsert: false })
          if (!te) thumbPath = tp
        }
        const r = await recordMedia(clientId, {
          id,
          storagePath: path,
          fileName: file.name.slice(0, 200),
          mime: file.type,
          bytes: file.size,
          width: meta.width,
          height: meta.height,
          durationS: meta.durationS === null ? null : Math.round(meta.durationS * 100) / 100,
          thumbPath,
        })
        if (!r.ok) {
          await sb.storage.from("content-media").remove([path, ...(thumbPath ? [thumbPath] : [])])
          return { ok: false, error: r.error }
        }
        return { ok: true, id }
      } finally {
        setBusy((n) => n - 1)
      }
    },
    [clientId],
  )

  /** An image inside an article: a permanent public URL WordPress can show. */
  const uploadInline = useCallback(
    async (file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
      if (!INLINE.includes(file.type)) return { ok: false, error: "Use a JPG, PNG, WebP or GIF image." }
      if (file.size > 20 * 1024 * 1024) return { ok: false, error: "Images inside an article can be 20 MB at most." }
      setBusy((n) => n + 1)
      try {
        const sb = createSupabaseBrowserClient()
        const ext = file.type.split("/")[1].replace("jpeg", "jpg")
        const path = `${clientId}/${crypto.randomUUID()}.${ext}`
        const { error } = await sb.storage.from("content-inline").upload(path, file, { contentType: file.type, upsert: false })
        if (error) return { ok: false, error: "Couldn't upload the image. Try again." }
        return { ok: true, url: sb.storage.from("content-inline").getPublicUrl(path).data.publicUrl }
      } finally {
        setBusy((n) => n - 1)
      }
    },
    [clientId],
  )

  return { upload, uploadInline, busy: busy > 0 }
}
