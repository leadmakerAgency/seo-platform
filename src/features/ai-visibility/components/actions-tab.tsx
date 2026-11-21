"use client"

import { Check, Loader2, Plus, RotateCcw, X } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { addAction, updateAction } from "../actions"
import { ACTION_GROUP_META, ACTION_GROUPS, MODEL_META, type ActionGroup, type AivModel } from "../config"
import type { AivAction } from "../queries"
import { SendToBacklinks } from "./send-to-backlinks"

const STATUS_LABEL: Record<AivAction["status"], string> = { new: "New", in_progress: "In progress", done: "Done", declined: "Declined" }
const IMPACT_TONE = { high: "brand", medium: "info", low: "neutral" } as const

export function ActionsTab({ clientId, actions, canWork }: { clientId: string; actions: AivAction[]; canWork: boolean }) {
  const [group, setGroup] = useState<ActionGroup | "all">("all")
  const [status, setStatus] = useState<"open" | "done" | "declined">("open")
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [pending, start] = useTransition()

  const inStatus = (a: AivAction) => (status === "open" ? a.status === "new" || a.status === "in_progress" : a.status === status)
  const list = actions.filter((a) => inStatus(a) && (group === "all" || a.group === group))
  const count = (g: ActionGroup) => actions.filter((a) => a.group === g && (a.status === "new" || a.status === "in_progress")).length

  const set = (id: string, s: AivAction["status"], msg?: string) =>
    start(async () => {
      const r = await updateAction(id, { status: s })
      if (!r.ok) return void toast.error(r.error)
      if (msg) toast.success(msg)
    })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ACTION_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={group === g}
            onClick={() => setGroup(group === g ? "all" : g)}
            disabled={g === "claims"}
            className={cn(
              "flex flex-col gap-1 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60",
              group === g && "border-primary/50 bg-brand-soft",
            )}
          >
            <span className="text-sm font-medium">{ACTION_GROUP_META[g].label}</span>
            <span className="text-xs text-muted-foreground">{ACTION_GROUP_META[g].note}</span>
            <span className="font-heading text-xl font-semibold tabular-nums">{g === "claims" ? "Later" : count(g)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border bg-card p-0.5" role="group" aria-label="Status">
          {(["open", "done", "declined"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={cn("h-7 rounded-md px-2.5 text-xs", status === s ? "bg-foreground text-background dark:bg-muted dark:text-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {s === "open" ? "To do" : s === "done" ? "Done" : "Declined"}
            </button>
          ))}
        </div>
        {canWork && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Add your own
          </Button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {status === "open" ? "No open actions. New ones come with every check, from the sites AI relies on and the client's own pages." : "Nothing here yet."}
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {list.map((a) => {
            const ev = a.evidence as { answers?: number; competitors?: string[]; models?: string[]; prompts?: string[]; urls?: string[] }
            const expanded = open === a.id
            return (
              <li key={a.id} className="flex flex-col gap-2 px-4 py-3">
                <button type="button" className="flex flex-col gap-1 text-left" onClick={() => setOpen(expanded ? null : a.id)} aria-expanded={expanded}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{a.title}</span>
                    <StatusTag tone={IMPACT_TONE[a.impact]} dot={false}>{a.impact === "high" ? "High impact" : a.impact === "medium" ? "Medium impact" : "Low impact"}</StatusTag>
                    <span className="text-xs text-muted-foreground">{ACTION_GROUP_META[a.group].label} · {STATUS_LABEL[a.status]}{a.source === "team" ? " · added by the team" : ""}</span>
                  </span>
                  {a.domain && <span className="text-xs text-muted-foreground">{a.domain}</span>}
                </button>
                {expanded && (
                  <div className="flex flex-col gap-3 rounded-md bg-muted/30 p-3 text-sm">
                    {a.detail && <p className="whitespace-pre-line">{a.detail}</p>}
                    {(ev.answers || ev.competitors?.length) && (
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Why this matters</span>
                        {ev.answers ? <span>Used in {ev.answers} answers{ev.competitors?.length ? ` that name ${ev.competitors.join(", ")}` : ""}.</span> : null}
                        {ev.models?.length ? <span>Platforms: {ev.models.map((m) => MODEL_META[m as AivModel]?.label ?? m).join(", ")}</span> : null}
                        {ev.prompts?.slice(0, 3).map((p) => <span key={p}>“{p}”</span>)}
                      </div>
                    )}
                    {a.url && <a href={a.url} target="_blank" rel="nofollow noopener noreferrer" className="w-fit truncate text-xs text-brand hover:underline">{a.url}</a>}
                  </div>
                )}
                {canWork && (
                  <div className="flex flex-wrap gap-1">
                    {a.status === "new" && (
                      <Button size="xs" variant="outline" disabled={pending} onClick={() => set(a.id, "in_progress")}>Start</Button>
                    )}
                    {(a.status === "new" || a.status === "in_progress") && (
                      <>
                        <Button size="xs" disabled={pending} onClick={() => set(a.id, "done", "Done. Counts as an AI visibility fix this month.")}>
                          {pending ? <Loader2 className="animate-spin" /> : <Check />} Mark done
                        </Button>
                        <Button size="xs" variant="ghost" disabled={pending} onClick={() => set(a.id, "declined")}>
                          <X /> Decline
                        </Button>
                      </>
                    )}
                    {(a.status === "done" || a.status === "declined") && (
                      <Button size="xs" variant="ghost" disabled={pending} onClick={() => set(a.id, "new")}>
                        <RotateCcw /> Reopen
                      </Button>
                    )}
                    {a.group === "earned" && a.domain && (
                      <SendToBacklinks
                        clientId={clientId}
                        canWork={canWork}
                        inBacklinks={Boolean(a.opportunityId)}
                        site={{ domain: a.domain, url: a.url, type: "editorial", answers: ev.answers ?? 0, competitors: ev.competitors ?? [], models: ev.models ?? [], actionId: a.id }}
                      />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <AddActionDialog clientId={clientId} open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function AddActionDialog({ clientId, open, onClose }: { clientId: string; open: boolean; onClose: () => void }) {
  const [group, setGroup] = useState<"site" | "own_pages" | "earned">("earned")
  const [title, setTitle] = useState("")
  const [detail, setDetail] = useState("")
  const [url, setUrl] = useState("")
  const [pending, start] = useTransition()
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an action</DialogTitle>
          <DialogDescription>Something the team will do to make AI platforms name the client more.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Kind
            <select value={group} onChange={(e) => setGroup(e.target.value as typeof group)} className="h-9 rounded-md border bg-card px-2">
              <option value="earned">{ACTION_GROUP_META.earned.label}</option>
              <option value="own_pages">{ACTION_GROUP_META.own_pages.label}</option>
              <option value="site">{ACTION_GROUP_META.site.label}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Title
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            What to do
            <Textarea rows={4} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={1200} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Link <span className="text-xs text-muted-foreground">optional</span>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!title.trim() || pending}
            onClick={() =>
              start(async () => {
                const r = await addAction(clientId, { group, title, detail, url: url.trim() || undefined })
                if (!r.ok) return void toast.error(r.error)
                setTitle("")
                setDetail("")
                setUrl("")
                onClose()
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
