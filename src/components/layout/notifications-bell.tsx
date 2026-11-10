"use client"

import { Bell } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { markNotificationsRead } from "@/features/tasks/actions"
import { taskNumber } from "@/features/tasks/constants"
import type { NotificationItem } from "@/features/tasks/queries"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"

function describe(n: NotificationItem) {
  const who = n.actorName ?? "Someone"
  const task = n.task
  if (!task) return `${who} sent you a notification`
  const clients =
    task.clients > 0 ? ` (${task.clients} ${task.clients === 1 ? "client" : "clients"})` : ""
  if (n.kind === "task_assigned") return `${who} assigned you “${task.title}”${clients}`
  if (n.kind === "task_mentioned") return `${who} mentioned you on ${taskNumber(task.number)}`
  return `${who} commented on ${taskNumber(task.number)} “${task.title}”`
}

/** Header bell: latest notifications, refreshed on focus and every minute. */
export function NotificationsBell() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  // Set when data loads, never during render (Cache Components prerenders this).
  const [now, setNow] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" })
      if (!res.ok) return
      const body = (await res.json()) as { items: NotificationItem[]; unread: number }
      setItems(body.items)
      setUnread(body.unread)
      setNow(new Date())
    } catch {
      // Offline or signed out: keep what we have.
    }
  }, [])

  useEffect(() => {
    const first = window.setTimeout(load, 0)
    const timer = window.setInterval(load, 60_000)
    window.addEventListener("focus", load)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      window.removeEventListener("focus", load)
    }
  }, [load])

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next && unread > 0) {
      setUnread(0)
      void markNotificationsRead()
    }
    if (!next) {
      const now = new Date().toISOString()
      setItems((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: now })))
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">Notifications</div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. Assignments and @mentions show up here.
          </p>
        ) : (
          <ul className="max-h-[420px] overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className="border-b last:border-b-0">
                <Link
                  href={n.task ? `/tasks?task=${n.task.number}` : "/tasks"}
                  onClick={() => onOpenChange(false)}
                  className="flex gap-3 px-4 py-3 text-sm hover:bg-muted"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.readAt ? "bg-transparent" : "bg-primary",
                    )}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span>{describe(n)}</span>
                    <span className="text-xs text-muted-foreground">
                      {now ? formatRelative(n.createdAt, now) : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
