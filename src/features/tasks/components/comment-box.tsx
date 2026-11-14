"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { initials } from "@/lib/format"
import { cn } from "@/lib/utils"
import { addComment } from "../actions"
import type { MemberOption } from "../queries"

/** Comment input. Typing "@" suggests teammates; mentioned people get notified. */
export function CommentBox({ taskId, members }: { taskId: string; members: MemberOption[] }) {
  const [body, setBody] = useState("")
  const [mentions, setMentions] = useState<Map<string, string>>(new Map())
  const [query, setQuery] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [pending, startTransition] = useTransition()
  const textarea = useRef<HTMLTextAreaElement>(null)

  const suggestions =
    query === null
      ? []
      : members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)

  function updateQuery(value: string, caret: number) {
    const match = value.slice(0, caret).match(/(?:^|\s)@([\p{L}\p{N}.'-]{0,30})$/u)
    setQuery(match ? match[1] : null)
    setHighlight(0)
  }

  function insertMention(member: MemberOption) {
    const el = textarea.current
    const caret = el?.selectionStart ?? body.length
    const before = body.slice(0, caret).replace(/@([\p{L}\p{N}.'-]{0,30})$/u, `@${member.name} `)
    const next = before + body.slice(caret)
    setBody(next)
    setMentions((prev) => new Map(prev).set(member.id, member.name))
    setQuery(null)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(before.length, before.length)
    })
  }

  function submit() {
    const text = body.trim()
    if (!text) return
    // Only keep mentions whose "@Name" is still in the text.
    const ids = [...mentions.entries()]
      .filter(([, name]) => text.includes(`@${name}`))
      .map(([id]) => id)
    startTransition(async () => {
      const result = await addComment(taskId, { body: text, mentions: ids })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setBody("")
      setMentions(new Map())
    })
  }

  return (
    <div className="relative flex flex-col gap-2">
      <Textarea
        ref={textarea}
        value={body}
        rows={3}
        placeholder="Add a comment. Type @ to mention someone."
        aria-label="Add a comment"
        onChange={(e) => {
          setBody(e.target.value)
          updateQuery(e.target.value, e.target.selectionStart)
        }}
        onKeyDown={(e) => {
          if (suggestions.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setHighlight((h) => (h + 1) % suggestions.length)
              return
            }
            if (e.key === "ArrowUp") {
              e.preventDefault()
              setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
              return
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault()
              insertMention(suggestions[highlight])
              return
            }
            if (e.key === "Escape") {
              setQuery(null)
              return
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            submit()
          }
        }}
        onBlur={() => window.setTimeout(() => setQuery(null), 150)}
      />
      {suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Mention someone"
          className="absolute top-full left-0 z-10 mt-1 w-64 rounded-md border bg-popover p-1 shadow-md"
        >
          {suggestions.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(m)
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                  i === highlight && "bg-muted",
                )}
              >
                <Avatar className="size-5">
                  <AvatarFallback className="bg-muted text-[9px]">
                    {initials(m.name)}
                  </AvatarFallback>
                </Avatar>
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Ctrl + Enter to post</span>
        <Button size="sm" variant="outline" disabled={pending || !body.trim()} onClick={submit}>
          {pending ? "Posting…" : "Post comment"}
        </Button>
      </div>
    </div>
  )
}

/** Renders a comment body with @mentions highlighted. */
export function CommentBody({ body, names }: { body: string; names: string[] }) {
  if (names.length === 0) return <>{body}</>
  const escaped = names
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const parts = body.split(new RegExp(`(@(?:${escaped.join("|")}))`, "g"))
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") && names.includes(part.slice(1)) ? (
          <span key={i} className="font-medium text-brand">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}
