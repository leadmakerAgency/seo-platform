import type { Tone } from "@/components/common/status"
import {
  BadgeCheck,
  KeyRound,
  ListTodo,
  type LucideIcon,
  MessageCircleQuestion,
  Paperclip,
} from "lucide-react"

import type { Database, Json } from "@/lib/supabase/database.types"

export type RequestKind = Database["public"]["Enums"]["request_kind"]
export type RequestStatus = Database["public"]["Enums"]["request_status"]
export type RequestDecision = Database["public"]["Enums"]["request_decision"]

export const REQUEST_KINDS: RequestKind[] = ["question", "code", "files", "approval", "action"]

export const KIND_META: Record<
  RequestKind,
  { label: string; icon: LucideIcon; hint: string; clientLabel: string }
> = {
  question: {
    label: "Question",
    icon: MessageCircleQuestion,
    hint: "The client types an answer.",
    clientLabel: "Question",
  },
  code: {
    label: "Code",
    icon: KeyRound,
    hint: "A verification code. Hidden from the team until someone clicks Show.",
    clientLabel: "Code",
  },
  files: {
    label: "Files",
    icon: Paperclip,
    hint: "Photos or PDFs, uploaded from a phone or computer.",
    clientLabel: "Files",
  },
  approval: {
    label: "Approval",
    icon: BadgeCheck,
    hint: "The client approves, or asks for changes with a note.",
    clientLabel: "Approval",
  },
  action: {
    label: "Action",
    icon: ListTodo,
    hint: "Steps the client follows, then taps “I’ve done this”.",
    clientLabel: "To do",
  },
}

export const REQUEST_STATUS_META: Record<
  RequestStatus,
  { label: string; short: string; tone: Tone }
> = {
  open: {
    label: "Waiting on client",
    short: "Waiting",
    tone: "warning",
  },
  answered: {
    label: "Answered, needs you",
    short: "Answered",
    tone: "brand",
  },
  done: { label: "Done", short: "Done", tone: "success" },
  cancelled: {
    label: "Cancelled",
    short: "Cancelled",
    tone: "neutral",
  },
}

export const DECISION_LABELS: Record<RequestDecision, string> = {
  approved: "Approved",
  changes_requested: "Asked for changes",
}

/** Which kinds can skip the review step ("Done when the client answers"). */
export const AUTO_COMPLETE_KINDS: RequestKind[] = ["question", "code", "action"]

export function requestNumber(n: number) {
  return `R-${n}`
}

// ---------------------------------------------------------------------------
// Type-specific options, stored as jsonb on the request
// ---------------------------------------------------------------------------
export type FileAccept = "images" | "pdf" | "any"

export type RequestOptions = {
  answer?: "short" | "long"
  accept?: FileAccept
  min_files?: number
  max_files?: number
  amount?: number
  currency?: string
  steps?: string[]
  help_url?: string
  link_url?: string
}

export const ACCEPT_LABELS: Record<FileAccept, string> = {
  images: "Photos and images",
  pdf: "PDF files",
  any: "Images or PDF",
}

/** The bucket only takes images and PDF, so "any" means either. */
export const ACCEPT_MIME: Record<FileAccept, string[]> = {
  images: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"],
  pdf: ["application/pdf"],
  any: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "application/pdf",
  ],
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_FILES = 20

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/** Reads the jsonb options defensively; unknown or malformed keys are dropped. */
export function parseOptions(value: Json | unknown): RequestOptions {
  if (!isObject(value)) return {}
  const out: RequestOptions = {}
  if (value.answer === "short" || value.answer === "long") out.answer = value.answer
  if (value.accept === "images" || value.accept === "pdf" || value.accept === "any") {
    out.accept = value.accept
  }
  const int = (v: unknown) =>
    typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_FILES ? v : undefined
  out.min_files = int(value.min_files)
  out.max_files = int(value.max_files)
  if (typeof value.amount === "number" && Number.isFinite(value.amount)) out.amount = value.amount
  if (typeof value.currency === "string" && /^[A-Z]{3}$/.test(value.currency)) {
    out.currency = value.currency
  }
  if (Array.isArray(value.steps)) {
    out.steps = value.steps.filter((s): s is string => typeof s === "string" && s.length > 0)
  }
  const url = (v: unknown) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v : undefined)
  out.help_url = url(value.help_url)
  out.link_url = url(value.link_url)
  return out
}

export function formatAmount(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return ""
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "3 to 10 photos", "at least 1 file". */
export function filesRule(options: RequestOptions) {
  const min = options.min_files ?? 1
  const max = options.max_files
  const noun = options.accept === "pdf" ? "PDF" : options.accept === "images" ? "photo" : "file"
  const plural = (n: number) => (n === 1 ? noun : `${noun}s`)
  if (max && max !== min) return `${min} to ${max} ${plural(max)}`
  if (max) return `${max} ${plural(max)}`
  return `At least ${min} ${plural(min)}`
}
