"use client"

import { Check, Circle, Loader2, Radar } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { seedProject } from "../actions"

/** First-time setup: fill the project from what the agency already knows, then add questions. */
export function SetupGate({
  clientId,
  clientName,
  hasProject,
  prompts,
  settingsHref,
  promptsHref,
  canManage,
}: {
  clientId: string
  clientName: string
  hasProject: boolean
  prompts: number
  settingsHref: string
  promptsHref: string
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const steps = [
    { title: "Brand, competitors and platforms", done: hasProject, detail: hasProject ? "Set up" : "Filled in from the client's details, the backlink brief and the competitors" },
    { title: "Questions buyers ask AI", done: prompts > 0, detail: prompts > 0 ? `${prompts} tracked` : "Shockwave AI can suggest them; add or paste your own" },
  ]
  return (
    <section aria-labelledby="aiv-gate" className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-1 border-b px-5 py-4">
        <h2 id="aiv-gate" className="flex items-center gap-2 text-[15px] leading-[22px] font-semibold">
          <Radar className="size-4 text-brand" aria-hidden /> Set up AI visibility for {clientName}
        </h2>
        <p className="max-w-[70ch] text-sm text-muted-foreground">
          Every week the client&apos;s questions are asked on ChatGPT, Gemini, Google AI, Claude and Perplexity. You see who gets named, which sites the answers rely on, and what to do next.
        </p>
      </div>
      <ol className="flex flex-col divide-y">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3 px-5 py-3">
            <span aria-hidden className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", s.done ? "border-success bg-success text-white" : "bg-background text-muted-foreground")}>
              {s.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">{s.title}<span className="sr-only">{s.done ? " (done)" : " (to do)"}</span></p>
              <p className={cn("text-[13px]", s.done ? "text-muted-foreground" : "text-warning")}>
                {!s.done && <Circle className="mr-1.5 mb-0.5 inline size-3" aria-hidden />}
                {s.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex justify-end border-t bg-muted/30 px-5 py-3">
        {!canManage ? (
          <p className="text-[13px] text-muted-foreground">An admin or account manager sets this up.</p>
        ) : !hasProject ? (
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await seedProject(clientId)
                if (!r.ok) return void toast.error(r.error)
                router.push(settingsHref)
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} Start setup
          </Button>
        ) : (
          <Button onClick={() => router.push(promptsHref)}>Add questions</Button>
        )}
      </div>
    </section>
  )
}
