"use client"

import {
  ChevronDown,
  Ellipsis,
  ExternalLink,
  History,
  Link2,
  Plug,
  RefreshCw,
  TriangleAlert,
  Unplug,
  X,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { PlatformMark } from "@/components/brand/platform-icons"
import { StatusTag, type Tone } from "@/components/common/status"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { actorLabel, describeActivity } from "@/features/team/activity"
import { formatDate, formatRelative, initials } from "@/lib/format"
import { cn } from "@/lib/utils"
import { cancelClientLink, checkNow, createClientLink, disconnectAccount } from "../actions"
import {
  connectErrorMessage,
  PLATFORM_META,
  PLATFORMS,
  STATUS_META,
  type SocialPlatform,
} from "../constants"
import type { ConnectedAccount, ConnectionsData } from "../queries"
import { ClientLinkButton, ConnectButton, CopyButton } from "./connect-buttons"

type Props = {
  clientId: string
  clientName: string
  data: ConnectionsData
  nowIso: string
  canManage: boolean
  zernioReady: boolean
  result: { result?: string; platform?: string; code?: string; message?: string }
}

/** The client's connected accounts, one row per platform. */
export function ConnectionsView({
  clientId,
  clientName,
  data,
  nowIso,
  canManage,
  zernioReady,
  result,
}: Props) {
  const now = new Date(nowIso)
  const [checking, startCheck] = useTransition()
  useResultToast(result)

  const byPlatform = new Map<SocialPlatform, ConnectedAccount[]>()
  for (const a of data.accounts)
    byPlatform.set(a.platform, [...(byPlatform.get(a.platform) ?? []), a])
  const connectedCount = data.accounts.filter((a) => a.status !== "removed").length
  const broken = data.accounts.filter((a) => a.status === "needs_reconnect").length

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
        <p className="text-sm">
          <span className="font-medium tabular-nums">{connectedCount}</span>{" "}
          <span className="text-muted-foreground">
            {connectedCount === 1 ? "account connected" : "accounts connected"}
          </span>
          {broken > 0 && (
            <span className="font-medium text-warning">
              {" "}
              · {broken} {broken === 1 ? "needs" : "need"} reconnecting
            </span>
          )}
          <span className="text-muted-foreground">
            {" "}
            ·{" "}
            {data.lastCheckedAt
              ? `checked ${formatRelative(data.lastCheckedAt, now)}`
              : "not checked yet"}
          </span>
        </p>
        {canManage && zernioReady && data.hasProfile && (
          <Button
            variant="outline"
            size="sm"
            disabled={checking}
            onClick={() =>
              startCheck(async () => {
                const r = await checkNow(clientId)
                if (!r.ok) toast.error(r.error)
                else
                  toast.success(r.data.changed ? "Updated from Zernio" : "Everything is up to date")
              })
            }
          >
            <RefreshCw className={cn(checking && "animate-spin")} />
            {checking ? "Checking…" : "Check now"}
          </Button>
        )}
      </div>

      <ul aria-label="Platforms" className="flex flex-col divide-y rounded-lg border bg-card">
        {PLATFORMS.map((platform) => (
          <PlatformRow
            key={platform}
            platform={platform}
            accounts={byPlatform.get(platform) ?? []}
            clientId={clientId}
            now={now}
            canManage={canManage}
            zernioReady={zernioReady}
          />
        ))}
      </ul>

      {data.links.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[15px] font-semibold tracking-tight">Waiting on the client</h2>
            <p className="text-sm text-muted-foreground">
              Links sent to {clientName}. Each one disappears from here once it&apos;s used.
            </p>
          </div>
          <ul className="divide-y rounded-lg border bg-card">
            {data.links.map((l) => (
              <PendingLinkRow
                key={l.id}
                link={l}
                now={now}
                canManage={canManage}
                clientId={clientId}
              />
            ))}
          </ul>
        </section>
      )}

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-2 text-muted-foreground">
            <History />
            History ({data.history.length})
            <ChevronDown />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {data.history.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ol className="mt-2 flex flex-col gap-2 border-l pl-4">
              {data.history.map((h) => (
                <li key={h.id} className="text-sm">
                  <span className="font-medium">{actorLabel(h)}</span>{" "}
                  <span className="text-muted-foreground">
                    {describeActivity({ ...h, clientName })}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatRelative(h.createdAt, now)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

/** Toast for the redirect back from Zernio, then a clean URL. */
function useResultToast(result: Props["result"]) {
  const router = useRouter()
  const pathname = usePathname()
  const shown = useRef(false)
  useEffect(() => {
    if (shown.current || !result.result) return
    shown.current = true
    const platform =
      result.platform && result.platform in PLATFORM_META
        ? PLATFORM_META[result.platform as SocialPlatform].label
        : "The account"
    if (result.result === "connected") toast.success(`${platform} connected`)
    else if (result.result === "pending")
      toast.info(`${platform}: sign-in finished`, {
        description: "It can take a moment to show up. Click Check now if it isn't listed.",
      })
    else if (result.result === "check")
      toast.warning("Signed in, but we couldn't confirm it with Zernio", {
        description: "Click Check now in a moment.",
      })
    else if (result.result === "stale") toast.info("That sign-in already finished or expired.")
    else if (result.result === "error")
      toast.error(`${platform} wasn't connected`, {
        description: connectErrorMessage(result.code ?? null, result.message),
        duration: 10_000,
      })
    router.replace(pathname, { scroll: false })
  }, [result, router, pathname])
}

/** One platform in the list: logo, what it's for, its status, the actions, then its accounts. */
function PlatformRow({
  platform,
  accounts,
  clientId,
  now,
  canManage,
  zernioReady,
}: {
  platform: SocialPlatform
  accounts: ConnectedAccount[]
  clientId: string
  now: Date
  canManage: boolean
  zernioReady: boolean
}) {
  const meta = PLATFORM_META[platform]
  const active = accounts.filter((a) => a.status !== "removed")
  const broken = active.some((a) => a.status === "needs_reconnect")
  const canAct = canManage && zernioReady
  const summary: { label: string; tone: Tone } = broken
    ? { label: "Needs reconnecting", tone: "warning" }
    : active.length
      ? { label: active.length === 1 ? "Connected" : `${active.length} connected`, tone: "success" }
      : { label: "Not connected", tone: "neutral" }

  return (
    <li className="@container flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center @2xl:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3 @2xl:items-center">
          <PlatformMark platform={platform} className="size-10" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold">{meta.label}</h3>
              <StatusTag tone={summary.tone}>{summary.label}</StatusTag>
            </div>
            <p className="text-sm text-muted-foreground">{meta.what}</p>
            {active.length === 0 && <p className="text-xs text-muted-foreground/80">{meta.help}</p>}
          </div>
        </div>

        {canAct && (
          <div className="flex shrink-0 flex-wrap gap-2 pl-[52px] @2xl:pl-0">
            <ConnectButton
              clientId={clientId}
              platform={platform}
              variant={active.length ? "outline" : "default"}
              label={active.length ? "Connect another" : "Connect"}
            />
            <ClientLinkButton
              clientId={clientId}
              platform={platform}
              variant={active.length ? "ghost" : "outline"}
            />
          </div>
        )}
      </div>

      {accounts.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border bg-card @2xl:ml-[52px]">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} clientId={clientId} now={now} canManage={canAct} />
          ))}
        </ul>
      )}
    </li>
  )
}

function AccountRow({
  account: a,
  clientId,
  now,
  canManage,
}: {
  account: ConnectedAccount
  clientId: string
  now: Date
  canManage: boolean
}) {
  const [confirm, setConfirm] = useState(false)
  const [pending, startTransition] = useTransition()
  const status = STATUS_META[a.status]
  const inGrace =
    a.status === "removed" &&
    a.removalGraceEndsAt &&
    Date.parse(a.removalGraceEndsAt) > now.getTime()

  return (
    <li className={cn("flex flex-col gap-2 px-3 py-3", a.status === "removed" && "opacity-70")}>
      <div className="flex items-center gap-3">
        <Avatar className="size-8">
          {a.avatarUrl && <AvatarImage src={a.avatarUrl} alt="" />}
          <AvatarFallback className="bg-muted text-[11px] font-medium">
            {initials(a.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{a.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {a.username && a.username !== a.name ? `@${a.username.replace(/^@/, "")} · ` : ""}
            {a.status === "removed"
              ? `Disconnected ${a.removedAt ? formatRelative(a.removedAt, now) : ""}`
              : `Connected ${formatRelative(a.connectedAt, now)}${a.connectedBy ? ` by ${a.connectedBy}` : ""}`}
          </span>
        </div>
        <StatusTag tone={status.tone} className="shrink-0">
          {status.label}
        </StatusTag>
        {canManage && a.status !== "removed" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${a.name}`}
                disabled={pending}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {a.profileUrl && (
                <DropdownMenuItem asChild>
                  <a href={a.profileUrl} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Open profile
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() =>
                  startTransition(async () => {
                    const r = await createClientLink(clientId, a.platform, a.id)
                    if (!r.ok) toast.error(r.error)
                    else {
                      try {
                        await navigator.clipboard.writeText(r.data.message)
                        toast.success("Reconnect message copied", {
                          description: "Paste it to the client.",
                        })
                      } catch {
                        toast.success("Reconnect link created", {
                          description: "Copy it from “Waiting on the client”.",
                        })
                      }
                    }
                  })
                }
              >
                <Link2 />
                Copy a reconnect link for the client
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
                <Unplug />
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {a.status === "needs_reconnect" && (
        <div className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2">
          <p className="flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              {a.disconnectReason || "The connection stopped working."}{" "}
              <span className="text-muted-foreground">
                Nothing can be posted until it&apos;s reconnected.
              </span>
            </span>
          </p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <ConnectButton
                clientId={clientId}
                platform={a.platform}
                reconnectAccountId={a.id}
                label="Reconnect"
              />
              <ClientLinkButton
                clientId={clientId}
                platform={a.platform}
                reconnectAccountId={a.id}
                label="Send the client a reconnect link"
                variant="ghost"
              />
            </div>
          )}
        </div>
      )}

      {a.status === "connected" && a.canPost === false && (
        <p className="text-xs text-warning">
          Connected, but Zernio says it can&apos;t post. Reconnect and accept every permission.
        </p>
      )}

      {inGrace && canManage && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Reconnect before {formatDate(a.removalGraceEndsAt!)} to keep it as the same account.
          <ConnectButton
            clientId={clientId}
            platform={a.platform}
            reconnectAccountId={a.id}
            label="Reconnect"
            variant="outline"
          />
        </div>
      )}

      {a.alsoOn.length > 0 && (
        <p className="text-xs text-warning">
          Also connected to{" "}
          {a.alsoOn.map((c, i) => (
            <span key={c.slug}>
              {i > 0 && ", "}
              <Link
                href={`/clients/${c.slug}/connections`}
                className="underline underline-offset-4"
              >
                {c.name}
              </Link>
            </span>
          ))}
          . Zernio bills each connection.
        </p>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {a.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              LeadMaker stops posting to and reading from this {PLATFORM_META[a.platform].label}.
              Reconnect within an hour to keep it as the same account with its scheduled posts.
              Zernio stops billing for it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                startTransition(async () => {
                  const r = await disconnectAccount(a.id)
                  if (!r.ok) toast.error(r.error)
                  else toast.success(`${a.name} disconnected`)
                })
              }
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

function PendingLinkRow({
  link,
  now,
  canManage,
  clientId,
}: {
  link: ConnectionsData["links"][number]
  now: Date
  canManage: boolean
  clientId: string
}) {
  const [pending, startTransition] = useTransition()
  const expired = Date.parse(link.expiresAt) < now.getTime()
  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-4 py-3", expired && "opacity-60")}>
      <PlatformMark platform={link.platform} className="size-7 text-[11px]" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">
          {PLATFORM_META[link.platform].label}
          {link.reconnect ? " (reconnect)" : ""}
        </span>
        <span className="text-xs text-muted-foreground">
          Sent {formatRelative(link.createdAt, now)}
          {link.createdBy ? ` by ${link.createdBy}` : ""} ·{" "}
          {expired ? "expired" : `expires ${formatDate(link.expiresAt)}`}
        </span>
      </div>
      {canManage && (
        <div className="flex items-center gap-1">
          {expired ? (
            <ClientLinkButton clientId={clientId} platform={link.platform} label="New link" />
          ) : (
            <CopyButton text={link.url} label="Copy link" />
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel this link"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await cancelClientLink(link.id)
                if (!r.ok) toast.error(r.error)
              })
            }
          >
            <X />
          </Button>
        </div>
      )}
    </li>
  )
}

/** Shown instead of the cards when ZERNIO_API_KEY is missing. */
export function ZernioSetupNotice({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex gap-3 rounded-lg border border-dashed p-4">
      <Plug className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium">Zernio isn&apos;t connected yet</p>
        {isAdmin ? (
          <p className="text-muted-foreground">
            Create an API key in the Zernio dashboard and add it as <code>ZERNIO_API_KEY</code> in{" "}
            <code>.env.local</code> and in DigitalOcean (Encrypted, Run Time). Restart the app, then
            come back here.
          </p>
        ) : (
          <p className="text-muted-foreground">Ask an admin to connect Zernio.</p>
        )}
      </div>
    </div>
  )
}
