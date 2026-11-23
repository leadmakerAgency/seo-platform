"use client"

import { Bot, Database, Plus, Swords, UserRound, X } from "@/components/icons"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { saveCompetitors } from "../actions"
import { cleanDomain, MAX_COMPETITORS, PLATFORMS } from "../competitors"
import type { AiCompetitor, AiQuota } from "../queries"
import { CompetitorBacklinksButton } from "./competitor-backlinks-dialog"

const SOURCE: Record<AiCompetitor["source"], { label: string; icon: typeof Bot }> = {
  ai: { label: "Found by AI", icon: Bot },
  dataforseo: { label: "Same keywords", icon: Database },
  team: { label: "Added by the team", icon: UserRound },
}

/**
 * The client's top competitors (≤ 5 used). Competitor backlinks compares their links; the AI
 * search and DataForSEO suggest more. Anyone who can find places can edit the list.
 */
export function CompetitorsCard({
  clientId,
  quota,
  canEdit,
  canRefresh,
  disabledReason,
}: {
  clientId: string
  quota: AiQuota
  canEdit: boolean
  canRefresh: boolean
  disabledReason: string | null
}) {
  const saved = quota.competitors
  const initial = useMemo(() => saved.filter((c) => c.active).map((c) => c.domain), [saved])
  const [active, setActive] = useState<string[]>(initial)
  const [extra, setExtra] = useState<{ domain: string; name: string | null }[]>([])
  const [draft, setDraft] = useState("")
  const [pending, startTransition] = useTransition()

  const all = [...saved, ...extra.filter((e) => !saved.some((s) => s.domain === e.domain)).map((e) => ({ ...e, id: e.domain, source: "team" as const, active: true, evidence: {} }))]
  const byDomain = new Map(all.map((c) => [c.domain, c]))
  const suggestions = all.filter((c) => !active.includes(c.domain)).slice(0, 8)
  const dirty = active.join("|") !== initial.join("|")
  const full = active.length >= MAX_COMPETITORS

  function add() {
    const d = cleanDomain(draft)
    if (!d) {
      toast.error("Use a domain like competitor.com.")
      return
    }
    if (PLATFORMS.has(d)) {
      toast.error(`${d} is a big platform, not a competitor.`)
      return
    }
    if (active.includes(d)) {
      setDraft("")
      return
    }
    if (full) {
      toast.error(`Keep ${MAX_COMPETITORS} competitors at most. Take one off first.`)
      return
    }
    if (!byDomain.has(d)) setExtra((x) => [...x, { domain: d, name: null }])
    setActive((a) => [...a, d])
    setDraft("")
  }

  function save() {
    startTransition(async () => {
      const r = await saveCompetitors(
        clientId,
        active.map((d) => ({ domain: d, name: byDomain.get(d)?.name ?? null })),
      )
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success("Competitors saved")
      setExtra([])
    })
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4" aria-labelledby="ai-competitors-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="ai-competitors-title" className="flex items-center gap-2 text-[15px] leading-[22px] font-semibold">
            <Swords className="size-4 text-muted-foreground" aria-hidden />
            Competitors
            <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
              {active.length}/{MAX_COMPETITORS}
            </span>
          </h2>
          <p className="max-w-[72ch] text-sm text-muted-foreground">
            Competitor backlinks finds the sites that link to these but not to the client, ranked by how many of them
            each site links to.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && dirty && (
            <Button size="sm" variant="outline" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save list"}
            </Button>
          )}
          {canEdit && (
            <CompetitorBacklinksButton
              clientId={clientId}
              quota={quota}
              preselected={active}
              unsaved={dirty}
              canRefresh={canRefresh}
              disabledReason={disabledReason}
            />
          )}
        </div>
      </div>

      {active.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
          No competitors yet. The next Shockwave AI Search finds them for each place, or add them here.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {active.map((d, i) => {
            const c = byDomain.get(d)
            const S = SOURCE[c?.source ?? "team"]
            return (
              <li
                key={d}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background py-1 pr-1 pl-2 text-sm"
              >
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="font-medium">{d}</span>
                {c?.name && c.name !== d && <span className="hidden text-xs text-muted-foreground sm:inline">{c.name}</span>}
                <S.icon className="size-3 text-muted-foreground" aria-label={S.label} />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setActive((a) => a.filter((x) => x !== d))}
                    className="rounded p-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
                    aria-label={`Take ${d} off the list`}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canEdit && (
        <div className="flex flex-col gap-2">
          <form
            className="flex max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="competitor.com"
              aria-label="Add a competitor"
              className="h-8"
              maxLength={253}
            />
            <Button type="submit" size="sm" variant="outline" disabled={!draft.trim() || full}>
              <Plus className="size-3.5" aria-hidden />
              Add
            </Button>
          </form>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Suggested:</span>
              {suggestions.map((c) => {
                const S = SOURCE[c.source]
                return (
                  <button
                    key={c.domain}
                    type="button"
                    disabled={full}
                    onClick={() => setActive((a) => (a.includes(c.domain) ? a : [...a, c.domain]))}
                    title={S.label}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-muted-foreground outline-none hover:border-solid hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35",
                      full && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <S.icon className="size-3" aria-hidden />
                    {c.domain}
                    <Plus className="size-3" aria-hidden />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
