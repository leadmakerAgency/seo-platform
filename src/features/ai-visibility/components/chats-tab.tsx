import { ExternalLink } from "lucide-react"
import Link from "next/link"

import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MODEL_META } from "../config"
import { getChat, getChats, type AivBrand } from "../queries"
import { aivHref, type AivParams } from "../search-params"
import { ModelChip, sentimentWord, TypeTag } from "./bits"
import { UrlSheet } from "./chat-sheet"
import { SafeAnswer } from "./safe-answer"

const PAGE = 25

export async function ChatsTab({
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
  const [page, chat] = await Promise.all([
    getChats(clientId, filter, { brand: params.brand, q: params.q, limit: PAGE, offset: (params.page - 1) * PAGE }),
    params.sheet ? getChat(params.sheet) : Promise.resolve(null),
  ])
  const own = brands.find((b) => b.isOwn)
  const pages = Math.max(1, Math.ceil(page.total / PAGE))
  const brandOf = new Map(brands.map((b) => [b.id, b]))

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-center gap-2" action={base}>
        {/* Plain GET form keeps the other filters in hidden fields. */}
        <input type="hidden" name="tab" value="chats" />
        {params.range !== "30d" && <input type="hidden" name="range" value={params.range} />}
        {params.models.length > 0 && <input type="hidden" name="models" value={params.models.join(",")} />}
        <input name="q" defaultValue={params.q ?? ""} placeholder="Search questions" className="h-8 w-60 rounded-md border bg-card px-2 text-sm" aria-label="Search questions" />
        <select name="brand" defaultValue={params.brand ?? ""} className="h-8 rounded-md border bg-card px-2 text-sm" aria-label="Answers that name">
          <option value="">Any brand</option>
          {brands.filter((b) => b.active).map((b) => (
            <option key={b.id} value={b.id}>Names {b.name}</option>
          ))}
        </select>
        <button type="submit" className="h-8 rounded-md border bg-card px-3 text-sm hover:bg-muted">Filter</button>
        <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(page.total)} answers</span>
      </form>

      {page.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No answers match. Try a longer range or other filters.</div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {page.rows.map((c) => (
            <li key={c.id}>
              <Link href={aivHref(base, params, { sheet: c.id, page: params.page })} scroll={false} className="flex flex-col gap-2 px-4 py-3 hover:bg-muted/40">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <ModelChip model={c.model} />
                  <span>{c.runDate}</span>
                  <span>{c.country}</span>
                  <span>{c.sources} sources</span>
                  {c.ownMentioned ? (
                    <span className="rounded-sm bg-brand-soft px-1.5 py-0.5 font-medium text-brand">Names {own?.name ?? "the client"}</span>
                  ) : (
                    <span className="rounded-sm bg-muted px-1.5 py-0.5">Client not named</span>
                  )}
                </div>
                <p className="text-sm">{c.prompt}</p>
                <div className="flex flex-wrap gap-1">
                  {c.mentions.map((m) => (
                    <span key={`${m.position}${m.name}`} className={cn("rounded-sm border px-1.5 py-0.5 text-xs", m.brandId && brandOf.get(m.brandId)?.isOwn && "border-primary/40 bg-brand-soft font-medium")}>
                      {m.position}. {m.name}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pages">
          {params.page > 1 ? <Link href={aivHref(base, params, { page: params.page - 1 })} className="text-brand hover:underline">Previous</Link> : <span />}
          <span className="text-muted-foreground tabular-nums">Page {params.page} of {pages}</span>
          {params.page < pages ? <Link href={aivHref(base, params, { page: params.page + 1 })} className="text-brand hover:underline">Next</Link> : <span />}
        </nav>
      )}

      <UrlSheet
        open={Boolean(chat)}
        closeHref={aivHref(base, params, { sheet: null, page: params.page })}
        title={chat?.prompt ?? "Answer"}
        description={chat ? `${MODEL_META[chat.model]?.label ?? chat.model} · ${chat.country}${chat.countryFallback ? " (no country search)" : ""} · ${chat.runDate}${chat.modelVersion ? ` · ${chat.modelVersion}` : ""}` : undefined}
      >
        {chat && <ChatBody chat={chat} brands={brands} />}
      </UrlSheet>
    </div>
  )
}

function ChatBody({ chat, brands }: { chat: NonNullable<Awaited<ReturnType<typeof getChat>>>; brands: AivBrand[] }) {
  const highlights = brands.filter((b) => b.active).flatMap((b) => b.trackedNames.map((n) => ({ name: n, own: b.isOwn })))
  const brandOf = new Map(brands.map((b) => [b.id, b]))
  const cited = chat.sources.filter((s) => s.cited)
  const readOnly = chat.sources.filter((s) => !s.cited)
  return (
    <>
      {chat.checkUrl && (
        <a href={chat.checkUrl} target="_blank" rel="nofollow noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-sm text-brand hover:underline">
          View on the platform <ExternalLink className="size-3.5" />
        </a>
      )}
      <section aria-label="Answer" className="rounded-lg border bg-muted/20 p-3">
        {chat.answer ? (
          <SafeAnswer text={chat.answer} highlights={highlights} />
        ) : (
          <p className="text-sm text-muted-foreground">{chat.status === "ok" ? "The answer text was removed after the retention period." : (chat.error ?? "No answer.")}</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Brands named, in order</h3>
        {chat.mentions.length ? (
          <ol className="flex flex-col gap-2">
            {chat.mentions.map((m) => {
              const b = m.brandId ? brandOf.get(m.brandId) : null
              return (
                <li key={`${m.position}${m.name}`} className="flex flex-col gap-0.5 rounded-md border p-2">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium tabular-nums">{m.position}.</span>
                    <span className={cn(b?.isOwn && "font-semibold text-brand")}>{m.name}</span>
                    {b ? <span className="text-xs text-muted-foreground">{b.isOwn ? "the client" : "tracked competitor"}</span> : <span className="text-xs text-muted-foreground">not tracked</span>}
                    {m.sentiment !== null && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{sentimentWord(m.sentiment)}</span>}
                  </span>
                  {m.quote && <span className="text-xs text-muted-foreground">“{m.quote}”</span>}
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{chat.analyzed ? "No brands named." : "Not read yet."}</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Cited in the answer · {cited.length}</h3>
        <SourceList list={cited} numbered />
        {readOnly.length > 0 && (
          <>
            <h3 className="mt-2 text-sm font-semibold">Read but not cited · {readOnly.length}</h3>
            <SourceList list={readOnly} />
          </>
        )}
      </section>

      {chat.fanOut.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Searches the AI ran</h3>
          <ul className="flex flex-wrap gap-1">
            {chat.fanOut.map((q) => <li key={q} className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">{q}</li>)}
          </ul>
        </section>
      )}

      {chat.ads.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Ads in this answer</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {chat.ads.map((a, i) => (
              <li key={i}>{a.advertiser ?? a.domain ?? "Advertiser"}{a.title ? ` · ${a.title}` : ""}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function SourceList({ list, numbered = false }: { list: { url: string; domain: string; title: string | null; type: string; citeRank: number | null }[]; numbered?: boolean }) {
  if (!list.length) return <p className="text-sm text-muted-foreground">None.</p>
  return (
    <ul className="flex flex-col divide-y rounded-md border">
      {list.map((s) => (
        <li key={s.url} className="flex items-start gap-2 px-2.5 py-2 text-sm">
          {numbered && <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{s.citeRank ?? "·"}</span>}
          <span className="flex min-w-0 flex-col">
            <a href={s.url} target="_blank" rel="nofollow noopener noreferrer" className="truncate hover:underline">{s.title ?? s.url}</a>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {s.domain} <TypeTag type={s.type} />
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
