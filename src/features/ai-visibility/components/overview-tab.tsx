import Link from "next/link"

import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { SOURCE_TYPE_LABEL } from "../config"
import { getChats, getOverview, getSourceDomains, getTrend, type AivBrand } from "../queries"
import { aivHref, type AivParams } from "../search-params"
import { BrandDot, Change, fixed, KpiRow, ModelChip, pct, SectionCard, TypeTag } from "./bits"
import { TrendChart } from "./trend-chart"

export async function OverviewTab({
  clientId,
  base,
  params,
  filter,
  brands,
}: {
  clientId: string
  base: string
  params: AivParams
  filter: Record<string, unknown>
  brands: AivBrand[]
}) {
  const days = Math.round((Date.parse(params.to) - Date.parse(params.from)) / 86_400_000) + 1
  const bucket = days > 60 ? "week" : days > 14 ? "week" : "day"
  const [overview, trend, sources, chats] = await Promise.all([
    getOverview(clientId, filter),
    getTrend(clientId, filter, bucket),
    getSourceDomains(clientId, filter, null, 10, 0),
    getChats(clientId, filter, { limit: 8 }),
  ])
  const own = overview.brands.find((b) => b.isOwn)
  const slotOf = new Map(brands.map((b) => [b.id, b.colorSlot]))

  if (overview.answers === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6 text-sm">
        <p className="font-medium">No answers in this range yet</p>
        <p className="max-w-[64ch] text-muted-foreground">
          The first check asks every question on every platform. Answers come in within about an hour, then this page fills in.
          Try a longer range if a check already ran.
        </p>
      </div>
    )
  }

  // Trend: the client plus the 7 competitors with the most visibility. Colours follow the brand, never the rank.
  const series = overview.brands
    .filter((b) => b.isOwn || b.mentioned > 0)
    .sort((a, b) => Number(b.isOwn) - Number(a.isOwn) || (b.visibility ?? 0) - (a.visibility ?? 0))
    .slice(0, 8)
    .map((b) => ({ brandId: b.brandId, name: b.name, slot: slotOf.get(b.brandId) ?? b.colorSlot, isOwn: b.isOwn }))

  const typeTotal = Object.values(sources.types).reduce((s, n) => s + n, 0)

  return (
    <div className="flex flex-col gap-6">
      <KpiRow
        label={`${own?.name ?? "Client"} in AI answers`}
        items={[
          { key: "vis", label: "Visibility", value: pct(own?.visibility), hint: "Share of answers that name the client", note: <Change now={own?.visibility ?? null} before={own?.prev.visibility ?? null} unit=" pts" /> },
          { key: "sov", label: "Share of voice", value: pct(own?.sov), hint: "The client's mentions out of all tracked brands' mentions", note: <Change now={own?.sov ?? null} before={own?.prev.sov ?? null} unit=" pts" /> },
          { key: "pos", label: "Position", value: own?.position ? `#${fixed(own.position)}` : "–", hint: "Average rank among the brands an answer names (1 is first)", note: <Change now={own?.position ?? null} before={own?.prev.position ?? null} lowerIsBetter /> },
          { key: "sent", label: "Sentiment", value: own?.sentiment !== null && own?.sentiment !== undefined ? String(Math.round(own.sentiment)) : "–", hint: "How positively answers describe the client, 0–100", note: <Change now={own?.sentiment ?? null} before={own?.prev.sentiment ?? null} /> },
          { key: "win", label: "Win rate", value: pct(own?.winRate), hint: "Answers where the client is named first", note: <Change now={own?.winRate ?? null} before={own?.prev.winRate ?? null} unit=" pts" /> },
        ]}
      />
      <p className="-mt-4 text-xs text-muted-foreground tabular-nums">
        {formatNumber(overview.answers)} answers in this range
        {overview.previousAnswers ? ` · ${formatNumber(overview.previousAnswers)} in the period before` : ""}
      </p>

      <SectionCard title="Over time" description="How the client and its competitors show up across the platforms.">
        <TrendChart points={trend} series={series} />
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Brands"
          description="Every tracked brand in this range."
          actions={<Link href={aivHref(base, params, { tab: "brands" })} className="text-sm text-brand hover:underline">Manage brands</Link>}
        >
          <BrandTable rows={overview.brands} slotOf={slotOf} />
        </SectionCard>

        <SectionCard
          title="Top sources"
          description="The sites AI answers read most."
          actions={<Link href={aivHref(base, params, { tab: "sources" })} className="text-sm text-brand hover:underline">All sources</Link>}
        >
          {typeTotal > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
                {Object.entries(sources.types)
                  .sort((a, b) => b[1] - a[1])
                  .map(([t, n], i) => (
                    <span key={t} className="h-full" style={{ width: `${(100 * n) / typeTotal}%`, background: `var(--chart-${(i % 5) + 1})` }} />
                  ))}
              </div>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {Object.entries(sources.types)
                  .sort((a, b) => b[1] - a[1])
                  .map(([t, n], i) => (
                    <li key={t} className="flex items-center gap-1.5">
                      <span aria-hidden className="size-2 rounded-full" style={{ background: `var(--chart-${(i % 5) + 1})` }} />
                      {SOURCE_TYPE_LABEL[t as keyof typeof SOURCE_TYPE_LABEL] ?? t} <span className="tabular-nums">{n}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <ul className="divide-y text-sm">
            {sources.rows.map((r) => (
              <li key={r.domain} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn("truncate", r.isOwn && "font-medium text-brand")}>{r.domain}</span>
                  <TypeTag type={r.isOwn ? "own" : r.brandId ? "competitor" : r.type} />
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  read {pct(r.retrievedPct)} · cited {pct(r.citedPct)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        title="Recent answers"
        actions={<Link href={aivHref(base, params, { tab: "chats" })} className="text-sm text-brand hover:underline">All answers</Link>}
      >
        <ul className="divide-y">
          {chats.rows.map((c) => (
            <li key={c.id}>
              <Link href={aivHref(base, params, { tab: "chats", sheet: c.id })} scroll={false} className="flex flex-col gap-1.5 py-2.5 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 items-center gap-2">
                  <ModelChip model={c.model} />
                  <span className="truncate text-sm">{c.prompt}</span>
                </span>
                <span className="flex shrink-0 flex-wrap gap-1">
                  {c.mentions.slice(0, 4).map((m) => (
                    <span key={m.name} className={cn("rounded-sm border px-1.5 py-0.5 text-xs", m.brandId && brands.find((b) => b.id === m.brandId)?.isOwn && "border-primary/40 bg-brand-soft font-medium")}>
                      {m.position}. {m.name}
                    </span>
                  ))}
                  {!c.mentions.length && <span className="text-xs text-muted-foreground">No brands named</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  )
}

export function BrandTable({ rows, slotOf }: { rows: Awaited<ReturnType<typeof getOverview>>["brands"]; slotOf: Map<string, number> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-2 text-left font-medium">Brand</th>
            <th className="px-2 py-2 text-right font-medium">Visibility</th>
            <th className="px-2 py-2 text-right font-medium">SoV</th>
            <th className="px-2 py-2 text-right font-medium">Position</th>
            <th className="px-2 py-2 text-right font-medium">Sentiment</th>
            <th className="py-2 pl-2 text-right font-medium">Win rate</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((b) => (
            <tr key={b.brandId} className={cn(b.isOwn && "bg-brand-soft/60")}>
              <td className="py-2 pr-2">
                <span className="flex items-center gap-2">
                  <BrandDot slot={slotOf.get(b.brandId) ?? b.colorSlot} />
                  <span className={cn("truncate", b.isOwn && "font-medium")}>{b.name}</span>
                </span>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{pct(b.visibility)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{pct(b.sov)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{b.position ? `#${fixed(b.position)}` : "–"}</td>
              <td className="px-2 py-2 text-right tabular-nums">{b.sentiment !== null ? Math.round(b.sentiment) : "–"}</td>
              <td className="py-2 pl-2 text-right tabular-nums">{pct(b.winRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
