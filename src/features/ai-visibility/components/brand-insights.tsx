import Link from "next/link"

import { cn } from "@/lib/utils"
import { getBrandInsight, type AivBrand, type BrandRow } from "../queries"
import { aivHref, type AivParams } from "../search-params"
import { BrandDot, Change, fixed, KpiRow, pct, SectionCard } from "./bits"
import { TrendChart } from "./trend-chart"

/** One brand: its KPIs and change, how often it's named vs how often its own sites are read, and its best and worst questions. */
export async function BrandInsights({
  clientId,
  base,
  params,
  filter,
  brands,
  rows,
}: {
  clientId: string
  base: string
  params: AivParams
  filter: Record<string, unknown>
  brands: AivBrand[]
  rows: BrandRow[]
}) {
  const active = brands.filter((b) => b.active)
  const brand = active.find((b) => b.id === params.brand) ?? active.find((b) => b.isOwn) ?? active[0]
  if (!brand) return null
  const days = Math.round((Date.parse(params.to) - Date.parse(params.from)) / 86_400_000) + 1
  const insight = await getBrandInsight(clientId, filter, brand.id, days > 14 ? "week" : "day")
  const row = rows.find((r) => r.brandId === brand.id)

  // Two lines in the same chart: named in answers (visibility) and its own sites read (source visibility).
  const points = insight.trend.flatMap((t) => [
    { bucket: t.bucket, brandId: "named", answers: t.answers, mentioned: t.mentioned, position: t.position, sentiment: t.sentiment, wins: 0, named: 0, brandTotal: 0 },
    { bucket: t.bucket, brandId: "read", answers: t.answers, mentioned: t.read, position: null, sentiment: null, wins: 0, named: 0, brandTotal: 0 },
  ])
  const best = insight.prompts.filter((p) => p.mentioned > 0).slice(0, 5)
  const worst = [...insight.prompts].filter((p) => p.answers > 0).sort((a, b) => (a.visibility ?? 0) - (b.visibility ?? 0) || b.answers - a.answers).slice(0, 5)

  return (
    <SectionCard
      title="Brand insights"
      description="Pick a brand to see where it performs best and how often AI reads its own sites."
      actions={
        <div className="flex flex-wrap gap-1">
          {active.map((b) => (
            <Link
              key={b.id}
              href={aivHref(base, params, { brand: b.id })}
              scroll={false}
              aria-current={b.id === brand.id ? "true" : undefined}
              className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs", b.id === brand.id ? "border-primary/40 bg-brand-soft" : "hover:bg-muted")}
            >
              <BrandDot slot={b.colorSlot} /> {b.name}
            </Link>
          ))}
        </div>
      }
    >
      <KpiRow
        label={`${brand.name} in AI answers`}
        items={[
          { key: "vis", label: "Visibility", value: pct(row?.visibility), note: <Change now={row?.visibility ?? null} before={row?.prev.visibility ?? null} unit=" pts" /> },
          { key: "sov", label: "Share of voice", value: pct(row?.sov), note: <Change now={row?.sov ?? null} before={row?.prev.sov ?? null} unit=" pts" /> },
          { key: "pos", label: "Position", value: row?.position ? `#${fixed(row.position)}` : "–", note: <Change now={row?.position ?? null} before={row?.prev.position ?? null} lowerIsBetter /> },
          { key: "sent", label: "Sentiment", value: row?.sentiment !== null && row?.sentiment !== undefined ? String(Math.round(row.sentiment)) : "–", note: <Change now={row?.sentiment ?? null} before={row?.prev.sentiment ?? null} /> },
          { key: "win", label: "Win rate", value: pct(row?.winRate), note: <Change now={row?.winRate ?? null} before={row?.prev.winRate ?? null} unit=" pts" /> },
        ]}
      />
      {brand.domains.length ? (
        <TrendChart
          points={points}
          series={[
            { brandId: "named", name: `${brand.name} named`, slot: brand.colorSlot, isOwn: true },
            { brandId: "read", name: `Its sites read (${brand.domains.join(", ")})`, slot: brand.colorSlot + 4, isOwn: false },
          ]}
          metrics={["visibility"]}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Add the brand&apos;s websites to compare how often it&apos;s named with how often its pages are read.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <PromptList title="Questions it does best on" list={best} empty="Not named in any answer in this range." />
        <PromptList title="Questions it does worst on" list={worst} empty="No answers in this range." />
      </div>
    </SectionCard>
  )
}

function PromptList({ title, list, empty }: { title: string; list: { promptId: string; text: string; answers: number; visibility: number | null; position: number | null }[]; empty: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {list.map((p) => (
            <li key={p.promptId} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">{p.text}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {pct(p.visibility)} of {p.answers}{p.position ? ` · #${fixed(p.position)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
