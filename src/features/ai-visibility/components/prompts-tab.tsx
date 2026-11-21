"use client"

import { Archive, ArchiveRestore, Check, Loader2, Plus, Sparkles, Tag, Trash2, X } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { addPrompts, reviewSuggestion, suggestPromptsNow, updatePrompts } from "../actions"
import { INTENT_LABEL, PROMPT_MAX, type AivIntent } from "../config"
import type { AivPrompt, AivSuggestion, AivTopic, PromptStats } from "../queries"
import { pct } from "./bits"

type SortKey = "created" | "visibility" | "position" | "volume"

export function PromptsTab({
  clientId,
  prompts,
  topics,
  stats,
  suggestions,
  countries,
  cap,
  canManage,
}: {
  clientId: string
  prompts: AivPrompt[]
  topics: AivTopic[]
  stats: Record<string, PromptStats>
  suggestions: AivSuggestion[]
  countries: string[]
  cap: number
  canManage: boolean
}) {
  const [show, setShow] = useState<"active" | "archived">("active")
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<SortKey>("created")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<"one" | "paste" | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tagInput, setTagInput] = useState("")
  const [pending, start] = useTransition()
  const topicName = new Map(topics.map((t) => [t.id, t.name]))
  const active = prompts.filter((p) => p.status === "active").length

  const rows = useMemo(() => {
    const list = prompts.filter((p) => p.status === show && (!q || p.text.toLowerCase().includes(q.toLowerCase())))
    const s = (p: AivPrompt) => stats[p.id]
    return [...list].sort((a, b) => {
      if (sort === "visibility") return (s(b)?.visibility ?? -1) - (s(a)?.visibility ?? -1)
      if (sort === "position") return (s(a)?.position ?? 99) - (s(b)?.position ?? 99)
      if (sort === "volume") return (b.volume ?? 0) - (a.volume ?? 0)
      return a.createdAt.localeCompare(b.createdAt)
    })
  }, [prompts, show, q, sort, stats])

  const ids = [...selected].filter((id) => rows.some((r) => r.id === id))
  const promptSuggestions = suggestions.filter((s) => s.kind === "prompt")

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) return void toast.error(r.error ?? "Something went wrong.")
      if (done) toast.success(done)
      setSelected(new Set())
    })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-card p-0.5" role="group" aria-label="Show">
            {(["active", "archived"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={show === s}
                onClick={() => setShow(s)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-xs transition-colors",
                  show === s ? "bg-foreground text-background dark:bg-muted dark:text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {s === "active" ? `Tracked · ${active}` : `Archived · ${prompts.length - active}`}
              </button>
            ))}
          </div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions" className="h-8 w-56" aria-label="Search questions" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort"
            className="h-8 rounded-md border bg-card px-2 text-sm"
          >
            <option value="created">Oldest first</option>
            <option value="visibility">Highest visibility</option>
            <option value="position">Best position</option>
            <option value="volume">Most asked</option>
          </select>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(async () => {
                const r = await suggestPromptsNow(clientId, 20)
                if (r.ok) toast.success(r.data.added ? `${r.data.added} new ideas below` : "No new ideas this time")
                return r
              })}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Suggest questions
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAdding("paste")}>Paste many</Button>
            <Button size="sm" onClick={() => setAdding("one")}>
              <Plus /> Add question
            </Button>
          </div>
        )}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground tabular-nums">
        {active} of {cap} questions tracked. Each is asked on every platform in every check.
      </p>

      {promptSuggestions.length > 0 && canManage && (
        <details open className="rounded-lg border bg-card">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
            <Sparkles className="size-4 text-brand" aria-hidden /> Ideas from Shockwave AI · {promptSuggestions.length} new
          </summary>
          <ul className="divide-y border-t">
            {promptSuggestions.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm">{String(s.payload.text ?? "")}</p>
                  <p className="text-xs text-muted-foreground">
                    {[s.payload.topic, s.payload.intent ? INTENT_LABEL[s.payload.intent as AivIntent] : null, s.reason].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="xs" disabled={pending} onClick={() => run(() => reviewSuggestion(s.id, true), "Question added")}>
                    <Check /> Track
                  </Button>
                  <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => reviewSuggestion(s.id, false))}>
                    <X /> Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {ids.length > 0 && canManage && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-popover p-2 shadow-sm">
          <span className="px-1 text-sm tabular-nums">{ids.length} selected</span>
          <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="tag" className="h-8 w-28" aria-label="Tag" />
          <Button size="sm" variant="outline" disabled={!tagInput.trim() || pending} onClick={() => run(() => updatePrompts(ids, { tagsAdd: [tagInput.trim()] }), "Tag added")}>
            <Tag /> Add tag
          </Button>
          <Button size="sm" variant="outline" disabled={!tagInput.trim() || pending} onClick={() => run(() => updatePrompts(ids, { tagsRemove: [tagInput.trim()] }), "Tag removed")}>
            Remove tag
          </Button>
          {topics.length > 0 && (
            <select
              aria-label="Set topic"
              className="h-8 rounded-md border bg-card px-2 text-sm"
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value
                if (!v) return
                run(() => updatePrompts(ids, { topicId: v === "none" ? null : v }), "Topic set")
                e.target.value = ""
              }}
            >
              <option value="">Set topic…</option>
              <option value="none">No topic</option>
              {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {show === "active" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updatePrompts(ids, { status: "archived" }), "Archived. Their answers stay in the history.")}>
              <Archive /> Archive
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updatePrompts(ids, { status: "active" }), "Tracked again")}>
              <ArchiveRestore /> Track again
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Delete
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {show === "active"
            ? "No questions yet. Add the questions a buyer would ask ChatGPT or Gemini, or let Shockwave AI suggest some."
            : "Nothing archived."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {canManage && (
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      aria-label="Select all"
                      checked={ids.length > 0 && ids.length === rows.length}
                      onCheckedChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())}
                    />
                  </th>
                )}
                <th className="px-3 py-2 text-left font-medium">Question</th>
                <th className="hidden px-3 py-2 text-left font-medium md:table-cell">Topic and tags</th>
                <th className="hidden px-3 py-2 text-left font-medium lg:table-cell">Intent</th>
                <th className="px-3 py-2 text-right font-medium" title="How often people ask about this, 1–5">Volume</th>
                <th className="px-3 py-2 text-right font-medium">Visibility</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Position</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((p) => {
                const s = stats[p.id]
                return (
                  <tr key={p.id} className={cn(selected.has(p.id) && "bg-brand-soft/50")}>
                    {canManage && (
                      <td className="px-3 py-2 align-top">
                        <Checkbox
                          aria-label={`Select ${p.text}`}
                          checked={selected.has(p.id)}
                          onCheckedChange={(c) => {
                            const n = new Set(selected)
                            if (c) n.add(p.id)
                            else n.delete(p.id)
                            setSelected(n)
                          }}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 align-top">
                      <p>{p.text}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.country}
                        {p.branded && " · names the client"}
                        {p.source === "suggested" && " · suggested"}
                      </p>
                    </td>
                    <td className="hidden px-3 py-2 align-top md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {p.topicId && <span className="rounded-sm bg-brand-soft px-1.5 py-0.5 text-xs text-brand">{topicName.get(p.topicId)}</span>}
                        {p.tags.map((t) => <span key={t} className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">{t}</span>)}
                      </div>
                    </td>
                    <td className="hidden px-3 py-2 align-top text-xs text-muted-foreground lg:table-cell">{p.intent ? INTENT_LABEL[p.intent] : "–"}</td>
                    <td className="px-3 py-2 text-right align-top">
                      <span className="inline-flex gap-0.5" aria-label={p.volume ? `Volume ${p.volume} of 5` : "Volume unknown"}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <span key={i} aria-hidden className={cn("size-1.5 rounded-full", p.volume && i <= p.volume ? "bg-primary" : "bg-muted")} />
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right align-top tabular-nums">{s ? pct(s.visibility) : <span className="text-xs text-muted-foreground">Not checked</span>}</td>
                    <td className="hidden px-3 py-2 text-right align-top tabular-nums sm:table-cell">{s?.position ? `#${s.position.toFixed(1)}` : "–"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddDialog clientId={clientId} mode={adding} onClose={() => setAdding(null)} countries={countries} topics={topics} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {ids.length} {ids.length === 1 ? "question" : "questions"}?</AlertDialogTitle>
            <AlertDialogDescription>Their answers are deleted too, and the history charts lose them. Archive keeps the history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run(() => updatePrompts(ids, { delete: true }), "Deleted")}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function AddDialog({
  clientId,
  mode,
  onClose,
  countries,
  topics,
}: {
  clientId: string
  mode: "one" | "paste" | null
  onClose: () => void
  countries: string[]
  topics: AivTopic[]
}) {
  const [text, setText] = useState("")
  const [country, setCountry] = useState(countries[0] ?? "US")
  const [topic, setTopic] = useState("")
  const [tags, setTags] = useState("")
  const [pending, start] = useTransition()
  const lines = mode === "paste" ? text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : text.trim() ? [text.trim()] : []
  const tooLong = lines.some((l) => l.length > PROMPT_MAX)

  function save() {
    start(async () => {
      const r = await addPrompts(
        clientId,
        lines.map((l) => ({ text: l, country, topic: topic || undefined, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) })),
        mode === "paste" ? "import" : "team",
      )
      if (!r.ok) return void toast.error(r.error)
      toast.success(`${r.data.added} added${r.data.skipped ? ` · ${r.data.skipped} already tracked or too short` : ""}`)
      setText("")
      onClose()
    })
  }

  return (
    <Dialog open={mode !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "paste" ? "Paste questions" : "Add a question"}</DialogTitle>
          <DialogDescription>
            Write it the way a buyer would ask ChatGPT, not as a keyword. For example: “Which web design agency in Scottsdale is best for a small law firm?”
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {mode === "paste" ? (
            <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="One question per line (up to 50)" aria-label="Questions" />
          ) : (
            <Textarea rows={3} value={text} maxLength={PROMPT_MAX} onChange={(e) => setText(e.target.value)} aria-label="Question" />
          )}
          {tooLong && <p className="text-xs text-danger">Keep each question under {PROMPT_MAX} characters.</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Country
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="h-9 rounded-md border bg-card px-2 text-sm text-foreground">
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Topic
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} list="aiv-topics" placeholder="Optional" />
              <datalist id="aiv-topics">{topics.map((t) => <option key={t.id} value={t.name} />)}</datalist>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Tags
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!lines.length || tooLong || pending} onClick={save}>
            {pending && <Loader2 className="animate-spin" />} Add {lines.length > 1 ? `${lines.length} questions` : "question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
