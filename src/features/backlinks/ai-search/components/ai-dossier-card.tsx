import { ArrowUpRight, Brain, CircleAlert, Swords, Target, Users } from "@/components/icons"

import { formatRelative } from "@/lib/format"
import { OpenSetupLink } from "../../components/setup-sheet"
import type { AiDossier } from "../queries"

/** "What Shockwave AI understood": the dossier, where to rank and the competitors, per place. */

const TYPE_LABEL: Record<string, string> = {
  brick_and_mortar: "Has a location customers visit",
  service_area: "Serves an area",
  hybrid: "Location + service area",
  online: "Online business",
}

const VERTICAL_LABEL: Record<string, string> = {
  home_services: "Home services",
  real_estate: "Real estate",
  saas: "Software (SaaS)",
  ecommerce: "E-commerce",
  professional_services: "Professional services",
}

const label = (v: string) => VERTICAL_LABEL[v] ?? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ")

export function AiDossierCard({
  data,
  briefVersion,
  nowIso,
}: {
  data: AiDossier
  briefVersion: number | null
  nowIso: string
}) {
  const d = data.dossier
  if (!d) return null
  const stale = briefVersion !== null && data.briefVersion !== null && briefVersion !== data.briefVersion
  return (
    <details className="group/dossier rounded-xl border bg-card" open>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          <Brain className="icon-duo size-4" aria-hidden />
          What Shockwave AI understood
        </span>
        <span className="text-xs text-muted-foreground">
          {stale ? "The brief changed since; run again to update · " : ""}
          Updated {formatRelative(data.updatedAt, new Date(nowIso))}
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-dashed px-4 py-4 sm:px-5">
        <p className="max-w-[80ch] text-sm">{d.summary}</p>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-md border bg-muted/40 px-2 py-0.5">{TYPE_LABEL[d.business_type] ?? d.business_type}</span>
          <span className="rounded-md border bg-muted/40 px-2 py-0.5">{label(d.vertical)}</span>
          {d.services.slice(0, 6).map((s) => (
            <span key={s} className="rounded-md border px-2 py-0.5 text-muted-foreground">
              {s}
            </span>
          ))}
        </div>
        <div className="flex items-start gap-2 text-sm">
          <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p>
            <span className="font-medium">Buyers:</span> {d.ideal_buyer.who}
            {d.ideal_buyer.researches_on.length ? (
              <span className="text-muted-foreground"> · research on {d.ideal_buyer.researches_on.slice(0, 5).join(", ")}</span>
            ) : null}
          </p>
        </div>

        {data.rankingMap.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {data.rankingMap.map((m) => {
              const comps = data.competitors.find((c) => c.market === m.market)?.competitors ?? []
              return (
                <div key={m.market} className="flex flex-col gap-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">{m.label}</p>
                  {m.queries.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Target className="size-3.5" aria-hidden />
                        Needs to rank for
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {m.queries.map((q) => (
                          <span key={q.q} title={q.why} className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">
                            {q.q}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {comps.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Swords className="size-3.5" aria-hidden />
                        Competitors there
                      </span>
                      <p className="text-xs">{comps.map((c) => c.name || c.domain).join(" · ")}</p>
                    </div>
                  )}
                  {m.lists.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Lists and directories already ranking</span>
                      <ul className="flex flex-col gap-0.5">
                        {m.lists.slice(0, 4).map((l) => (
                          <li key={l.url} className="truncate text-xs">
                            <a href={l.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 hover:underline">
                              {l.title || l.url}
                              <ArrowUpRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {d.doubts.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg border border-warning/30 bg-warning-soft/50 p-3 text-[13px]">
            {d.doubts.map((x) => (
              <li key={x} className="flex items-start gap-1.5">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                {x}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Looks wrong? Correct it in the{" "}
          <OpenSetupLink step="brief">strategy brief</OpenSetupLink>{" "}
          and run again.
        </p>
      </div>
    </details>
  )
}
