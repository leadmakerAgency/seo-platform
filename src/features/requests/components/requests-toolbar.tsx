"use client"

import { Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { MemberOption } from "@/features/tasks/queries"
import { cn } from "@/lib/utils"
import { KIND_META, REQUEST_KINDS, type RequestKind } from "../constants"
import { requestsHref, type RequestParams } from "../search-params"

const ALL = "all"

/** Search plus type and follow-up owner filters for the agency-wide list. */
export function RequestsToolbar({
  params,
  basePath,
  members,
}: {
  params: RequestParams
  basePath: string
  members: MemberOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [q, setQ] = useState(params.q ?? "")

  function go(patch: Partial<RequestParams>) {
    startTransition(() =>
      router.replace(requestsHref(basePath, params, { ...patch, request: undefined }), {
        scroll: false,
      }),
    )
  }

  // Debounced search, kept in the URL.
  useEffect(() => {
    if ((params.q ?? "") === q.trim()) return
    const timer = window.setTimeout(() => go({ q: q.trim() || undefined }), 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const filtered = Boolean(params.q || params.kind || params.owner || params.show)

  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-80")}>
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search requests or clients"
          aria-label="Search requests or clients"
          className="pl-8"
        />
      </div>
      <Select
        value={params.kind ?? ALL}
        onValueChange={(v) => go({ kind: v === ALL ? undefined : (v as RequestKind) })}
      >
        <SelectTrigger className="w-[150px]" aria-label="Type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          {REQUEST_KINDS.map((k) => (
            <SelectItem key={k} value={k}>
              {KIND_META[k].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={params.owner ?? ALL}
        onValueChange={(v) => go({ owner: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-[180px]" aria-label="Follow-up owner">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Anyone following up</SelectItem>
          <SelectItem value="none">Nobody</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {filtered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("")
            go({ q: undefined, kind: undefined, owner: undefined, show: undefined })
          }}
        >
          <X />
          Clear filters
        </Button>
      )}
    </div>
  )
}
