"use client"

import { Check, Loader2, Pencil, Plus, Trash2, X } from "@/components/icons"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { saveTopic } from "../actions"
import type { AivTopic } from "../queries"

/** Topics group questions (one topic per question). Deleting a topic keeps its questions, without a topic. */
export function TopicsEditor({ clientId, topics, counts, canManage }: { clientId: string; topics: AivTopic[]; counts: Record<string, number>; canManage: boolean }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [adding, setAdding] = useState("")
  const [pending, start] = useTransition()
  const run = (v: { id?: string; name?: string; delete?: boolean }, done: () => void) =>
    start(async () => {
      const r = await saveTopic(clientId, v)
      if (!r.ok) return void toast.error(r.error)
      done()
    })

  return (
    <div className="flex flex-col gap-3">
      {topics.length === 0 ? (
        <p className="text-sm text-muted-foreground">No topics yet. They&apos;re created when you add questions with a topic, or here.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {topics.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              {editing === t.id ? (
                <span className="flex flex-1 items-center gap-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-8" aria-label="Topic name" autoFocus />
                  <Button size="icon-sm" variant="ghost" aria-label="Save" disabled={!name.trim() || pending} onClick={() => run({ id: t.id, name }, () => setEditing(null))}>
                    {pending ? <Loader2 className="animate-spin" /> : <Check />}
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}>
                    <X />
                  </Button>
                </span>
              ) : (
                <>
                  <span>
                    {t.name} <span className="text-xs text-muted-foreground tabular-nums">· {counts[t.id] ?? 0} questions</span>
                  </span>
                  {canManage && (
                    <span className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Rename ${t.name}`} onClick={() => { setEditing(t.id); setName(t.name) }}>
                        <Pencil />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete ${t.name}`} disabled={pending} onClick={() => run({ id: t.id, delete: true }, () => toast.success("Topic deleted; its questions stay"))}>
                        <Trash2 />
                      </Button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="flex gap-2">
          <Input value={adding} onChange={(e) => setAdding(e.target.value)} maxLength={60} placeholder="New topic" className="h-9 max-w-xs" aria-label="New topic" />
          <Button variant="outline" disabled={!adding.trim() || pending} onClick={() => run({ name: adding }, () => setAdding(""))}>
            <Plus /> Add topic
          </Button>
        </div>
      )}
    </div>
  )
}
