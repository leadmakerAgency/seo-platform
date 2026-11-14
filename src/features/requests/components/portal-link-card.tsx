"use client"

import { Check, Copy, ExternalLink, Link2, MessageSquareText, RefreshCw } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatRelative } from "@/lib/format"
import { createPortalLink } from "../actions"

/** The client's private link: copy it, copy a ready-to-send message, or replace it. */
export function PortalLinkCard({
  clientId,
  clientName,
  portalUrl,
  lastOpenedAt,
  nowIso,
  canReplace,
  openTitles,
  senderName,
}: {
  clientId: string
  clientName: string
  portalUrl: string | null
  lastOpenedAt: string | null
  nowIso: string
  canReplace: boolean
  openTitles: string[]
  senderName: string
}) {
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState(false)
  const [copied, setCopied] = useState<"link" | "message" | null>(null)

  function makeLink(success: string) {
    startTransition(async () => {
      const result = await createPortalLink(clientId)
      if (!result.ok) toast.error(result.error)
      else toast.success(success)
    })
  }

  async function copy(kind: "link" | "message") {
    if (!portalUrl) return
    const text = kind === "link" ? portalUrl : message(portalUrl, openTitles, senderName)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error("Couldn't copy. Your browser blocked the clipboard.")
    }
  }

  if (!portalUrl) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">No client link yet</p>
            <p className="text-sm text-muted-foreground">
              {canReplace
                ? `Turn it on to give ${clientName} one private page with everything we need from them. No password needed.`
                : "An account manager can turn on this client's private link."}
            </p>
          </div>
        </div>
        {canReplace && (
          <Button
            className="shrink-0"
            disabled={pending}
            onClick={() => makeLink("Client link turned on")}
          >
            {pending ? "Turning on…" : "Turn on client link"}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">Client link</p>
        <p className="text-sm text-muted-foreground">
          {clientName} answers here, no password needed. Anyone with the link can answer, so send it
          only to the client.
        </p>
      </div>
      <div className="flex flex-col gap-2 lg:flex-row">
        <Input
          aria-label="Client link"
          value={portalUrl}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => copy("link")}>
            {copied === "link" ? <Check /> : <Copy />}
            {copied === "link" ? "Copied" : "Copy link"}
          </Button>
          <Button variant="outline" onClick={() => copy("message")}>
            {copied === "message" ? <Check /> : <MessageSquareText />}
            {copied === "message" ? "Copied" : "Copy message"}
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Open the client's page">
            <a href={portalUrl} target="_blank" rel="noreferrer">
              <ExternalLink />
            </a>
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {lastOpenedAt
            ? `Last opened by the client ${formatRelative(lastOpenedAt, new Date(nowIso))}`
            : "The client hasn't opened it yet"}
        </span>
        {canReplace && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-muted-foreground"
            onClick={() => setConfirm(true)}
          >
            <RefreshCw />
            New link
          </Button>
        )}
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace {clientName}&apos;s link?</AlertDialogTitle>
            <AlertDialogDescription>
              The current link stops working straight away. Use this if the link was sent to the
              wrong person. Send the client the new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => makeLink("New link created. The old one is off.")}>
              Replace link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function message(url: string, titles: string[], sender: string) {
  const intro =
    titles.length === 0
      ? "Here's your private LeadMaker page. Anything we need from you will show up there:"
      : `Here's your private LeadMaker page. We need ${titles.length === 1 ? "one thing" : `${titles.length} things`} from you:`
  const list = titles
    .slice(0, 8)
    .map((t) => `• ${t}`)
    .join("\n")
  const more = titles.length > 8 ? `\n• and ${titles.length - 8} more` : ""
  return [
    "Hi!",
    "",
    intro,
    ...(list ? [list + more, ""] : []),
    titles.length ? `It only takes a few minutes: ${url}` : url,
    "",
    `Thanks, ${sender}`,
  ].join("\n")
}
