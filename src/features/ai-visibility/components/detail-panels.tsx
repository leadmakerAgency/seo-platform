import Link from "next/link"

import { cn } from "@/lib/utils"
import { MODEL_META } from "../config"
import { getPromptDetail, getSourceDetail, getTrend, type AivBrand, type AivPrompt } from "../queries"
import { aivHref, type AivParams } from "../search-params"
import { ModelChip, TypeTag } from "./bits"
import { UrlSheet } from "./chat-sheet"
import { TrendChart } from "./trend-chart"

/** The question panel (Questions tab, ?sheet=<question id>): latest answer per platform and its trend. */
export async function PromptPanel({
  clientId,
  base,
  params,
  filter,
  prompt,
  brands,
}: {
  clientId: string
  base: string
  params: AivParams
  filter: Record<string, unknown>
  prompt: AivPrompt | null
  brands: AivBrand[]
}) {
  const [latest, trend] = prompt
    ? await Promise.all([getPromptDetail(prompt.id), getTrend(clientId, { ...filter, prompt_ids: [prompt.id] }, "week")])
    : [[], []]
  const shown = brands.filter((b) => b.active).slice(0, 8)
  const ids = new Set(shown.map((b) => b.id))
  return (
    <UrlSheet
      open={Boolean(prompt)}
      closeHref={aivHref(base, params, { sheet: null })}
      title={prompt?.text ?? "Question"}
      description={prompt ? `${prompt.country}${prompt.branded ? " · names the client" : ""}` : undefined}
    >
      {prompt && (
        <>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Latest answer on each platform</h3>
            {latest.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not asked yet. It runs in the next check.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {latest.map((l) => (
                  <li key={l.chatId}>
                    <Link href={aivHref(base, { ...params, tab: "chats" }, { sheet: l.chatId })} scroll={false} className="flex flex-col gap-1.5 px-3 py-2.5 hover:bg-muted/40">
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <ModelChip model={l.model} />
                        {l.runDate}
                        {l.status !== "ok" ? (
                          <span>{l.status === "empty" ? "No answer" : `Failed${l.error ? `: ${l.error}` : ""}`}</span>
                        ) : l.ownMentioned ? (
                          <span className="rounded-sm bg-brand-soft px-1.5 py-0.5 font-medium text-brand">Client named #{l.ownPosition ?? "?"}</span>
                        ) : (
                          <span className="rounded-sm bg-muted px-1.5 py-0.5">Client not named</span>
                        )}
                        <span>{l.sources} sources</span>
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {l.mentions.map((m) => (
                          <span key={`${m.position}${m.name}`} className={cn("rounded-sm border px-1.5 py-0.5 text-xs", m.brandId && brands.find((b) => b.id === m.brandId)?.isOwn && "border-primary/40 bg-brand-soft font-medium")}>
                            {m.position}. {m.name}
                          </span>
                        ))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">This question over time</h3>
            <TrendChart
              points={trend.filter((t) => ids.has(t.brandId))}
              series={shown.map((b) => ({ brandId: b.id, name: b.name, slot: b.colorSlot, isOwn: b.isOwn }))}
            />
          </section>
        </>
      )}
    </UrlSheet>
  )
}

/** The source panel (Sources tab, ?site=<domain>): questions and platforms that used it, its pages, weeks. */
export async function SourcePanel({ clientId, base, params, filter }: { clientId: string; base: string; params: AivParams; filter: Record<string, unknown> }) {
  const d = params.site ? await getSourceDetail(clientId, filter, params.site) : null
  const maxWeek = Math.max(1, ...(d?.weeks ?? []).map((w) => w.answers))
  return (
    <UrlSheet open={Boolean(d)} closeHref={aivHref(base, params, { site: null })} title={d?.domain ?? "Site"} description={d ? `Used in ${d.answers} answers · cited in ${d.cited}` : undefined}>
      {d && (
        <>
          <div><TypeTag type={d.type} /></div>
          {d.weeks.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Answers that used it, by week</h3>
              <ul className="flex flex-col gap-1">
                {d.weeks.map((w) => (
                  <li key={w.week} className="flex items-center gap-2 text-xs tabular-nums">
                    <span className="w-20 shrink-0 text-muted-foreground">{w.week}</span>
                    <span className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(4, (100 * w.answers) / maxWeek)}%` }} aria-hidden />
                    <span>{w.answers}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Questions where AI used it</h3>
            <ul className="flex flex-col divide-y rounded-lg border">
              {d.prompts.map((p) => (
                <li key={p.promptId} className="flex flex-col gap-1 px-3 py-2 text-sm">
                  <span>{p.text}</span>
                  <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {p.models.map((m) => <ModelChip key={m} model={m} />)}
                    <span className="tabular-nums">{p.answers} answers · cited in {p.cited} · last {p.lastDate}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Its pages</h3>
            <ul className="flex flex-col divide-y rounded-lg border">
              {d.urls.map((u) => (
                <li key={u.url} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <a href={u.url} target="_blank" rel="nofollow noopener noreferrer" className="min-w-0 truncate hover:underline">{u.title ?? u.url}</a>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{u.answers} · cited {u.cited}</span>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-xs text-muted-foreground">
            {MODEL_META.chatgpt.label} and {MODEL_META.gemini.label} list the pages they read and the pages they cite separately; the other platforms only list cited pages.
          </p>
        </>
      )}
    </UrlSheet>
  )
}
