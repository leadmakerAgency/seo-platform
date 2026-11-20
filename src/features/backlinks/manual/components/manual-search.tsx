import { StatStrip, type StatItem } from "@/components/common/stat-strip"
import { PageHeader } from "@/components/layout/page-header"
import { agencyMonth, agencyToday } from "@/lib/dates"
import { countryName } from "@/lib/countries"
import { formatNumber } from "@/lib/format"
import { hasDataForSeo } from "@/lib/env.server"
import { can, type AppRole } from "@/lib/roles"
import { clientHref } from "@/lib/navigation"
import { ModeTabs, MODE_META } from "../../components/mode-tabs"
import { hasLocal } from "../../brief"
import { isStage, ORIGINS, stageHas, STAGE_LABELS, type Origin, type Stage } from "../constants"
import { listingKit } from "../listing-kit"
import { matchCatalog, type MatchContext } from "../match"
import { getManualData } from "../queries"
import { searchHelpers } from "../search-helpers"
import { ListingKitPanel } from "./listing-kit"
import { ManualActions, ManualView } from "./manual-view"
import { SearchHelpers } from "./search-helpers"

/**
 * The Manual Search tab (docs/plans/backlinks/09-manual-search.md): pick trusted sites from the
 * catalog, add sites found by hand, and work every approved place (from any tab) to Live.
 * Rendered inside the page's Suspense boundary (reads the session and today's date).
 */

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export async function ManualSearch({
  client,
  member,
  search,
}: {
  client: { id: string; slug: string; name: string }
  member: { id: string; role: AppRole }
  search: Record<string, string | string[] | undefined>
}) {
  const data = await getManualData(client.id)
  const base = clientHref(client.slug, "backlinks")
  const href = `${base}?mode=manual`
  const editHref = clientHref(client.slug, "")
  const today = agencyToday()
  const month = agencyMonth()

  const rawStage = one(search.stage)
  const stage: Stage = isStage(rawStage) ? rawStage : "open"
  const rawFrom = one(search.from)
  const origin: Origin | "default" = (ORIGINS as readonly string[]).includes(rawFrom ?? "")
    ? (rawFrom as Origin)
    : "default"
  const who = one(search.who) === "me" ? "me" : "anyone"

  const canWork = can(member.role, "backlinks.manual")
  const canStrength = can(member.role, "backlinks.strength")
  const strengthBlocked = hasDataForSeo() ? null : "DataForSEO isn't connected yet."

  // Countries: the brief's places (Standard Search), else the client's own country.
  const placeCountries = [
    ...new Set(data.places.filter((pl) => pl.active).map((pl) => pl.country.toUpperCase())),
  ]
  const brief = data.brief
  const p = data.profile
  const ctx: MatchContext = {
    countries: placeCountries.length ? placeCountries : [data.client.country],
    reach: brief?.reach ?? [],
    buyer: brief?.buyer ?? [],
    offering: brief?.offering ?? [],
    words: [
      data.client.industry,
      p?.primary_category,
      ...(p?.other_categories ?? []),
      ...(p?.services ?? []),
      ...(brief?.core_topics ?? []),
      ...(brief?.adjacent_topics ?? []),
    ]
      .filter(Boolean)
      .join(" | ")
      .toLowerCase(),
    hasStreet: Boolean(p?.street),
    serviceArea: Boolean(p?.service_area_business),
  }
  const matches = matchCatalog(data.catalog, ctx, countryName)
  const suggestedLeft = matches.filter(
    (m) => m.suggested && !data.submissions.some((s) => s.site.id === m.site.directoryId),
  ).length

  const kit = listingKit(p, {
    name: data.client.name,
    website: data.client.website,
    city: data.client.city,
    region: data.client.region,
    country: data.client.country,
  })

  let clientHost: string | null = null
  try {
    clientHost = data.client.website
      ? new URL(
          /^https?:\/\//i.test(data.client.website)
            ? data.client.website
            : `https://${data.client.website}`,
        ).hostname.replace(/^www\./, "")
      : null
  } catch {
    clientHost = null
  }
  const helpers = searchHelpers({
    topics: [...(brief?.core_topics ?? []), ...(brief?.adjacent_topics ?? [])],
    services: p?.services?.length
      ? p.services
      : [p?.primary_category ?? data.client.industry ?? ""],
    places: data.places.filter((pl) => pl.active).map((pl) => pl.label),
    competitors: data.competitors,
    clientName: data.client.name,
    clientHost,
    local: brief ? hasLocal(brief) : true,
  })

  const subs = data.submissions
  const liveThisMonth = subs.filter(
    (s) => s.status === "live" && s.liveOn && s.liveOn.slice(0, 7) === month.slice(0, 7),
  ).length
  const due = subs.filter(
    (s) =>
      s.followUpOn && s.followUpOn <= today && ["doing", "submitted", "blocked"].includes(s.status),
  ).length
  const stageHref = (st: Stage) => {
    const u = new URLSearchParams({ mode: "manual", stage: st })
    if (origin !== "default") u.set("from", origin)
    if (who === "me") u.set("who", "me")
    return `${base}?${u.toString()}`
  }
  const statKeys: Stage[] = ["open", "todo", "doing", "submitted", "live", "blocked"]
  const stats: StatItem[] = statKeys.map((st) => ({
    key: st,
    label: STAGE_LABELS[st],
    count: subs.filter((s) => stageHas(st, s.status)).length,
    href: stageHref(st),
    selected: stage === st,
    tone: st === "live" ? "success" : st === "blocked" ? "danger" : undefined,
    note:
      st === "open"
        ? due > 0
          ? `${formatNumber(due)} follow-up${due === 1 ? "" : "s"} due`
          : "Everything not live or skipped"
        : st === "live"
          ? `${formatNumber(liveThisMonth)} this month · plan ${formatNumber(data.client.backlinksTarget)}`
          : undefined,
  }))

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Backlinks"
        description={MODE_META.manual.caption}
        actions={
          canWork ? (
            <ManualActions
              clientId={client.id}
              clientName={client.name}
              matches={matches}
              submissions={subs}
              decisions={data.otherDecisions}
              hasBrief={Boolean(brief)}
            />
          ) : null
        }
      />
      <ModeTabs base={base} mode="manual" />

      {subs.length > 0 && <StatStrip items={stats} label="Backlink listings by status" />}
      {subs.length === 0 && canWork && (
        <p className="-mt-3 text-[13px] text-muted-foreground">
          {formatNumber(suggestedLeft)} catalog sites are suggested for {client.name}. Start with
          &ldquo;Add from catalog&rdquo;.
        </p>
      )}

      <ListingKitPanel fields={kit.fields} missing={kit.missing} editHref={editHref} />

      <ManualView
        clientId={client.id}
        clientName={client.name}
        href={href}
        editHref={editHref}
        stage={stage}
        origin={origin}
        who={who}
        memberId={member.id}
        today={today}
        initialSheet={one(search.sheet) ?? null}
        canWork={canWork}
        canStrength={canStrength}
        strengthBlocked={strengthBlocked}
        submissions={subs}
        events={data.events}
        catalog={data.catalog}
        matches={matches}
        decisions={data.otherDecisions}
        hasBrief={Boolean(brief)}
        logins={data.logins}
        members={data.members}
        kit={kit}
      />

      <SearchHelpers groups={helpers} />

      <details className="rounded-lg border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium marker:text-muted-foreground">
          How Manual Search works
        </summary>
        <div className="mt-3 flex max-w-[72ch] flex-col gap-2 text-muted-foreground">
          <p>
            <span className="text-foreground">1. Pick.</span> The catalog is the agency&apos;s list
            of trusted sites. It&apos;s sorted for this client from the strategy brief: the
            countries of its places, local or national, who buys, what they sell and the industry.
            Picking a site approves it for the client.
          </p>
          <p>
            <span className="text-foreground">2. Work.</span> Every approved place lands here,
            including the ones approved in Standard Search and Shockwave AI. Move each one through
            To do, Doing, Submitted and Live, with the listing kit, the how-to and the login in its
            panel.
          </p>
          <p>
            <span className="text-foreground">3. Live counts.</span> A listing counts once toward
            the month&apos;s backlinks when it&apos;s Live with its URL. Taking it off Live takes
            the count back. Backlink tasks no longer count on their own.
          </p>
          <p>
            <span className="text-foreground">4. Follow-ups.</span> Set a follow-up date on anything
            waiting. Every morning the person assigned gets a reminder when it&apos;s due, or when a
            listing has waited 21 days in Submitted.
          </p>
        </div>
      </details>
    </>
  )
}
