"use client"

import {
  ArrowDownUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { displayUrl, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { reviewPlaces } from "../actions"
import {
  FILTER_LABELS,
  REJECT_LABELS,
  TYPE_LABELS,
  type DirectoryType,
  type Tab,
  tabOf,
} from "../constants"
import type { Place } from "../queries"
import { CheckStrengthButton, RejectDialog } from "./backlink-dialogs"
import { formatDay, Spam, Strength, TypeTag, whyChosen } from "./bits"
import { PlaceSheet } from "./place-sheet"

type SortKey = "score" | "name" | "strength" | "found"

const PAGE = 50

/** One tab of the Backlinks page: filters, the table, bulk actions and the place sheet. */
export function BacklinksView({
  places,
  tab,
  clientId,
  target,
  canReview,
  canStrength,
  canForce,
  canLibrary,
  strengthBlocked,
  placeLabels,
  initialPlace,
}: {
  /** Every place of this client; the view picks the tab's rows. */
  places: Place[]
  tab: Tab
  clientId: string
  /** The client's monthly backlinks target (a line after that many rows). */
  target: number
  canReview: boolean
  canStrength: boolean
  canForce: boolean
  canLibrary: boolean
  strengthBlocked: string | null
  /** The client's places (backlink_targets) by id, for "Found for" and the filter. */
  placeLabels: Record<string, string>
  /** ?place=<id> from the URL. */
  initialPlace: string | null
}) {
  const [query, setQuery] = useState("")
  const [type, setType] = useState<DirectoryType | "all">("all")
  const [placeFilter, setPlaceFilter] = useState<string>(
    initialPlace && placeLabels[initialPlace] ? initialPlace : "all",
  )
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)
  const [rejectIds, setRejectIds] = useState<string[] | null>(null)
  const [pending, startTransition] = useTransition()

  const inTab = useMemo(() => places.filter((p) => tabOf(p) === tab), [places, tab])
  const types = useMemo(() => [...new Set(inTab.map((p) => p.type))].sort(), [inTab])
  const placeIds = useMemo(
    () => Object.keys(placeLabels).filter((id) => inTab.some((p) => p.targetIds.includes(id))),
    [inTab, placeLabels],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = inTab.filter(
      (p) =>
        (type === "all" || p.type === type) &&
        (placeFilter === "all" || p.targetIds.includes(placeFilter)) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.site.includes(q) ||
          p.hits.some((h) => h.query.includes(q))),
    )
    const value = (p: Place): number | string | null => {
      switch (sort.key) {
        case "name":
          return p.name.toLowerCase()
        case "strength":
          return p.authority
        case "found":
          return p.createdAt
        default:
          return p.score
      }
    }
    return [...filtered].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      if (va === vb) return b.score - a.score || a.name.localeCompare(b.name)
      if (va === null) return 1
      if (vb === null) return -1
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * sort.dir
      return ((va as number) - (vb as number)) * sort.dir
    })
  }, [inTab, query, type, placeFilter, sort])

  const visible = rows.slice(0, shown)
  const selectedIds = [...selected].filter((id) => rows.some((r) => r.id === id))
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id))
  const open = places.find((p) => p.id === openId) ?? null
  const ranked =
    tab === "review" &&
    sort.key === "score" &&
    sort.dir === -1 &&
    type === "all" &&
    placeFilter === "all" &&
    !query.trim()

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function bulk(decision: "approve" | "restore" | "promote") {
    const ids = selectedIds
    startTransition(async () => {
      const r = await reviewPlaces(ids, decision)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(
        `${decision === "approve" ? "Approved" : decision === "promote" ? "Moved to the top 30:" : "Moved back:"} ${formatNumber(r.data.changed)} ${r.data.changed === 1 ? "place" : "places"}.`,
      )
      setSelected(new Set())
    })
  }

  function header(key: SortKey, label: string, align: "left" | "right" = "left") {
    const active = sort.key === key
    return (
      <th
        className={cn("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left")}
        aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
      >
        <button
          type="button"
          onClick={() =>
            setSort((s) =>
              s.key === key
                ? { key, dir: (s.dir * -1) as 1 | -1 }
                : { key, dir: key === "name" ? 1 : -1 },
            )
          }
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground",
            active && "text-foreground",
          )}
        >
          {label}
          {active ? (
            sort.dir === 1 ? (
              <ChevronUp className="size-3" aria-hidden />
            ) : (
              <ChevronDown className="size-3" aria-hidden />
            )
          ) : (
            <ArrowDownUp className="size-3 opacity-50" aria-hidden />
          )}
        </button>
      </th>
    )
  }

  const reviewable = canReview && tab !== "hidden"
  const columns = 9 + (canReview ? 1 : 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a site or search"
            aria-label="Find a site or search"
            className="h-8 w-full rounded-lg border border-input bg-card pr-3 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35"
          />
        </div>
        {types.length > 1 && (
          <Select value={type} onValueChange={(v) => setType(v as DirectoryType | "all")}>
            <SelectTrigger size="sm" className="w-48" aria-label="Type of site">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Every type</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {placeIds.length > 1 && (
          <Select value={placeFilter} onValueChange={setPlaceFilter}>
            <SelectTrigger size="sm" className="w-52" aria-label="Found for which place">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Every place</SelectItem>
              {placeIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {placeLabels[id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="ml-auto text-[13px] text-muted-foreground tabular-nums">
          {formatNumber(rows.length)} {rows.length === 1 ? "place" : "places"}
        </p>
      </div>

      {canReview && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-brand-soft px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">
            {formatNumber(selectedIds.length)} selected
          </span>
          {tab !== "approved" && (
            <Button size="sm" onClick={() => bulk("approve")} disabled={pending}>
              <Check /> Approve
            </Button>
          )}
          {tab !== "rejected" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRejectIds(selectedIds)}
              disabled={pending}
            >
              <X /> Reject…
            </Button>
          )}
          {tab === "more" && (
            <Button size="sm" variant="outline" onClick={() => bulk("promote")} disabled={pending}>
              <RotateCcw /> Move to the top 30
            </Button>
          )}
          {(tab === "approved" || tab === "rejected" || tab === "hidden") && (
            <Button size="sm" variant="outline" onClick={() => bulk("restore")} disabled={pending}>
              <RotateCcw /> Back to review
            </Button>
          )}
          {canStrength && (
            <CheckStrengthButton
              clientId={clientId}
              ids={selectedIds}
              disabledReason={strengthBlocked}
              label="Check strength"
              variant="ghost"
              onDone={() => setSelected(new Set())}
            />
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              {canReview && (
                <th className="w-9 px-3 py-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) =>
                      setSelected((s) => {
                        const next = new Set(s)
                        for (const r of visible) {
                          if (v) next.add(r.id)
                          else next.delete(r.id)
                        }
                        return next
                      })
                    }
                    aria-label="Select every place shown"
                  />
                </th>
              )}
              <th className="w-10 px-2 py-2 text-right font-medium">#</th>
              {header("name", "Site")}
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Found for</th>
              <th className="px-3 py-2 text-left font-medium">
                {tab === "hidden"
                  ? "Why hidden"
                  : tab === "rejected"
                    ? "Why rejected"
                    : "Why chosen"}
              </th>
              {header("strength", "Site strength")}
              <th className="px-3 py-2 text-left font-medium">Spam</th>
              {header("score", "Score", "right")}
              {header("found", "Found", "right")}
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((p, i) => (
              <tr
                key={p.id}
                className={cn(
                  "hover:bg-muted/60",
                  (openId === p.id || selected.has(p.id)) && "bg-brand-soft hover:bg-brand-soft",
                  ranked &&
                    i === target - 1 &&
                    rows.length > target &&
                    "border-b-2 border-b-primary/40",
                )}
              >
                {canReview && (
                  <td className="px-3 py-2 align-top">
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggle(p.id)}
                      aria-label={`Select ${p.name}`}
                    />
                  </td>
                )}
                <td className="px-2 py-2 text-right align-top text-muted-foreground tabular-nums">
                  {tab === "review" && p.shortlistRank ? p.shortlistRank : i + 1}
                </td>
                <td className="max-w-[280px] px-3 py-2 align-top">
                  <button
                    type="button"
                    onClick={() => setOpenId(p.id)}
                    className="flex flex-col items-start gap-0.5 text-left outline-none focus-visible:underline"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {p.site}
                      {p.isCore && (
                        <StatusTag tone="brand" dot={false}>
                          Core listing
                        </StatusTag>
                      )}
                    </span>
                  </button>
                  {p.foundUrl && (
                    <a
                      href={p.foundUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-0.5 inline-flex max-w-full items-center gap-0.5 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      <span className="truncate">{displayUrl(p.foundUrl)}</span>
                      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                    </a>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <TypeTag type={p.type} />
                </td>
                <td className="max-w-[200px] px-3 py-2 align-top">
                  <FoundFor place={p} labels={placeLabels} />
                </td>
                <td className="max-w-[280px] px-3 py-2 align-top text-[13px] text-muted-foreground">
                  {tab === "hidden" && p.filterReason ? (
                    <>
                      {FILTER_LABELS[p.filterReason]}
                      {p.aiReason && <span className="block text-xs">{p.aiReason}</span>}
                    </>
                  ) : tab === "rejected" && p.rejectReason ? (
                    `${REJECT_LABELS[p.rejectReason]}${p.rejectNote ? `: ${p.rejectNote}` : ""}`
                  ) : (
                    <WhyCell place={p} />
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <Strength place={p} />
                </td>
                <td className="px-3 py-2 align-top">
                  <Spam spam={p.spam} />
                </td>
                <td className="px-3 py-2 text-right align-top font-medium tabular-nums">
                  {p.score}
                </td>
                <td className="px-3 py-2 text-right align-top whitespace-nowrap text-muted-foreground tabular-nums">
                  {formatDay(p.createdAt)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns} className="px-3 py-6 text-sm text-muted-foreground">
                  {inTab.length === 0 ? emptyText(tab) : "No places match."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {ranked && rows.length > target && (
        <p className="text-xs text-muted-foreground">
          The line after #{formatNumber(target)} marks this client&apos;s monthly target of{" "}
          {formatNumber(target)} listings.
        </p>
      )}
      {rows.length > shown && (
        <Button variant="outline" className="self-start" onClick={() => setShown((n) => n + PAGE)}>
          Show {formatNumber(Math.min(PAGE, rows.length - shown))} more
        </Button>
      )}
      {!reviewable && tab === "hidden" && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          The search hid these. Open one to approve it or send it back to review if the search got
          it wrong.
        </p>
      )}

      <PlaceSheet
        place={open}
        clientId={clientId}
        canReview={canReview}
        canStrength={canStrength}
        canForce={canForce}
        canLibrary={canLibrary}
        strengthBlocked={strengthBlocked}
        placeLabels={placeLabels}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
      {rejectIds && (
        <RejectDialog
          ids={rejectIds}
          open={Boolean(rejectIds)}
          onOpenChange={(o) => !o && setRejectIds(null)}
          onDone={() => setSelected(new Set())}
        />
      )}
    </div>
  )
}

function emptyText(tab: Tab) {
  switch (tab) {
    case "approved":
      return "Nothing approved yet. Approve places from Pending review."
    case "rejected":
      return "Nothing rejected."
    case "hidden":
      return "The searches haven't hidden anything."
    default:
      return "Nothing waiting for review."
  }
}

/** The client's places whose searches found this site ("Core listing" for core ones). */
function FoundFor({ place, labels }: { place: Place; labels: Record<string, string> }) {
  const names = place.targetIds.map((id) => labels[id]).filter(Boolean)
  if (names.length === 0) {
    return (
      <span className="text-[13px] text-muted-foreground">
        {place.isCore ? "Every place" : place.hits.length ? "Industry search" : "—"}
      </span>
    )
  }
  return (
    <span className="flex flex-wrap gap-1">
      {names.slice(0, 3).map((n) => (
        <span key={n} className="rounded-sm bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
          {n}
        </span>
      ))}
      {names.length > 3 && (
        <span className="text-[11px] text-muted-foreground">+{names.length - 3}</span>
      )}
    </span>
  )
}

/** Claude's one-line reason when there is one, else how the search found the place. */
function WhyCell({ place }: { place: Place }) {
  return (
    <span className="flex flex-col gap-0.5">
      {place.aiReason ? (
        <span className="text-foreground">{place.aiReason}</span>
      ) : (
        <span>{whyChosen(place)}</span>
      )}
      <span className="flex flex-wrap gap-x-2 text-xs">
        {place.matchedTopic && <span>Matches: {place.matchedTopic}</span>}
        {place.aiFit !== null && <span>Fit {place.aiFit}/5</span>}
        {place.aiReason && place.hits.length > 0 && <span>{whyChosen(place)}</span>}
      </span>
    </span>
  )
}
