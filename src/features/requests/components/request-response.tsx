"use client"

import { Check, Copy, Download, Eye, EyeOff, FileText } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DECISION_LABELS, formatBytes, type RequestDecision, type RequestKind } from "../constants"
import type { RequestFile } from "../queries"

/** What the client sent: text, a masked code, a decision, or files. */
export function RequestResponse({
  kind,
  responseText,
  decision,
  files,
  compact = false,
}: {
  kind: RequestKind
  responseText: string | null
  decision: RequestDecision | null
  files: RequestFile[]
  compact?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      {kind === "approval" && decision && (
        <span
          className={cn(
            "inline-flex h-6 w-fit items-center rounded-md px-2 text-xs font-medium",
            decision === "approved"
              ? "bg-success-soft text-success"
              : "bg-warning-soft text-warning",
          )}
        >
          {DECISION_LABELS[decision]}
        </span>
      )}
      {kind === "code" && responseText ? (
        <MaskedCode code={responseText} />
      ) : (
        responseText && (
          <p
            className={cn(
              "rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-line",
              compact && "line-clamp-3",
            )}
          >
            {responseText}
          </p>
        )
      )}
      {kind === "action" && !responseText && (
        <p className="text-sm">The client says this is done.</p>
      )}
      {files.length > 0 && <FileGrid files={files} compact={compact} />}
    </div>
  )
}

function MaskedCode({ code }: { code: string }) {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="rounded-md border bg-muted/40 px-3 py-1.5 font-mono text-base tracking-widest tabular-nums"
        aria-label={shown ? `Code ${code}` : "Code hidden"}
      >
        {shown ? code : "•".repeat(Math.min(Math.max(code.length, 4), 12))}
      </span>
      <Button variant="outline" size="sm" type="button" onClick={() => setShown((s) => !s)}>
        {shown ? <EyeOff /> : <Eye />}
        {shown ? "Hide" : "Show"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
          } catch {
            setShown(true)
          }
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}

function FileGrid({ files, compact }: { files: RequestFile[]; compact: boolean }) {
  return (
    <ul
      className={cn(
        "grid gap-2",
        compact ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-4",
      )}
    >
      {files.map((f) =>
        f.isImage && f.url ? (
          <li key={f.id} className="group relative">
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="block aspect-square overflow-hidden rounded-md border bg-muted"
              title={f.name}
            >
              {/* Signed, short-lived URLs from private storage: next/image can't cache them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.name} loading="lazy" className="size-full object-cover" />
            </a>
            {!compact && f.downloadUrl && (
              <a
                href={f.downloadUrl}
                aria-label={`Download ${f.name}`}
                className="absolute right-1 bottom-1 grid size-7 place-items-center rounded-md border bg-background/90 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Download className="size-3.5" />
              </a>
            )}
          </li>
        ) : (
          <li key={f.id} className={cn(compact ? "col-span-2" : "col-span-3 sm:col-span-2")}>
            <a
              href={f.downloadUrl ?? undefined}
              className="flex h-full min-h-12 items-center gap-2 rounded-md border px-2.5 py-2 text-sm hover:bg-muted"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
              </span>
            </a>
          </li>
        ),
      )}
    </ul>
  )
}
