"use client"

import { useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ENGINE_META, NOT_FOUND, type Engine } from "../constants"
import type { EngineRank } from "../queries"
import { formatShortDay } from "./bits"

/**
 * Weekly position per engine (one line each, fixed colours: Google violet, Maps teal,
 * Bing amber; validated with the dataviz palette script in light and dark). Position 1
 * is at the top. Weeks where the business wasn't found are gaps, never drawn as 0.
 * Hover shows every engine for that week; "Show as table" gives the same numbers.
 */

const COLOR: Record<Engine, string> = {
  google: "var(--chart-1)",
  google_maps: "var(--chart-2)",
  bing: "var(--chart-3)",
}

const W = 640
const H = 220
const PAD = { top: 12, right: 64, bottom: 26, left: 34 }

type Week = { day: string; at: string; values: Partial<Record<Engine, number | null>> }

const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(new Date(iso))

export function PositionChart({ engines }: { engines: Partial<Record<Engine, EngineRank | null>> }) {
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const series = useMemo(
    () => (Object.keys(engines) as Engine[]).filter((e) => engines[e]?.history.length),
    [engines],
  )

  const weeks = useMemo(() => {
    const byDay = new Map<string, Week>()
    for (const engine of series) {
      for (const p of engines[engine]!.history.slice(-12)) {
        const day = dayKey(p.at)
        const w = byDay.get(day) ?? { day, at: p.at, values: {} }
        w.values[engine] = p.position
        byDay.set(day, w)
      }
    }
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-12)
  }, [engines, series])

  if (series.length === 0 || weeks.length === 0) {
    return <p className="text-sm text-muted-foreground">No checks yet. The first one shows here.</p>
  }

  const maxFound = Math.max(
    1,
    ...weeks.flatMap((w) => Object.values(w.values).filter((v): v is number => typeof v === "number")),
  )
  const yMax = maxFound <= 10 ? 10 : maxFound <= 20 ? 20 : maxFound <= 50 ? 50 : 100
  const ticks = yMax === 10 ? [1, 5, 10] : yMax === 20 ? [1, 10, 20] : yMax === 50 ? [1, 10, 25, 50] : [1, 10, 50, 100]

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (weeks.length === 1 ? innerW / 2 : (i / (weeks.length - 1)) * innerW)
  const y = (pos: number) => PAD.top + ((pos - 1) / (yMax - 1)) * innerH

  // Line segments with gaps where the position is missing.
  const paths = series.map((engine) => {
    let d = ""
    let open = false
    weeks.forEach((w, i) => {
      const v = w.values[engine]
      if (typeof v === "number") {
        d += `${open ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`
        open = true
      } else {
        open = false
      }
    })
    return { engine, d }
  })

  // Direct labels at the last known point, nudged apart so they never overlap.
  const labels = series
    .map((engine) => {
      for (let i = weeks.length - 1; i >= 0; i--) {
        const v = weeks[i].values[engine]
        if (typeof v === "number") return { engine, y: y(v), value: v }
      }
      return null
    })
    .filter((l): l is { engine: Engine; y: number; value: number } => l !== null)
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < 14) labels[i].y = labels[i - 1].y + 14
  }

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    let bestDist = Infinity
    weeks.forEach((_, i) => {
      const d = Math.abs(x(i) - px)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    setHover(best)
  }

  const hovered = hover !== null ? weeks[hover] : null
  const tipLeft = hover !== null ? (x(hover) / W) * 100 : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
          {series.map((engine) => (
            <li key={engine} className="flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: COLOR[engine] }} />
              {ENGINE_META[engine].label}
            </li>
          ))}
        </ul>
        <Button size="xs" variant="ghost" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "Show as chart" : "Show as table"}
        </Button>
      </div>

      {asTable ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Week of</th>
                {series.map((e) => (
                  <th key={e} className="px-3 py-2 text-right font-medium">
                    {ENGINE_META[e].short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...weeks].reverse().map((w) => (
                <tr key={w.day}>
                  <td className="px-3 py-1.5">{formatShortDay(w.at)}</td>
                  {series.map((e) => (
                    <td key={e} className="px-3 py-1.5 text-right tabular-nums">
                      {w.values[e] === undefined ? (
                        <span className="text-muted-foreground">Not checked</span>
                      ) : w.values[e] === null ? (
                        <span className="text-muted-foreground">{NOT_FOUND[e]}</span>
                      ) : (
                        w.values[e]
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full overflow-visible"
            role="img"
            aria-label={`Position over the last ${weeks.length} checks. Use "Show as table" for the numbers.`}
          >
            {/* Recessive grid and axis labels (position 1 at the top). */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                  {t}
                </text>
              </g>
            ))}
            {weeks.map((w, i) =>
              weeks.length <= 6 || i % 2 === (weeks.length - 1) % 2 ? (
                <text
                  key={w.day}
                  x={x(i)}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {formatShortDay(w.at)}
                </text>
              ) : null,
            )}

            {hover !== null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            )}

            {paths.map(({ engine, d }) => (
              <path
                key={engine}
                d={d}
                fill="none"
                stroke={COLOR[engine]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {series.map((engine) =>
              weeks.map((w, i) => {
                const v = w.values[engine]
                if (typeof v !== "number") return null
                const active = hover === i
                return (
                  <circle
                    key={`${engine}-${w.day}`}
                    cx={x(i)}
                    cy={y(v)}
                    r={active ? 5 : 4}
                    fill={COLOR[engine]}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                )
              }),
            )}

            {labels.map((l) => (
              <text
                key={l.engine}
                x={W - PAD.right + 10}
                y={l.y}
                dy="0.32em"
                className="fill-foreground text-[11px] font-medium tabular-nums"
              >
                {ENGINE_META[l.engine].short} {l.value}
              </text>
            ))}

            <rect
              x={PAD.left - 10}
              y={0}
              width={innerW + 20}
              height={H}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>

          {hovered && (
            <div
              className={cn(
                "pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md",
                tipLeft > 60 ? "-translate-x-[calc(100%+12px)]" : "translate-x-3",
              )}
              style={{ left: `${tipLeft}%` }}
            >
              <p className="mb-1 font-medium">Week of {formatShortDay(hovered.at)}</p>
              <ul className="flex flex-col gap-0.5">
                {series.map((e) => {
                  const v = hovered.values[e]
                  return (
                    <li key={e} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span aria-hidden className="size-2 rounded-full" style={{ background: COLOR[e] }} />
                        {ENGINE_META[e].short}
                      </span>
                      <span className="font-medium tabular-nums">
                        {v === undefined ? "Not checked" : v === null ? "Not found" : v}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
