"use client"

import { CircleCheck, CircleDashed, CircleX, ExternalLink } from "lucide-react"
import { useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { registerWebhook, sendTestWebhook, turnOnHourlyChecks } from "../actions"
import type { IntegrationStatus } from "../queries"

const FREE_ACCOUNTS = 2

/** Admin only: is Zernio wired up (key, webhook, hourly checks)? */
export function IntegrationCard({ status, nowIso }: { status: IntegrationStatus; nowIso: string }) {
  const now = new Date(nowIso)
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const r = await action()
      if (!r.ok) toast.error(r.error ?? "Something went wrong.")
      else toast.success(success)
    })
  }

  const keyLine = {
    ok: "API key works",
    missing: "ZERNIO_API_KEY is missing",
    rejected: "Zernio rejected the API key",
    unreachable: "Couldn't reach Zernio to check the key",
  }[status.apiKey]

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold tracking-tight">Zernio setup</h2>
        <p className="text-sm text-muted-foreground">
          Admins only. Shared by every client: one Zernio account, one profile per client.
        </p>
      </div>

      <ul className="flex flex-col gap-3 text-sm">
        <Line ok={status.apiKey === "ok" ? true : status.apiKey === "unreachable" ? null : false}>
          {keyLine}
        </Line>
        <Line
          ok={
            status.webhook
              ? status.webhook.active && status.webhook.failureCount === 0
              : status.isLocal
                ? null
                : false
          }
          action={
            !status.isLocal && status.apiKey === "ok" ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !status.webhookSecret}
                  onClick={() => run(registerWebhook, "Webhook registered")}
                >
                  {status.webhook ? "Update" : "Register webhook"}
                </Button>
                {status.webhook && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(sendTestWebhook, "Test event delivered")}
                  >
                    Send test
                  </Button>
                )}
              </div>
            ) : null
          }
        >
          {status.isLocal
            ? "Webhooks: only on the live site (Zernio can't reach this computer). Use Check now locally."
            : !status.webhookSecret
              ? "Webhooks: add ZERNIO_WEBHOOK_SECRET first"
              : status.webhook
                ? `Webhook ${status.webhook.active ? "active" : "turned off by Zernio"}${
                    status.webhook.failureCount
                      ? `, ${status.webhook.failureCount} failed deliveries`
                      : ""
                  }${status.webhook.lastFiredAt ? `, last event ${formatRelative(status.webhook.lastFiredAt, now)}` : ""}`
                : "Webhook not registered: connections update only when someone opens this page"}
        </Line>
        <Line
          ok={
            status.cron?.scheduled
              ? status.cron.lastStatus !== "failed"
              : status.isLocal
                ? null
                : false
          }
          action={
            !status.isLocal && status.serviceKey && !status.cron?.scheduled ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(turnOnHourlyChecks, "Hourly checks turned on")}
              >
                Turn on hourly checks
              </Button>
            ) : null
          }
        >
          {!status.serviceKey
            ? "Hourly checks: add SUPABASE_SECRET_KEY first"
            : status.cron?.scheduled
              ? `Hourly checks on${status.cron.lastRunAt ? `, last run ${formatRelative(status.cron.lastRunAt, now)}` : ""}`
              : status.isLocal
                ? "Hourly checks: turn on from the live site"
                : "Hourly checks off"}
        </Line>
        <Line ok={null}>
          {status.connectedAccounts} connected{" "}
          {status.connectedAccounts === 1 ? "account" : "accounts"} across all clients
          {status.connectedAccounts > FREE_ACCOUNTS
            ? `. Zernio bills ${status.connectedAccounts - FREE_ACCOUNTS} beyond the 2 free ones.`
            : `. The first ${FREE_ACCOUNTS} are free.`}
        </Line>
      </ul>

      <Button asChild variant="link" size="sm" className="w-fit px-0">
        <a href="https://zernio.com/dashboard" target="_blank" rel="noreferrer">
          Open the Zernio dashboard
          <ExternalLink />
        </a>
      </Button>
    </section>
  )
}

function Line({
  ok,
  children,
  action,
}: {
  ok: boolean | null
  children: ReactNode
  action?: ReactNode
}) {
  const Icon = ok === true ? CircleCheck : ok === false ? CircleX : CircleDashed
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Icon
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          ok === true ? "text-success" : ok === false ? "text-danger" : "text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </li>
  )
}
