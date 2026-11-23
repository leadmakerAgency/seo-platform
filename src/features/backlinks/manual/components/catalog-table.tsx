"use client"

import { ArrowUpRight, BadgeCheck, Download, Plus, Search, TriangleAlert } from "@/components/icons"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Strength } from "../../components/bits"
import {
  reviewCatalogSuggestion,
  saveCatalogSite,
  verifyCatalogSite,
  type CatalogInput,
} from "../actions"
import {
  BENEFIT_LABELS,
  BENEFITS,
  CATEGORIES,
  CATEGORY_LABELS,
  LINK_KINDS,
  LINK_LABELS,
  NEED_LABELS,
  NEEDS,
  PRICING_META,
  PRICINGS,
  PRIORITY_LABELS,
  type CatalogCategory,
} from "../constants"
import type { CatalogEntry, CatalogUsage } from "../queries"
import { Chip, formatStamp, LinkTag, PricingTag } from "./bits"

type View = "active" | "suggestions" | "problems" | "unchecked" | "retired"

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`

export function CatalogTable({
  sites,
  usage,
  canEdit,
}: {
  sites: CatalogEntry[]
  usage: CatalogUsage
  canEdit: boolean
}) {
  const [q, setQ] = useState("")
  const [view, setView] = useState<View>("active")
  const [category, setCategory] = useState<"all" | CatalogCategory>("all")
  const [country, setCountry] = useState("all")
  const [editing, setEditing] = useState<CatalogEntry | "new" | null>(null)

  const countries = useMemo(() => [...new Set(sites.flatMap((s) => s.countries))].sort(), [sites])
  const counts = {
    active: sites.filter((s) => s.active).length,
    suggestions: sites.filter((s) => s.suggestionStatus === "pending").length,
    problems: sites.filter((s) => s.problemNote).length,
    unchecked: sites.filter((s) => s.active && !s.verifiedAt).length,
    retired: sites.filter((s) => !s.active && s.suggestionStatus !== "pending").length,
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return sites.filter((s) => {
      if (view === "active" && !s.active) return false
      if (view === "suggestions" && s.suggestionStatus !== "pending") return false
      if (view === "problems" && !s.problemNote) return false
      if (view === "unchecked" && (!s.active || s.verifiedAt)) return false
      if (view === "retired" && (s.active || s.suggestionStatus === "pending")) return false
      if (category !== "all" && s.category !== category) return false
      if (country === "any" && s.countries.length > 0) return false
      if (country !== "all" && country !== "any" && !s.countries.includes(country)) return false
      if (needle && !`${s.name} ${s.host} ${s.industries.join(" ")}`.toLowerCase().includes(needle))
        return false
      return true
    })
  }, [sites, view, category, country, q])

  function exportCsv() {
    const head = [
      "Name",
      "Host",
      "Category",
      "Kind",
      "Countries",
      "Cost",
      "Price note",
      "Usual link",
      "Priority",
      "Start URL",
      "Notes",
    ]
    const lines = rows.map((s) =>
      [
        s.name,
        s.host,
        CATEGORY_LABELS[s.category],
        s.kind,
        s.countries.join(" ") || "Any",
        PRICING_META[s.pricing].label,
        s.priceNote,
        LINK_LABELS[s.typicalLink],
        PRIORITY_LABELS[s.priority],
        s.submitUrl || s.homeUrl,
        s.notes,
      ]
        .map(csvCell)
        .join(","),
    )
    const blob = new Blob([[head.map(csvCell).join(","), ...lines].join("\n")], {
      type: "text/csv",
    })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "backlink-catalog.csv"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          onValueChange={(v) => v && setView(v as View)}
          aria-label="Which sites"
        >
          <ToggleGroupItem value="active">
            Active <span className="text-muted-foreground tabular-nums">{counts.active}</span>
          </ToggleGroupItem>
          {canEdit && (
            <>
              <ToggleGroupItem value="suggestions">
                Suggestions{" "}
                <span
                  className={cn(
                    "tabular-nums",
                    counts.suggestions ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {counts.suggestions}
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem value="problems">
                Reported{" "}
                <span
                  className={cn(
                    "tabular-nums",
                    counts.problems ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {counts.problems}
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem value="unchecked">
                Not checked{" "}
                <span className="text-muted-foreground tabular-nums">{counts.unchecked}</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="retired">
                Retired <span className="text-muted-foreground tabular-nums">{counts.retired}</span>
              </ToggleGroupItem>
            </>
          )}
        </ToggleGroup>
        <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
          <SelectTrigger size="sm" className="w-[200px]" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Every category</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger size="sm" className="w-[150px]" aria-label="Country">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Every country</SelectItem>
            <SelectItem value="any">Worldwide only</SelectItem>
            {countries.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-full sm:w-56">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="h-8 pl-8"
            aria-label="Search the catalog"
          />
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download /> CSV
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus /> Add a site
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {view === "suggestions"
            ? "No suggestions from VAs right now."
            : view === "problems"
              ? "Nothing reported."
              : "No sites match."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Countries</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Usual link</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Strength</TableHead>
                <TableHead className="text-right">Clients</TableHead>
                <TableHead>Checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const u = usage[s.id]
                return (
                  <TableRow
                    key={s.id}
                    className={cn(canEdit && "cursor-pointer")}
                    onClick={() => canEdit && setEditing(s)}
                  >
                    <TableCell className="max-w-[260px]">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className="truncate">{s.name}</span>
                          {s.kind === "play" && <Chip tone="brand">Play</Chip>}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {s.host || "Find the local site"}
                        </span>
                        {s.problemNote && (
                          <span className="flex items-start gap-1 text-xs text-warning">
                            <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
                            {s.problemNote}
                            {s.problemBy ? ` (${s.problemBy})` : ""}
                          </span>
                        )}
                        {s.suggestionStatus === "pending" && (
                          <span className="text-xs text-warning">
                            Suggested by {s.suggestedBy ?? "a VA"}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-[13px]">{CATEGORY_LABELS[s.category]}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {s.countries.join(", ") || "Any"}
                    </TableCell>
                    <TableCell>
                      <PricingTag pricing={s.pricing} note={s.priceNote} />
                    </TableCell>
                    <TableCell>
                      <LinkTag kind={s.typicalLink} actual />
                    </TableCell>
                    <TableCell className="text-[13px]">{PRIORITY_LABELS[s.priority]}</TableCell>
                    <TableCell>
                      <Strength
                        place={{ authority: s.authority, authorityStatus: s.authorityStatus }}
                        className="text-[13px]"
                      />
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums">
                      {u ? (
                        <span title={`${u.picked} picked, ${u.live} live`}>
                          {formatNumber(u.picked)}
                          {u.live > 0 && (
                            <span className="text-success"> · {formatNumber(u.live)} live</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {s.verifiedAt ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <BadgeCheck className="size-3.5" aria-hidden />{" "}
                          {formatStamp(s.verifiedAt).split(",")[0]}
                        </span>
                      ) : (
                        "Not yet"
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Costs and link types change. A site stays &ldquo;Not checked&rdquo; until someone confirms
        its start page, cost and link type and marks it checked.
      </p>

      {canEdit && <CatalogEditSheet entry={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function toInput(e: CatalogEntry | null): CatalogInput {
  return {
    id: e?.id,
    url: "",
    name: e?.name ?? "",
    kind: e?.kind ?? "site",
    category: e?.category ?? "citation",
    homeUrl: e?.homeUrl ?? "",
    submitUrl: e?.submitUrl ?? "",
    countries: e?.countries ?? [],
    reach: (e?.reach ?? []) as CatalogInput["reach"],
    buyer: (e?.buyer ?? []) as CatalogInput["buyer"],
    offering: (e?.offering ?? []) as CatalogInput["offering"],
    industries: e?.industries ?? [],
    pricing: e?.pricing ?? "free",
    priceNote: e?.priceNote ?? "",
    typicalLink: e?.typicalLink ?? "unknown",
    priority: e?.priority ?? 2,
    benefits: e?.benefits ?? [],
    needs: e?.needs ?? [],
    howTo: e?.howTo ?? "",
    warnings: e?.warnings ?? "",
    notes: e?.notes ?? "",
    active: e?.active ?? true,
  }
}

function CatalogEditSheet({
  entry,
  onClose,
}: {
  entry: CatalogEntry | "new" | null
  onClose: () => void
}) {
  return (
    <Sheet open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        {entry !== null && (
          <EditBody
            key={entry === "new" ? "new" : entry.id}
            entry={entry === "new" ? null : entry}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function Checks<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string
  options: readonly T[]
  labels: Record<string, string>
  value: T[]
  onChange: (v: T[]) => void
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {options.map((o) => (
          <span key={o} className="flex items-center gap-1.5">
            <Checkbox
              id={`${label}-${o}`}
              checked={value.includes(o)}
              onCheckedChange={(v) =>
                onChange(v === true ? [...value, o] : value.filter((x) => x !== o))
              }
            />
            <Label htmlFor={`${label}-${o}`} className="text-[13px] font-normal">
              {labels[o] ?? o}
            </Label>
          </span>
        ))}
      </div>
    </fieldset>
  )
}

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)

function EditBody({ entry, onClose }: { entry: CatalogEntry | null; onClose: () => void }) {
  const [f, setF] = useState<CatalogInput>(() => toInput(entry))
  const [countriesText, setCountriesText] = useState((entry?.countries ?? []).join(", "))
  const [industriesText, setIndustriesText] = useState((entry?.industries ?? []).join(", "))
  const [pending, startTransition] = useTransition()
  const set = <K extends keyof CatalogInput>(k: K, v: CatalogInput[K]) =>
    setF((prev) => ({ ...prev, [k]: v }))

  function save(extra?: Partial<CatalogInput>, done = "Saved.") {
    startTransition(async () => {
      const r = await saveCatalogSite({
        ...f,
        ...extra,
        countries: splitList(countriesText).map((c) => c.toUpperCase()),
        industries: splitList(industriesText).map((c) => c.toLowerCase()),
      })
      if (!r.ok) toast.error(r.error)
      else {
        toast.success(done)
        onClose()
      }
    })
  }

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle>{entry ? entry.name : "Add a site to the catalog"}</SheetTitle>
        <SheetDescription>
          {entry ? (
            <span className="flex flex-wrap items-center gap-2">
              {entry.host}
              {entry.verifiedAt ? (
                <StatusTag tone="success">
                  Checked {formatStamp(entry.verifiedAt).split(",")[0]}
                </StatusTag>
              ) : (
                <StatusTag tone="neutral">Not checked</StatusTag>
              )}
              {(entry.submitUrl || entry.homeUrl) && (
                <a
                  href={entry.submitUrl || entry.homeUrl || undefined}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-brand underline underline-offset-2"
                >
                  Open <ArrowUpRight className="size-3" aria-hidden />
                </a>
              )}
            </span>
          ) : (
            "Every client whose brief fits will see it in Add from catalog."
          )}
        </SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {entry?.problemNote && (
          <p className="rounded-md border border-warning/30 bg-warning-soft p-2.5 text-[13px] text-warning">
            Reported{entry.problemBy ? ` by ${entry.problemBy}` : ""}: {entry.problemNote}. Fix it,
            then mark it checked to clear the report.
          </p>
        )}
        {!entry && (
          <Field>
            <FieldLabel htmlFor="cat-url">
              {f.kind === "play" ? "Where to start (optional)" : "Website"}
            </FieldLabel>
            <Input
              id="cat-url"
              value={f.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://www.example.com"
            />
            <FieldDescription>
              {f.kind === "play"
                ? "A play has no fixed site: the VA records the local site they use."
                : "The site's address. One catalog entry per site."}
            </FieldDescription>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="cat-name">Name</FieldLabel>
            <Input
              id="cat-name"
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field>
            <FieldLabel>Kind</FieldLabel>
            <Select
              value={f.kind}
              onValueChange={(v) => set("kind", v as "site" | "play")}
              disabled={Boolean(entry)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="site">A site</SelectItem>
                <SelectItem value="play">A play (find the local site)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Category</FieldLabel>
            <Select value={f.category} onValueChange={(v) => set("category", v as CatalogCategory)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Priority</FieldLabel>
            <Select value={String(f.priority)} onValueChange={(v) => set("priority", Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {PRIORITY_LABELS[n]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Cost</FieldLabel>
            <Select
              value={f.pricing}
              onValueChange={(v) => set("pricing", v as CatalogInput["pricing"])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICINGS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRICING_META[p].label} · {PRICING_META[p].help}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Usual link</FieldLabel>
            <Select
              value={f.typicalLink}
              onValueChange={(v) => set("typicalLink", v as CatalogInput["typicalLink"])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINK_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {LINK_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="cat-price">Price note</FieldLabel>
          <Input
            id="cat-price"
            value={f.priceNote}
            onChange={(e) => set("priceNote", e.target.value)}
            maxLength={160}
            placeholder="Free listing; Pro ≈ $149/mo"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="cat-home">Home page</FieldLabel>
            <Input
              id="cat-home"
              value={f.homeUrl}
              onChange={(e) => set("homeUrl", e.target.value)}
              placeholder="https://"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cat-submit">Start / submit page</FieldLabel>
            <Input
              id="cat-submit"
              value={f.submitUrl}
              onChange={(e) => set("submitUrl", e.target.value)}
              placeholder="https://"
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="cat-countries">Countries</FieldLabel>
          <Input
            id="cat-countries"
            value={countriesText}
            onChange={(e) => setCountriesText(e.target.value)}
            placeholder="US, CA (empty = any country)"
          />
          <FieldDescription>
            Two-letter codes. Matched against the countries of each client&apos;s places in the
            brief.
          </FieldDescription>
        </Field>
        <Checks
          label="Reach"
          options={["local", "national", "global"] as const}
          labels={{ local: "Local", national: "National", global: "Global" }}
          value={f.reach}
          onChange={(v) => set("reach", v)}
        />
        <Checks
          label="Buyers"
          options={["b2b", "b2c"] as const}
          labels={{ b2b: "Businesses (B2B)", b2c: "Consumers (B2C)" }}
          value={f.buyer}
          onChange={(v) => set("buyer", v)}
        />
        <Checks
          label="Sells"
          options={["services", "software", "products"] as const}
          labels={{ services: "Services", software: "Software", products: "Products" }}
          value={f.offering}
          onChange={(v) => set("offering", v)}
        />
        <p className="-mt-2 text-xs text-muted-foreground">
          Leave a group empty to fit every client.
        </p>
        <Field>
          <FieldLabel htmlFor="cat-ind">Industry keywords</FieldLabel>
          <Input
            id="cat-ind"
            value={industriesText}
            onChange={(e) => setIndustriesText(e.target.value)}
            placeholder="lawyer, attorney, legal (empty = any industry)"
          />
          <FieldDescription>
            Matched against the client&apos;s industry, categories, services and brief topics.
          </FieldDescription>
        </Field>
        <Checks
          label="What it's good for"
          options={BENEFITS}
          labels={BENEFIT_LABELS}
          value={f.benefits}
          onChange={(v) => set("benefits", v)}
        />
        <Checks
          label="What you need"
          options={NEEDS}
          labels={NEED_LABELS}
          value={f.needs}
          onChange={(v) => set("needs", v)}
        />
        <Field>
          <FieldLabel htmlFor="cat-how">How to get listed</FieldLabel>
          <Textarea
            id="cat-how"
            value={f.howTo}
            onChange={(e) => set("howTo", e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder={"1. …\n2. …"}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cat-warn">Warnings</FieldLabel>
          <Textarea
            id="cat-warn"
            value={f.warnings}
            onChange={(e) => set("warnings", e.target.value)}
            rows={2}
            maxLength={500}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cat-notes">Notes</FieldLabel>
          <Textarea
            id="cat-notes"
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            maxLength={1000}
          />
        </Field>
      </div>
      <SheetFooter className="flex-row flex-wrap justify-between gap-2 border-t">
        <div className="flex flex-wrap gap-2">
          {entry?.suggestionStatus === "pending" ? (
            <>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await reviewCatalogSuggestion(entry.id, false)
                    if (!r.ok) toast.error(r.error)
                    else {
                      toast.success("Declined.")
                      onClose()
                    }
                  })
                }
              >
                Decline
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  save({ active: true }, "Accepted: every matching client can pick it now.")
                }
              >
                Save and accept
              </Button>
            </>
          ) : entry ? (
            <>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  save(
                    { active: !f.active },
                    f.active
                      ? "Retired: it's off every picker (old listings keep it)."
                      : "Back in the catalog.",
                  )
                }
              >
                {f.active ? "Retire" : "Restore"}
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await verifyCatalogSite(entry.id)
                    if (!r.ok) toast.error(r.error)
                    else {
                      toast.success("Marked as checked today.")
                      onClose()
                    }
                  })
                }
              >
                <BadgeCheck /> Mark checked today
              </Button>
            </>
          ) : null}
        </div>
        <Button disabled={pending} onClick={() => save()}>
          {pending ? "Saving…" : entry ? "Save" : "Add to the catalog"}
        </Button>
      </SheetFooter>
    </>
  )
}
