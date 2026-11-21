import Link from "next/link"

import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { SOURCE_TYPE_LABEL } from "../config"
import { getGap, getSourceDomains, getSourceUrls } from "../queries"
import { aivHref, type AivParams } from "../search-params"
import { ModelChip, pct, TypeTag } from "./bits"
import { SendToBacklinks } from "./send-to-backlinks"

const VIEWS = [
  { key: "gap", label: "Gap: competitors there, client not" },
  { key: "domains", label: "Domains" },
  { key: "urls", label: "Pages" },
] as const

export async function SourcesTab({
  clientId,
  base,
  params,
  filter,
  canWork,
}: {
  clientId: string
  base: string
  params: AivParams
  filter: Record<string, unknown>
  canWork: boolean
}) {
  const view = VIEWS.some((v) => v.key === params.view) ? params.view! : "gap"
  const typeFilter = params.q && view === "domains" ? params.q : null

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Sources views" className="flex w-fit max-w-full overflow-x-auto rounded-lg border bg-card p-0.5">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={aivHref(base, params, { view: v.key, q: null })}
            scroll={false}
            aria-current={view === v.key ? "page" : undefined}
            className={cn(
              "flex h-8 items-center rounded-md px-3 text-sm whitespace-nowrap",
              view === v.key ? "bg-foreground text-background dark:bg-muted dark:text-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      {view === "gap" && <GapView clientId={clientId} filter={filter} canWork={canWork} />}
      {view === "domains" && <DomainsView clientId={clientId} base={base} params={params} filter={filter} type={typeFilter} />}
      {view === "urls" && <UrlsView clientId={clientId} filter={filter} />}
    </div>
  )
}

async function GapView({ clientId, filter, canWork }: { clientId: string; filter: Record<string, unknown>; canWork: boolean }) {
  const rows = await getGap(clientId, filter, 50)
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No gaps in this range: there are no sites AI used in answers that name a competitor but not the client. Track more competitors or questions to find them.
      </div>
    )
  }
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Sites the AI platforms relied on in answers that name a competitor but not the client, best first. Getting the client onto these pages is the most direct way into those answers.
      </p>
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {rows.map((r) => (
          <li key={r.domain} className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.domain}</span>
                <TypeTag type={r.type} />
                <span className="text-xs text-muted-foreground tabular-nums">score {r.gapScore}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                Used in {r.gapAnswers} {r.gapAnswers === 1 ? "answer" : "answers"} naming {r.competitors.join(", ")}
              </span>
              <span className="flex flex-wrap gap-1">{r.models.map((m) => <ModelChip key={m} model={m} />)}</span>
              {r.prompts.length > 0 && <span className="text-xs text-muted-foreground">For example: “{r.prompts[0]}”</span>}
              {r.urls.length > 0 && (
                <span className="flex flex-col text-xs">
                  {r.urls.map((u) => (
                    <a key={u} href={u} target="_blank" rel="nofollow noopener noreferrer" className="truncate text-brand hover:underline">{u}</a>
                  ))}
                </span>
              )}
            </div>
            <div className="shrink-0">
              <SendToBacklinks
                clientId={clientId}
                canWork={canWork}
                inBacklinks={r.inBacklinks}
                site={{ domain: r.domain, url: r.urls[0] ?? null, type: r.type, answers: r.gapAnswers, competitors: r.competitors, models: r.models, actionId: r.actionId }}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

async function DomainsView({ clientId, base, params, filter, type }: { clientId: string; base: string; params: AivParams; filter: Record<string, unknown>; type: string | null }) {
  const PAGE = 50
  const d = await getSourceDomains(clientId, filter, type, PAGE, (params.page - 1) * PAGE)
  const types = Object.entries(d.types).sort((a, b) => b[1] - a[1])
  return (
    <>
      <div className="flex flex-wrap gap-1 text-xs">
        <Link href={aivHref(base, params, { view: "domains", q: null })} scroll={false} className={cn("rounded-md border px-2 py-1", !type && "border-primary/40 bg-brand-soft")}>All · {formatNumber(d.total)}</Link>
        {(["own", "competitor"] as const).map((t) => (
          <Link key={t} href={aivHref(base, params, { view: "domains", q: t })} scroll={false} className={cn("rounded-md border px-2 py-1", type === t && "border-primary/40 bg-brand-soft")}>
            {SOURCE_TYPE_LABEL[t]}
          </Link>
        ))}
        {types.map(([t, n]) => (
          <Link key={t} href={aivHref(base, params, { view: "domains", q: t })} scroll={false} className={cn("rounded-md border px-2 py-1", type === t && "border-primary/40 bg-brand-soft")}>
            {SOURCE_TYPE_LABEL[t as keyof typeof SOURCE_TYPE_LABEL] ?? t} · {n}
          </Link>
        ))}
      </div>
      <SourceTable
        head={["Domain", "Type", "Retrievals", "Read in", "Cited in", "Citation share", "Avg cite rank"]}
        rows={d.rows.map((r) => [
          <span key="d" className={cn(r.isOwn && "font-medium text-brand")}>{r.domain}</span>,
          <TypeTag key="t" type={r.isOwn ? "own" : r.brandId ? "competitor" : r.type} />,
          formatNumber(r.retrievals), pct(r.retrievedPct), pct(r.citedPct), pct(r.citationShare), r.avgCiteRank ?? "–",
        ])}
        empty="No sources in this range."
      />
      {d.total > PAGE && (
        <nav className="flex justify-between text-sm" aria-label="Pages">
          {params.page > 1 ? <Link href={aivHref(base, params, { page: params.page - 1 })} className="text-brand hover:underline">Previous</Link> : <span />}
          {params.page * PAGE < d.total ? <Link href={aivHref(base, params, { page: params.page + 1 })} className="text-brand hover:underline">Next</Link> : <span />}
        </nav>
      )}
      <p className="text-xs text-muted-foreground">Read in = answers where the AI used a page from the site. Cited in = answers that reference it inline. Brand visibility and source visibility can differ: a site can be used without being named.</p>
    </>
  )
}

async function UrlsView({ clientId, filter }: { clientId: string; filter: Record<string, unknown> }) {
  const d = await getSourceUrls(clientId, filter, null, 100, 0)
  return (
    <SourceTable
      head={["Page", "Retrievals", "Read in", "Cited in", "Citation share", "Avg cite rank"]}
      rows={d.rows.map((r) => [
        <span key="u" className="flex min-w-0 flex-col">
          <a href={r.url} target="_blank" rel="nofollow noopener noreferrer" className="truncate hover:underline">{r.title ?? r.url}</a>
          <span className="text-xs text-muted-foreground">{r.domain}</span>
        </span>,
        formatNumber(r.retrievals), pct(r.retrievedPct), pct(r.citedPct), pct(r.citationShare), r.avgCiteRank ?? "–",
      ])}
      empty="No pages in this range."
    />
  )
}

function SourceTable({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{empty}</div>
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn("px-3 py-2 font-medium", i === 0 || (i === 1 && head[1] === "Type") ? "text-left" : "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci} className={cn("px-3 py-2 tabular-nums", ci === 0 ? "max-w-[28rem]" : "", ci === 0 || (ci === 1 && head[1] === "Type") ? "text-left" : "text-right")}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
