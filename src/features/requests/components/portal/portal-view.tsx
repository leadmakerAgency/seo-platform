"use client"

import { ChevronDown, CircleCheck, Clock } from "lucide-react"
import { useState } from "react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DECISION_LABELS, KIND_META } from "../../constants"
import type { PortalData, PortalRequest } from "../../portal"
import { PortalRequestCard } from "./portal-request-card"

/** The client's to-do list: open requests first, then what they've sent. */
export function PortalView({
  token,
  data,
  today,
}: {
  token: string
  data: PortalData
  today: string
}) {
  const [name, setName] = useState("")

  const open = data.requests.filter((r) => r.status === "open")
  const answered = data.requests.filter((r) => r.status === "answered")
  const finished = data.requests.filter((r) => r.status === "done")

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{data.clientName}</h1>
        <p className="text-[15px] text-muted-foreground">
          {open.length === 0
            ? "You're all caught up. Thank you!"
            : open.length === 1
              ? "1 thing we need from you"
              : `${open.length} things we need from you`}
        </p>
      </div>

      {open.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="portal-name" className="text-sm font-normal text-muted-foreground">
            Your name (optional), so we know who answered
          </Label>
          <Input
            id="portal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="name"
            placeholder="Dan"
            className="h-11 max-w-[280px] text-base"
          />
        </div>
      )}

      {open.length > 0 && (
        <ol className="flex flex-col gap-4">
          {open.map((r) => (
            <li key={r.id}>
              <PortalRequestCard token={token} request={r} today={today} name={name} />
            </li>
          ))}
        </ol>
      )}

      {answered.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Sent, we&apos;ll check them</h2>
          <ul className="divide-y rounded-xl border">
            {answered.map((r) => (
              <SentRow key={r.id} request={r} icon="clock" />
            ))}
          </ul>
        </section>
      )}

      {finished.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-semibold">
            <ChevronDown className="size-4" aria-hidden />
            Finished ({finished.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-3 divide-y rounded-xl border">
              {finished.map((r) => (
                <SentRow key={r.id} request={r} icon="check" />
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      <p className="border-t pt-6 text-sm text-muted-foreground">
        Questions?{" "}
        {data.contact
          ? `Reply to ${data.contact}, your account manager at LeadMaker, the same way you usually reach them.`
          : "Reply to your LeadMaker contact the same way you usually reach them."}
      </p>
    </div>
  )
}

function SentRow({ request: r, icon }: { request: PortalRequest; icon: "clock" | "check" }) {
  const Icon = icon === "check" ? CircleCheck : Clock
  const detail =
    r.kind === "approval" && r.decision
      ? DECISION_LABELS[r.decision]
      : r.kind === "files"
        ? `${r.files.length} ${r.files.length === 1 ? "file" : "files"} sent`
        : KIND_META[r.kind].clientLabel
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Icon
        className={
          icon === "check" ? "mt-0.5 size-4 text-success" : "mt-0.5 size-4 text-muted-foreground"
        }
        aria-hidden
      />
      <div className="flex min-w-0 flex-col">
        <span className="text-[15px]">{r.title}</span>
        <span className="text-xs text-muted-foreground">
          {detail}
          {r.responderName ? ` · by ${r.responderName}` : ""}
        </span>
      </div>
    </li>
  )
}
