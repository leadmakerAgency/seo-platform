"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** A read-only link with a Copy button (falls back to selecting the text). */
export function CopyLink({ link, label = "Invite link" }: { link: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy(input: HTMLInputElement | null) {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      input?.select()
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        id="invite-link"
        aria-label={label}
        value={link}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        className="font-mono text-xs"
      />
      <Button
        type="button"
        variant="outline"
        onClick={(e) => copy(e.currentTarget.parentElement?.querySelector("input") ?? null)}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}
