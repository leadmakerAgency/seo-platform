"use client"

import { ArrowRight, Check, Loader2 } from "@/components/icons"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { sendToBacklinks } from "../actions"

export function SendToBacklinks({
  clientId,
  site,
  inBacklinks,
  canWork,
}: {
  clientId: string
  site: { domain: string; url: string | null; type: string; answers: number; competitors: string[]; models: string[]; actionId?: string | null }
  inBacklinks: boolean
  canWork: boolean
}) {
  const [sent, setSent] = useState(inBacklinks)
  const [pending, start] = useTransition()
  if (sent) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="size-3.5" aria-hidden /> In Backlinks
      </span>
    )
  }
  if (!canWork) return null
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await sendToBacklinks(clientId, site)
          if (!r.ok) return void toast.error(r.error)
          setSent(true)
          toast.success(r.data.existed ? "Already in Backlinks for this client" : "Sent to Backlinks · Standard Search Review")
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />} Send to Backlinks
    </Button>
  )
}
