"use client"

import { useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TrendPoint } from "../queries"
import { seriesColor } from "./bits"

/**
 * Brand metrics over time, one line per brand in its fixed colour (--series-*, validated with the
 * dataviz script in light and dark). One y-axis; position is drawn with 1 at the top. Buckets
 * without answers are gaps. Hover shows every brand for that bucket; "Show as table" gives the numbers.
 */

export type TrendSeries = { brandId: string; name: string; slot: number; isOwn: boolean }
export type TrendMetric = "visibility" | "sov" | "position" | "sentiment" | "win_rate"

const METRICS: { key: TrendMetric; label: string }[] = [
  { key: "visibility", label: "Visibility" },
  { key: "sov", label: "Share of voice" },
  { key: "position", label: "Position" },
  { key: "sentiment", label: "Sentiment" },
  { key: "win_rate", label: "Win rate" },
]

const W = 680
const H = 240
const PAD = { top: 14, right: 16, bottom: 26, left: 38 }

function valueOf(p: TrendPoint, metric: TrendMetric): number | null {
  switch (metric) {
    case "visibility":
      return p.answers ? (100 * p.mentioned) / p.answers : null
    case "sov":
      return p.brandTotal ? (100 * p.mentioned) / p.brandTotal : null
    case "position":
      return p.position
    case "sentiment":
      return p.sentiment
    case "win_rate":
      return p.named ? (100 * p.wins) / p.named : null
  }
}

const fmtDay = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`))

export function TrendChart({
  points,
  series,
  initial = "visibility",
  metrics,
}: {
  points: TrendPoint[]
  series: TrendSeries[]
  initial?: TrendMetric
  /** Limit the metric switch (default: all five). */
  metrics?: TrendMetric[]
}) {
  const [metric, setMetric] = useState<TrendMetric>(initial)
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const buckets = useMemo(() => [...new Set(points.map((p) => p.bucket))].sort(), [points])
  const grid = useMemo(() => {
    const m = new Map<string, number | null>()
    for (const p of points) m.set(`${p.bucket}|${p.brandId}`, valueOf(p, metric))
    return m
  }, [points, metric])
  const at = (b: string, id: string) => grid.get(`${b}|${id}`) ?? null

  if (!buckets.length || !series.length) {
    return <p className="text-sm text-muted-foreground">No answers in this range yet.</p>
  }

  const isPos = metric === "position"
  const values = buckets.flatMap((b) => series.map((s) => at(b, s.brandId))).filter((v): v is number => v !== null)
  const posMax = Math.max(3, Math.ceil(Math.max(1, ...values)))
  const yMin = isPos ? 1 : 0
  const yMax = isPos ? posMax : 100
  const ticks = isPos ? [1, Math.ceil(posMax / 2), posMax] : [0, 25, 50, 75, 100]
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (buckets.length === 1 ? innerW / 2 : (i / (buckets.length - 1)) * innerW)
  const y = (v: number) => (isPos ? PAD.top + ((v - yMin) / (yMax - yMin)) * innerH : PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH)

  const paths = series.map((s) => {
    let d = ""
    let open = false
    buckets.forEach((b, i) => {
      const v = at(b, s.brandId)
      if (v !== null) {
        d += `${open ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`
        open = true
      } else open = false
    })
    return { s, d }
  })

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    let dist = Infinity
    buckets.forEach((_, i) => {
      const d = Math.abs(x(i) - px)
      if (d < dist) {
        dist = d
        best = i
      }
    })
    setHover(best)
  }

  const fmt = (v: number | null) => (v === null ? "–" : isPos || metric === "sentiment" ? v.toFixed(1) : `${Math.round(v)}%`)
  const hb = hover !== null ? buckets[hover] : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Metric">
          {METRICS.filter((m) => !metrics || metrics.includes(m.key)).map((m) => (
            <Button key={m.key} size="xs" variant={metric === m.key ? "secondary" : "ghost"} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>
              {m.label}
            </Button>
          ))}
        </div>
        <Button size="xs" variant="ghost" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "Show as chart" : "Show as table"}
        </Button>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {series.map((s) => (
          <li key={s.brandId} className={cn("flex items-center gap-1.5", s.isOwn && "font-medium text-foreground")}>
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: seriesColor(s.slot) }} />
            {s.name}
          </li>
        ))}
      </ul>

      {asTable ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">From</th>
                {series.map((s) => (
                  <th key={s.brandId} className="px-3 py-2 text-right font-medium">{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...buckets].reverse().map((b) => (
                <tr key={b}>
                  <td className="px-3 py-1.5">{fmtDay(b)}</td>
                  {series.map((s) => (
                    <td key={s.brandId} className="px-3 py-1.5 text-right tabular-nums">{fmt(at(b, s.brandId))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img"
            aria-label={`${METRICS.find((m) => m.key === metric)?.label} over time for ${series.length} brands. Use "Show as table" for the numbers.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                  {isPos ? t : metric === "sentiment" ? t : `${t}%`}
                </text>
              </g>
            ))}
            {buckets.map((b, i) =>
              buckets.length <= 8 || i % Math.ceil(buckets.length / 8) === 0 ? (
                <text key={b} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">{fmtDay(b)}</text>
              ) : null,
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 3" />}
            {paths.map(({ s, d }) => (
              <path key={s.brandId} d={d} fill="none" stroke={seriesColor(s.slot)} strokeWidth={s.isOwn ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {series.map((s) =>
              buckets.map((b, i) => {
                const v = at(b, s.brandId)
                return v === null ? null : (
                  <circle key={`${s.brandId}${b}`} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : 3} fill={seriesColor(s.slot)} stroke="var(--card)" strokeWidth={2} />
                )
              }),
            )}
            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
          {hb && (
            <div
              className="pointer-events-none absolute top-2 z-10 w-52 -translate-x-1/2 rounded-md border bg-popover p-2 text-xs shadow-md"
              style={{ left: `${Math.min(85, Math.max(15, (x(hover!) / W) * 100))}%` }}
            >
              <p className="mb-1 font-medium">From {fmtDay(hb)}</p>
              <ul className="flex flex-col gap-0.5">
                {series.map((s) => (
                  <li key={s.brandId} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: seriesColor(s.slot) }} />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="tabular-nums">{fmt(at(hb, s.brandId))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
