"use client"

import { useRouter } from "next/navigation"
import type { ReactNode } from "react"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

/** A side sheet driven by ?sheet= in the URL; the body is rendered on the server. */
export function UrlSheet({ open, closeHref, title, description, children }: { open: boolean; closeHref: string; title: string; description?: string; children: ReactNode }) {
  const router = useRouter()
  return (
    <Sheet open={open} onOpenChange={(o) => !o && router.replace(closeHref, { scroll: false })}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="text-base leading-snug">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex flex-col gap-5 p-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
