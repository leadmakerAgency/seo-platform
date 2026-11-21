import Link from "next/link"

import { cn } from "@/lib/utils"
import { MODEL_META, type AivModel } from "../config"
import { getMatrix, getOverview, type AivBrand, type AivSuggestion, type AivTopic } from "../queries"
import { aivHref, type AivParams } from "../search-params"
import { BrandDot, fixed, pct, SectionCard } from "./bits"
import { BrandManager } from "./brand-manager"
import { BrandTable } from "./overview-tab"

const DIMS = [
  { key: "model", label: "Platform" },
  { key: "brand", label: "Brand" },
  { key: "topic", label: "Topic" },
  { key: "tag", label: "Tag" },
  { key: "country", label: "Country" },
] as const
type Dim = (typeof DIMS)[number]["key"]

export async function BrandsTab({
  clientId,
  base,
  params,
  filter,
  brands,
  topics,
  suggestions,
  canManage,
}: {
  clientId: string
  base: string
  params: AivParams
  filter: Record<string, unknown>
  brands: AivBrand[]
  topics: AivTopic[]
  suggestions: AivSuggestion[]
  canManage: boolean
}) {
  const [rowsDim, colsDim] = ((params.view ?? "brand-model").split("-") as Dim[]).map((d, i) =>
    DIMS.some((x) => x.key === d) ? d : i === 0 ? "brand" : "model",
  ) as [Dim, Dim]
  const cols = colsDim === rowsDim ? (rowsDim === "model" ? "brand" : "model") : colsDim
  const [overview, cells] = await Promise.all([getOverview(clientId, filter), getMatrix(clientId, filter, rowsDim, cols)])
  const slotOf = new Map(brands.map((b) => [b.id, b.colorSlot]))
  const label = (dim: Dim, key: string) => {
    if (dim === "brand") return brands.find((b) => b.id === key)?.name ?? "Brand"
    if (dim === "model") return MODEL_META[key as AivModel]?.label ?? key
    if (dim === "topic") return topics.find((t) => t.id === key)?.name ?? "No topic"
    return key
  }
  const rowKeys = [...new Set(cells.map((c) => c.row))].slice(0, 10)
  const colKeys = [...new Set(cells.map((c) => c.col))].slice(0, 10)
  const cell = (r: string, c: string) => cells.find((x) => x.row === r && x.col === c)

  // Strongest and weakest platform for the client.
  const own = brands.find((b) => b.isOwn)
  const perModel = own ? await getMatrix(clientId, filter, "model", "brand") : []
  const ownModels = perModel
    .filter((c) => c.col === own?.id && c.answers >= 3)
    .map((c) => ({ model: c.row as AivModel, score: 0.5 * (c.visibility ?? 0) + 0.3 * (c.sentiment ?? 50) + 0.2 * (100 - 10 * ((c.position ?? 10) - 1)), visibility: c.visibility }))
    .sort((a, b) => b.score - a.score)

  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Tracked brands" description="The client and the competitors counted in every answer.">
        <BrandManager clientId={clientId} brands={brands} suggestions={suggestions} canManage={canManage} />
      </SectionCard>

      <SectionCard title="All brands in this range">
        <BrandTable rows={overview.brands} slotOf={slotOf} />
        {ownModels.length >= 2 && (
          <p className="text-sm text-muted-foreground">
            Strongest platform for {own?.name}: <span className="text-foreground">{MODEL_META[ownModels[0].model].label}</span> ({pct(ownModels[0].visibility)} visibility).
            Weakest: <span className="text-foreground">{MODEL_META[ownModels[ownModels.length - 1].model].label}</span> ({pct(ownModels[ownModels.length - 1].visibility)}).
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Compare"
        description="Visibility for any two dimensions. Darker = named in more answers. Hover a cell for every metric."
        actions={
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-muted-foreground">Rows</span>
            {DIMS.map((d) => (
              <Link key={d.key} href={aivHref(base, params, { view: `${d.key}-${cols === d.key ? rowsDim : cols}` })} scroll={false}
                className={cn("rounded-md px-2 py-1", rowsDim === d.key ? "bg-foreground text-background dark:bg-muted dark:text-foreground" : "hover:bg-muted")}>
                {d.label}
              </Link>
            ))}
            <span className="ml-2 text-muted-foreground">Columns</span>
            {DIMS.filter((d) => d.key !== rowsDim).map((d) => (
              <Link key={d.key} href={aivHref(base, params, { view: `${rowsDim}-${d.key}` })} scroll={false}
                className={cn("rounded-md px-2 py-1", cols === d.key ? "bg-foreground text-background dark:bg-muted dark:text-foreground" : "hover:bg-muted")}>
                {d.label}
              </Link>
            ))}
          </div>
        }
      >
        {rowKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No answers in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0.5 text-sm">
              <thead>
                <tr>
                  <th />
                  {colKeys.map((c) => (
                    <th key={c} className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        {cols === "brand" && <BrandDot slot={slotOf.get(c) ?? 0} />}
                        {label(cols, c)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowKeys.map((r) => (
                  <tr key={r}>
                    <th className="px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        {rowsDim === "brand" && <BrandDot slot={slotOf.get(r) ?? 0} />}
                        {label(rowsDim, r)}
                      </span>
                    </th>
                    {colKeys.map((c) => {
                      const x = cell(r, c)
                      const v = x?.visibility ?? null
                      return (
                        <td
                          key={c}
                          className="rounded-md px-2 py-1.5 text-center tabular-nums"
                          style={{ background: v === null ? "var(--muted)" : `color-mix(in oklch, var(--series-1) ${Math.round(8 + (v / 100) * 47)}%, var(--card))` }}
                          title={x ? `Visibility ${pct(x.visibility)} · position ${x.position ? `#${fixed(x.position)}` : "–"} · sentiment ${x.sentiment ?? "–"} · win rate ${pct(x.winRate)} · ${x.answers} answers` : "No answers"}
                        >
                          {v === null ? "–" : pct(v)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
