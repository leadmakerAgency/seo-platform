"use client"

import { Check, Minus } from "@/components/icons"

import type { AiProspect } from "../queries"
import { FitMeter, LINK_KIND_LABEL, REPLICABILITY_META } from "./ai-ui"

/**
 * Side by side: which competitor each site links to (plan 11 §1.4). A tick is a link DataForSEO
 * found; struck through when our page check found it gone.
 */
export function GapTable({
  rows,
  competitors,
  onOpen,
}: {
  rows: AiProspect[]
  competitors: string[]
  onOpen: (p: AiProspect) => void
}) {
  const cols = competitors.length
    ? competitors
    : [...new Set(rows.flatMap((r) => r.competitorLinks.map((l) => l.competitor)))].slice(0, 5)
  if (!rows.length) return null
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Site
            </th>
            {cols.map((c) => (
              <th key={c} scope="col" className="max-w-28 truncate px-2 py-2 text-center font-medium" title={c}>
                {c.replace(/\.(com|net|org|co|io)$/, "")}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-left font-medium">
              How they got it
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Fit
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const byComp = new Map(p.competitorLinks.map((l) => [l.competitor, l]))
            const rep = p.replicability ? REPLICABILITY_META[p.replicability] : null
            return (
              <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <th scope="row" className="max-w-56 px-3 py-2 text-left font-normal">
                  <button type="button" onClick={() => onOpen(p)} className="flex min-w-0 flex-col items-start text-left outline-none focus-visible:underline">
                    <span className="truncate font-medium">{p.site}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {p.sharedCount ?? byComp.size} of {cols.length}
                    </span>
                  </button>
                </th>
                {cols.map((c) => {
                  const l = byComp.get(c)
                  return (
                    <td key={c} className="px-2 py-2 text-center">
                      {l ? (
                        <span
                          className={l.still_there === false ? "text-muted-foreground line-through" : "text-success"}
                          title={`${l.anchor ? `"${l.anchor}" · ` : ""}${l.dofollow === false ? "nofollow" : "followed"}${l.still_there === false ? " · gone now" : ""}`}
                        >
                          <Check className="mx-auto size-4" aria-label={l.still_there === false ? "Linked before, gone now" : "Links here"} />
                        </span>
                      ) : (
                        <Minus className="mx-auto size-3.5 text-muted-foreground/50" aria-label="No link" />
                      )}
                    </td>
                  )
                })}
                <td className="px-2 py-2 text-xs">
                  <span className="block">{p.linkKind ? LINK_KIND_LABEL[p.linkKind] ?? p.linkKind : "—"}</span>
                  {rep && <span className="text-muted-foreground">{rep.label}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <FitMeter fit={p.fit} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
