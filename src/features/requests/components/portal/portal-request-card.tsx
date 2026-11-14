"use client"

import { Camera, ExternalLink, FileText, Loader2, Paperclip, X } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { dueState, formatDay } from "@/lib/dates"
import { createSupabasePublicClient } from "@/lib/supabase/public"
import { cn } from "@/lib/utils"
import {
  ACCEPT_MIME,
  filesRule,
  formatAmount,
  formatBytes,
  KIND_META,
  MAX_FILE_BYTES,
  MAX_FILES,
} from "../../constants"
import type { PortalRequest } from "../../portal"
import { attachPortalFile, removePortalFile, respondOnPortal } from "../../portal-actions"

type Props = { token: string; request: PortalRequest; today: string; name: string }

function dueText(dueOn: string | null, today: string) {
  if (!dueOn) return null
  const state = dueState(dueOn, false, today)
  if (state === "overdue") return { text: "overdue", urgent: true }
  if (state === "today") return { text: "due today", urgent: true }
  if (state === "tomorrow") return { text: "due tomorrow", urgent: false }
  return { text: `due ${formatDay(dueOn)}`, urgent: false }
}

/** One thing we need, with the right answer box for its type. */
export function PortalRequestCard({ token, request: r, today, name }: Props) {
  const due = dueText(r.dueOn, today)
  const o = r.options
  const meta =
    r.kind === "approval" && o.amount !== undefined
      ? formatAmount(o.amount, o.currency)
      : r.kind === "files"
        ? `${r.files.length} added · ${filesRule(o).toLowerCase()}`
        : null

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-card p-5",
        due?.text === "overdue" && "border-danger/30",
      )}
    >
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{KIND_META[r.kind].clientLabel}</span>
          {due && (
            <>
              <span aria-hidden>·</span>
              <span className={cn(due.urgent && "font-medium text-danger")}>{due.text}</span>
            </>
          )}
          {meta && (
            <>
              <span aria-hidden>·</span>
              <span>{meta}</span>
            </>
          )}
        </p>
        <h2 className="text-lg leading-snug font-semibold tracking-tight">{r.title}</h2>
      </div>

      {r.askAgainNote && (
        <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[15px]">
          {r.askAgainNote}
        </p>
      )}

      {r.instructions && (
        <p className="text-[15px] leading-relaxed whitespace-pre-line text-foreground/90">
          {r.instructions}
        </p>
      )}

      {r.kind === "question" && (
        <TextAnswer {...{ token, request: r, name }} long={o.answer === "long"} />
      )}
      {r.kind === "code" && <CodeAnswer {...{ token, request: r, name }} />}
      {r.kind === "approval" && <ApprovalAnswer {...{ token, request: r, name }} />}
      {r.kind === "action" && <ActionAnswer {...{ token, request: r, name }} />}
      {r.kind === "files" && <FilesAnswer {...{ token, request: r, name }} />}
    </article>
  )
}

type AnswerProps = { token: string; request: PortalRequest; name: string }

/** Sends a response; returns true when it went through. */
function useRespond({ token, request, name }: AnswerProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function respond(text: string, decision: "approved" | "changes_requested" | null = null) {
    setError(null)
    startTransition(async () => {
      const result = await respondOnPortal({
        token,
        requestId: request.id,
        text,
        decision,
        name,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Thanks, we've got it")
    })
  }
  return { pending, error, respond }
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  )
}

function TextAnswer({ long, ...props }: AnswerProps & { long: boolean }) {
  const [text, setText] = useState("")
  const { pending, error, respond } = useRespond(props)
  const id = `answer-${props.request.id}`
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        respond(text)
      }}
    >
      <label htmlFor={id} className="sr-only">
        Your answer
      </label>
      {long ? (
        <Textarea
          id={id}
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          placeholder="Type your answer"
          className="text-base"
          aria-invalid={Boolean(error)}
        />
      ) : (
        <Input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Type your answer"
          className="h-11 text-base"
          aria-invalid={Boolean(error)}
        />
      )}
      <ErrorText error={error} />
      <Button
        type="submit"
        size="lg"
        className="h-11 w-full sm:w-fit"
        disabled={pending || !text.trim()}
      >
        {pending ? "Sending…" : "Send"}
      </Button>
    </form>
  )
}

function CodeAnswer(props: AnswerProps) {
  const [code, setCode] = useState("")
  const { pending, error, respond } = useRespond(props)
  const id = `code-${props.request.id}`
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-start"
      onSubmit={(e) => {
        e.preventDefault()
        respond(code.trim())
      }}
    >
      <label htmlFor={id} className="sr-only">
        The code
      </label>
      <Input
        id={id}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        maxLength={64}
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="Code"
        className="h-12 font-mono text-xl tracking-[0.3em] sm:max-w-[240px]"
        aria-invalid={Boolean(error)}
      />
      <Button type="submit" size="lg" className="h-12 sm:w-28" disabled={pending || !code.trim()}>
        {pending ? "Sending…" : "Send"}
      </Button>
      <ErrorText error={error} />
    </form>
  )
}

function ApprovalAnswer(props: AnswerProps) {
  const o = props.request.options
  const [changing, setChanging] = useState(false)
  const [note, setNote] = useState("")
  const { pending, error, respond } = useRespond(props)

  return (
    <div className="flex flex-col gap-3">
      {o.link_url && (
        <Button asChild variant="outline" size="lg" className="h-11 w-full sm:w-fit">
          <a href={o.link_url} target="_blank" rel="noreferrer noopener">
            Open to review
            <ExternalLink />
          </a>
        </Button>
      )}
      {changing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            respond(note, "changes_requested")
          }}
        >
          <label htmlFor={`changes-${props.request.id}`} className="text-sm font-medium">
            What should we change?
          </label>
          <Textarea
            id={`changes-${props.request.id}`}
            autoFocus
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={4000}
            className="text-base"
          />
          <ErrorText error={error} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" size="lg" className="h-11" disabled={pending || !note.trim()}>
              {pending ? "Sending…" : "Send changes"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11"
              onClick={() => setChanging(false)}
            >
              Back
            </Button>
          </div>
        </form>
      ) : (
        <>
          <ErrorText error={error} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="lg"
              className="h-11"
              disabled={pending}
              onClick={() => respond("", "approved")}
            >
              {pending ? "Sending…" : "Approve"}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-11"
              disabled={pending}
              onClick={() => setChanging(true)}
            >
              Ask for changes
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function ActionAnswer(props: AnswerProps) {
  const o = props.request.options
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState("")
  const { pending, error, respond } = useRespond(props)

  return (
    <div className="flex flex-col gap-4">
      {o.steps && o.steps.length > 0 && (
        <ol className="flex flex-col gap-2.5">
          {o.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium tabular-nums">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      )}
      {o.help_url && (
        <a
          href={o.help_url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex w-fit items-center gap-1 text-sm text-brand underline-offset-4 hover:underline"
        >
          Step-by-step help with pictures
          <ExternalLink className="size-3.5" />
        </a>
      )}
      {noteOpen ? (
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={4000}
          placeholder="Anything we should know?"
          aria-label="Note for LeadMaker"
          className="text-base"
        />
      ) : (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Add a note (optional)
        </button>
      )}
      <ErrorText error={error} />
      <Button
        size="lg"
        className="h-11 w-full sm:w-fit"
        disabled={pending}
        onClick={() => respond(note)}
      >
        {pending ? "Sending…" : "I’ve done this"}
      </Button>
    </div>
  )
}

const safeName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80) || "file"

function guessMime(file: File) {
  if (file.type) return file.type
  if (/\.hei[cf]$/i.test(file.name)) return "image/heic"
  if (/\.pdf$/i.test(file.name)) return "application/pdf"
  return ""
}

function FilesAnswer(props: AnswerProps) {
  const { token, request: r } = props
  const o = r.options
  const accept = o.accept ?? "any"
  const allowed = ACCEPT_MIME[accept]
  const max = o.max_files ?? MAX_FILES
  const min = o.min_files ?? 1
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [removing, startRemove] = useTransition()
  const { pending, error, respond } = useRespond(props)

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return
    setUploadError(null)
    const room = max - r.files.length
    const files = Array.from(list)
    const problems: string[] = []
    const ok = files.filter((f) => {
      const mime = guessMime(f)
      if (!allowed.includes(mime)) {
        problems.push(
          `${f.name} isn't ${accept === "pdf" ? "a PDF" : accept === "images" ? "a photo" : "a photo or PDF"}.`,
        )
        return false
      }
      if (f.size > MAX_FILE_BYTES) {
        problems.push(`${f.name} is over 10 MB.`)
        return false
      }
      return true
    })
    if (ok.length > room) {
      problems.push(
        room > 0
          ? `Only ${room} more ${room === 1 ? "file fits" : "files fit"}.`
          : "That's the most files this takes.",
      )
      ok.splice(room)
    }

    const supabase = createSupabasePublicClient()
    setUploading({ done: 0, total: ok.length })
    for (const [i, file] of ok.entries()) {
      const path = `${r.id}/${crypto.randomUUID()}-${safeName(file.name)}`
      const mime = guessMime(file)
      const { error: storageError } = await supabase.storage
        .from("client-uploads")
        .upload(path, file, { contentType: mime, upsert: false })
      if (storageError) {
        problems.push(`${file.name} didn't upload. Try again.`)
      } else {
        const result = await attachPortalFile({
          token,
          requestId: r.id,
          path,
          name: file.name.slice(0, 200),
          mime,
          size: file.size,
        })
        if (!result.ok) problems.push(result.error)
      }
      setUploading({ done: i + 1, total: ok.length })
    }
    setUploading(null)
    if (inputRef.current) inputRef.current.value = ""
    if (cameraRef.current) cameraRef.current.value = ""
    if (problems.length) setUploadError(problems.join(" "))
  }

  const acceptAttr =
    accept === "pdf"
      ? "application/pdf"
      : accept === "images"
        ? "image/*"
        : "image/*,application/pdf"
  const busy = Boolean(uploading) || pending

  return (
    <div className="flex flex-col gap-3">
      {r.files.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {r.files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{f.name}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${f.name}`}
                disabled={busy || removing}
                onClick={() =>
                  startRemove(async () => {
                    const result = await removePortalFile(token, f.id)
                    if (!result.ok) setUploadError(result.error)
                  })
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptAttr}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => upload(e.target.files)}
      />
      {accept !== "pdf" && (
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => upload(e.target.files)}
        />
      )}

      {r.files.length < max && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
            {uploading
              ? `Uploading ${uploading.done + 1 > uploading.total ? uploading.total : uploading.done + 1} of ${uploading.total}…`
              : accept === "pdf"
                ? "Add PDF files"
                : accept === "images"
                  ? "Add photos"
                  : "Add files"}
          </Button>
          {accept !== "pdf" && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11 sm:hidden"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera />
              Take a photo
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {accept === "pdf" ? "PDF" : accept === "images" ? "Photos" : "Photos or PDF"}, up to 10 MB
        each.
      </p>

      <ErrorText error={uploadError ?? error} />

      {r.files.length > 0 && (
        <Button
          size="lg"
          className="h-11 w-full sm:w-fit"
          disabled={busy || r.files.length < min}
          onClick={() => respond("")}
        >
          {pending
            ? "Sending…"
            : r.files.length < min
              ? `Add ${min - r.files.length} more to send`
              : `Send ${r.files.length} ${r.files.length === 1 ? "file" : "files"}`}
        </Button>
      )}
    </div>
  )
}
