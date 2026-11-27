"use client"

import { ChevronDown, Download, Loader2 } from "@/components/icons"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { downloadText } from "@/lib/download"
import { formatNumber } from "@/lib/format"

/** Builds a list's CSV: from loaded rows (string) or by a server action (promise). */
export type CsvSource = {
  count: number
  /** From csvFileName (src/lib/csv.ts). */
  fileName: string
  get: () => string | Promise<{ ok: true; data: { csv: string; count: number } } | { ok: false; error: string }>
}

/**
 * Rankings → Download CSV. One click downloads everything; while a filter or search is on, a
 * menu offers the keywords shown or all of them.
 */
export function DownloadCsv({ all, shown, filtered }: { all: CsvSource; shown?: CsvSource; filtered: boolean }) {
  const [pending, start] = useTransition()

  const run = (src: CsvSource) =>
    start(async () => {
      const r = await src.get()
      if (typeof r === "string") {
        downloadText(src.fileName, r)
        toast.success(`Downloaded ${formatNumber(src.count)} ${src.count === 1 ? "keyword" : "keywords"}`)
        return
      }
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      downloadText(src.fileName, r.data.csv)
      toast.success(`Downloaded ${formatNumber(r.data.count)} ${r.data.count === 1 ? "keyword" : "keywords"}`)
    })

  const icon = pending ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />
  const label = (
    <>
      {icon}
      <span className="hidden sm:inline">Download CSV</span>
      <span className="sm:hidden">CSV</span>
    </>
  )

  if (!filtered || !shown) {
    return (
      <Button variant="outline" size="sm" disabled={pending || all.count === 0} onClick={() => run(all)}>
        {label}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending || all.count === 0}>
          {label}
          <ChevronDown className="size-3.5 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={shown.count === 0} onSelect={() => run(shown)}>
          Shown keywords ({formatNumber(shown.count)})
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run(all)}>All keywords ({formatNumber(all.count)})</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
