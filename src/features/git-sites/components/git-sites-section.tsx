"use client"

import { CircleAlert, KeyRound, Network, Plug, RefreshCw, Settings2, Unplug } from "@/components/icons"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

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
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDate, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { checkGitSite, connectGitToken, removeGitSite, startGitConnect } from "../actions"
import type { GitSite } from "../queries"
import { GitSiteSheet } from "./git-site-sheet"

type Props = {
  clientId: string
  sites: GitSite[]
  canManage: boolean
  /** The GitHub App is configured on the server (otherwise only the token option). */
  appReady: boolean
  nowIso: string
  /** From the callback: ?site=<id>&result=git_connected | git_error&message=… */
  result: { result?: string; site?: string; message?: string }
}

const isSetUp = (s: GitSite) => Boolean(s.folder && s.urlPattern && s.siteUrl)

/** Connections → Website → Git-based site (Sveltia, Decap, Netlify CMS on GitHub). */
export function GitSitesSection({ clientId, sites, canManage, appReady, nowIso, result }: Props) {
  const now = new Date(nowIso)
  const [openId, setOpenId] = useState<string | null>(() =>
    result.result === "git_connected" && result.site && sites.some((s) => s.id === result.site) ? result.site : null,
  )
  const [pending, start] = useTransition()
  useGitResultToast(result)

  const summary: { label: string; tone: Tone } = sites.some((s) => s.status === "needs_attention")
    ? { label: "Needs attention", tone: "warning" }
    : sites.length
      ? { label: sites.length === 1 ? "Connected" : `${sites.length} connected`, tone: "success" }
      : { label: "Not connected", tone: "neutral" }

  const connect = () =>
    start(async () => {
      const r = await startGitConnect(clientId)
      if (!r.ok) toast.error(r.error)
      else window.location.assign(r.data.url)
    })

  const open = sites.find((s) => s.id === openId) ?? null

  return (
    <li className="@container flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center @2xl:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3 @2xl:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-foreground text-background" aria-hidden>
            <Network className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold">Git-based site</h3>
              <StatusTag tone={summary.tone}>{summary.label}</StatusTag>
            </div>
            <p className="text-sm text-muted-foreground">
              Sites whose blog is edited with Sveltia, Decap or Netlify CMS and stored on GitHub. Articles are committed to
              the repo and the host (Vercel, Netlify…) publishes them.
            </p>
            {sites.length === 0 && (
              <p className="text-xs text-muted-foreground/80">
                Install the LeadMaker Publisher GitHub app on the site&apos;s repo, or use a fine-grained token. Clients can
                also connect it from their onboarding link.
              </p>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 flex-wrap gap-2 pl-[52px] @2xl:pl-0">
            {appReady && (
              <Button size="sm" variant={sites.length ? "outline" : "default"} disabled={pending} onClick={connect}>
                <Plug />
                {sites.length ? "Connect another" : "Connect with GitHub"}
              </Button>
            )}
            <TokenButton clientId={clientId} variant={appReady ? (sites.length ? "ghost" : "outline") : sites.length ? "outline" : "default"} />
          </div>
        )}
      </div>

      {sites.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border bg-card @2xl:ml-[52px]">
          {sites.map((s) => (
            <SiteRow key={s.id} site={s} now={now} canManage={canManage} clientId={clientId} onSetUp={() => setOpenId(s.id)} />
          ))}
        </ul>
      )}

      {open && <GitSiteSheet site={open} open onOpenChange={(v) => !v && setOpenId(null)} />}
    </li>
  )
}

function SiteRow({
  site: s,
  now,
  canManage,
  clientId,
  onSetUp,
}: {
  site: GitSite
  now: Date
  canManage: boolean
  clientId: string
  onSetUp: () => void
}) {
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState(false)
  const setUp = isSetUp(s)
  const expiresSoon = s.tokenExpiresAt && Date.parse(s.tokenExpiresAt) - now.getTime() < 30 * 86_400_000
  const tone: Tone = s.status === "needs_attention" ? "warning" : setUp ? "success" : "info"
  const label = s.status === "needs_attention" ? "Needs attention" : setUp ? "Ready to publish" : "Finish setting up"

  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`https://github.com/${s.owner}/${s.repo}`}
              target="_blank"
              rel="noreferrer"
              className="truncate text-sm font-medium hover:underline"
            >
              {s.owner}/{s.repo}
            </a>
            <StatusTag tone={tone}>{label}</StatusTag>
          </div>
          <p className="text-xs text-muted-foreground">
            {s.authMethod === "github_app" ? "GitHub App" : "Token"} · branch {s.branch}
            {s.folder ? ` · posts in ${s.folder}` : ""}
            {s.siteUrl ? ` · ${s.siteUrl.replace(/^https?:\/\//, "")}` : ""}
            {s.lastCheckedAt ? ` · checked ${formatRelative(s.lastCheckedAt, now)}` : ""}
          </p>
          {s.tokenExpiresAt && (
            <p className={cn("text-xs", expiresSoon ? "font-medium text-warning" : "text-muted-foreground")}>
              Token expires {formatDate(s.tokenExpiresAt)}
            </p>
          )}
          {s.status === "needs_attention" && s.lastError && (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {s.lastError}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={setUp ? "ghost" : "default"} onClick={onSetUp}>
              <Settings2 />
              Set up site
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await checkGitSite(s.id)
                  if (!r.ok) toast.error(r.error)
                  else if (r.data.connected) toast.success("The site connection works")
                  else toast.warning("The site needs attention", { description: r.data.message ?? undefined })
                })
              }
            >
              <RefreshCw className={cn(pending && "animate-spin")} />
              Check
            </Button>
            {s.authMethod === "token" && <TokenButton clientId={clientId} connectionId={s.id} repo={`${s.owner}/${s.repo}`} variant="ghost" label="New token" />}
            <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => setConfirm(true)}>
              <Unplug />
              Disconnect
            </Button>
          </div>
        )}
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {s.owner}/{s.repo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Posts already published stay on the site. Scheduled articles for this site won&apos;t be sent. If it was
              connected with a token, the token is deleted from our vault; uninstall the GitHub app on GitHub if you
              want to remove its access too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() =>
                start(async () => {
                  const r = await removeGitSite(s.id)
                  if (!r.ok) toast.error(r.error)
                  else toast.success("Site disconnected")
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

/** "Use a token": owner/repo + a fine-grained personal token, checked before it's saved. */
function TokenButton({
  clientId,
  connectionId,
  repo: repoDefault = "",
  variant = "outline",
  label = "Use a token",
}: {
  clientId: string
  connectionId?: string
  repo?: string
  variant?: "default" | "outline" | "ghost"
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [repo, setRepo] = useState(repoDefault)
  const [token, setToken] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      setError(null)
      const r = await connectGitToken(clientId, { repo, token, connectionId: connectionId ?? null })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setToken("")
      setOpen(false)
      if (r.data.connected) toast.success("Site connected", { description: "Open Set up site to check the post folder and address." })
      else toast.warning("Connected, but it needs attention", { description: r.data.message ?? undefined, duration: 10_000 })
    })

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <KeyRound />
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) {
            setToken("")
            setError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect with a GitHub token</DialogTitle>
            <DialogDescription>
              On GitHub: Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate. Pick the
              repo&apos;s owner, choose <span className="font-medium text-foreground">Only select repositories</span> and the
              blog&apos;s repo, then give <span className="font-medium text-foreground">Contents: Read and write</span>,
              Deployments: Read-only and Commit statuses: Read-only. The token is checked, then kept in our vault; nobody
              can see it again.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="git-repo">Repository</Label>
              <Input
                id="git-repo"
                placeholder="owner/repo or https://github.com/owner/repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                autoComplete="off"
                disabled={Boolean(connectionId)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="git-token">Token</Label>
              <Input
                id="git-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="new-password"
                placeholder="github_pat_…"
                required
              />
              <p className="text-xs text-muted-foreground">Tokens expire (up to a year). We warn you two weeks before.</p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Checking…" : "Connect"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function useGitResultToast(result: Props["result"]) {
  const router = useRouter()
  const pathname = usePathname()
  const shown = useRef(false)
  useEffect(() => {
    if (shown.current || !result.result?.startsWith("git_")) return
    shown.current = true
    if (result.result === "git_connected") toast.success("Site connected", { description: "Check the settings in Set up site." })
    else if (result.result === "git_error")
      toast.error("The site wasn't connected", { description: result.message, duration: 12_000 })
    router.replace(pathname, { scroll: false })
  }, [result, router, pathname])
}
