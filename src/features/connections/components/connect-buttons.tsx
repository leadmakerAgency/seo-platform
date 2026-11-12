"use client"

import { Check, Copy, Link2, Loader2, MessageSquareText, Plug } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { createClientLink, startConnect } from "../actions"
import { PLATFORM_META, type SocialPlatform } from "../constants"

/** "Connect": opens Zernio's hosted sign-in in this tab. */
export function ConnectButton({
  clientId,
  platform,
  reconnectAccountId,
  label,
  variant = "default",
  size = "sm",
  disabled,
  className,
}: {
  clientId: string
  platform: SocialPlatform
  reconnectAccountId?: string
  label?: string
  variant?: "default" | "outline" | "ghost"
  size?: "sm" | "default"
  disabled?: boolean
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startConnect(clientId, platform, reconnectAccountId)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          window.location.assign(result.data.url)
          // Keep the spinner while the browser leaves the page.
          await new Promise(() => {})
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Plug />}
      {pending ? "Opening sign-in…" : (label ?? "Connect")}
    </Button>
  )
}

/** "Send the client a link": a single-use connect link for the client. */
export function ClientLinkButton({
  clientId,
  platform,
  reconnectAccountId,
  label = "Send the client a link",
  variant = "outline",
  disabled,
  className,
}: {
  clientId: string
  platform: SocialPlatform
  reconnectAccountId?: string
  label?: string
  variant?: "outline" | "ghost"
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [link, setLink] = useState<{ url: string; expiresAt: string; message: string } | null>(null)

  function create() {
    startTransition(async () => {
      const result = await createClientLink(clientId, platform, reconnectAccountId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setLink(result.data)
      setOpen(true)
    })
  }

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        className={className}
        disabled={disabled || pending}
        onClick={create}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Link2 />}
        {pending ? "Making link…" : label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Link for the client: {PLATFORM_META[platform].label}</DialogTitle>
            <DialogDescription>
              The client opens it, signs in to {PLATFORM_META[platform].label} and the account
              appears here. It works once and expires{" "}
              {link ? formatDate(link.expiresAt) : "in 7 days"}.
            </DialogDescription>
          </DialogHeader>
          {link && (
            <div className="flex flex-col gap-3">
              <Input
                readOnly
                value={link.url}
                aria-label="Client connect link"
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <CopyButton text={link.url} label="Copy link" />
                <CopyButton text={link.message} label="Copy message" icon="message" />
              </div>
              <p className="text-xs text-muted-foreground">
                Anyone with this link can connect an account to this client, so send it only to
                them. It also shows under “Waiting on the client” until it&apos;s used.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function CopyButton({
  text,
  label,
  icon = "copy",
  size = "sm",
  className,
}: {
  text: string
  label: string
  icon?: "copy" | "message"
  size?: "sm" | "default"
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const Icon = copied ? Check : icon === "message" ? MessageSquareText : Copy
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={cn(className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        } catch {
          toast.error("Couldn't copy. Your browser blocked the clipboard.")
        }
      }}
    >
      <Icon />
      {copied ? "Copied" : label}
    </Button>
  )
}
