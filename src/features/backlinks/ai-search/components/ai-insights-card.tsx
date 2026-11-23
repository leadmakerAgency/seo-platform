import { Lightbulb, Network, ShieldAlert, Users, Zap, type IconComponent } from "@/components/icons"

import type { AiInsight, AiSearchData } from "../queries"

const KIND: Record<AiInsight["kind"], { icon: IconComponent; label: string; tone: string }> = {
  pattern: { icon: Lightbulb, label: "What they do", tone: "text-info" },
  quick_win: { icon: Zap, label: "Quick win", tone: "text-success" },
  ask_clients: { icon: Users, label: "Ask your clients", tone: "text-brand" },
  watch_out: { icon: ShieldAlert, label: "Don't copy", tone: "text-warning" },
}

/** "How competitors get their links", from the latest competitor backlinks pass (plan 11 §2.5). */
export function AiInsightsCard({ insights }: { insights: NonNullable<AiSearchData["insights"]> }) {
  if (!insights.items.length) return null
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4" aria-labelledby="ai-insights-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ai-insights-title" className="flex items-center gap-2 text-[15px] leading-[22px] font-semibold">
          <Network className="size-4 text-muted-foreground" aria-hidden />
          How competitors get their links
        </h2>
        <p className="text-xs text-muted-foreground">
          {insights.mode === "ai_only" ? "Estimated from mentions" : "From link data"}
          {insights.competitors.length ? ` · ${insights.competitors.join(", ")}` : ""}
          {insights.at ? ` · ${new Date(insights.at).toLocaleDateString()}` : ""}
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {insights.items.map((x, i) => {
          const k = KIND[x.kind] ?? KIND.pattern
          return (
            <li key={i} className="flex gap-2.5 rounded-md border bg-background px-3 py-2.5">
              <k.icon className={`mt-0.5 size-4 shrink-0 ${k.tone}`} aria-hidden />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{k.label}</span>
                <span className="text-sm font-medium">{x.title}</span>
                <span className="text-[13px] text-muted-foreground">{x.detail}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
