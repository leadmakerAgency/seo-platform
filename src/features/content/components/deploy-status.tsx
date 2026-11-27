"use client"

import { CircleAlert, CircleCheck, ExternalLink, Loader2 } from "@/components/icons"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { StatusTag, type Tone } from "@/components/common/status"
import type { ArticleRow } from "../queries"

/**
 * Where a Git-site article stands after its commit: Committed → Deploying… → Live, or Deploy
 * failed with the host's reason. While waiting it refreshes the page every 10 seconds (the
 * server checks the build; see git-sites/deploy.ts).
 */
const META: Record<ArticleRow["gitDeployState"], { label: string; tone: Tone } | null> = {
  none: null,
  waiting: { label: "Committed", tone: "info" },
  building: { label: "Deploying…", tone: "info" },
  live: { label: "Live", tone: "success" },
  failed: { label: "Deploy failed", tone: "danger" },
}

export function DeployStatus({ article: a, compact = false }: { article: ArticleRow; compact?: boolean }) {
  const router = useRouter()
  const waiting = a.gitDeployState === "waiting" || a.gitDeployState === "building"
  useEffect(() => {
    if (!waiting || compact) return
    const t = window.setInterval(() => router.refresh(), 10_000)
    return () => window.clearInterval(t)
  }, [waiting, compact, router])

  const meta = META[a.gitDeployState]
  if (!meta || !a.gitCommitSha) return null
  const commitUrl = a.gitRepo ? `https://github.com/${a.gitRepo}/commit/${a.gitCommitSha}` : null

  if (compact) {
    return (
      <StatusTag tone={meta.tone}>
        {waiting && <Loader2 className="size-3 animate-spin" aria-hidden />}
        {meta.label}
      </StatusTag>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-background p-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <StatusTag tone={meta.tone}>
          {waiting ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : a.gitDeployState === "live" ? (
            <CircleCheck className="size-3" aria-hidden />
          ) : (
            <CircleAlert className="size-3" aria-hidden />
          )}
          {meta.label}
        </StatusTag>
        {commitUrl && (
          <a href={commitUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-muted-foreground hover:text-foreground">
            {a.gitCommitSha.slice(0, 7)}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        {a.gitDeployUrl && (
          <a href={a.gitDeployUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            Build log
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </div>
      {waiting && <p className="text-muted-foreground">The site is rebuilding. This page updates by itself.</p>}
      {a.gitDeployState === "failed" && a.gitDeployError && <p className="text-danger">{a.gitDeployError}</p>}
    </div>
  )
}
