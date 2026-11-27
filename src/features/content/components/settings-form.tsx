"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PlatformLogo } from "@/components/brand/platform-icons"
import { ChipsInput } from "@/components/common/chips-input"
import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { loadBlogs, saveContentSettings } from "../actions"
import type { ContentAccount, ContentSettings, GitSiteLite } from "../queries"
import { COMMON_ZONES, isValidZone, zoneLabel } from "../time"

export function SettingsForm({
  clientId,
  settings,
  wordpress,
  gitSites = [],
  canEdit,
  connectionsHref,
}: {
  clientId: string
  settings: ContentSettings
  wordpress: ContentAccount[]
  gitSites?: GitSiteLite[]
  canEdit: boolean
  connectionsHref: string
}) {
  const [tz, setTz] = useState(settings.timezone)
  const [cta, setCta] = useState(settings.defaultCtaUrl ?? "")
  const [sig, setSig] = useState(settings.signature ?? "")
  const [author, setAuthor] = useState(settings.wpDefaultAuthor ?? "")
  const [tags, setTags] = useState(settings.wpDefaultTags)
  const [wpId, setWpId] = useState(settings.wpAccountId ?? wordpress[0]?.id ?? "")
  const [blogs, setBlogs] = useState<{ id: string; name: string; url: string | null }[] | null>(null)
  const [blogId, setBlogId] = useState(settings.wpBlogId ?? "")
  // Default destination: "wordpress" or "git:<id>".
  const [dest, setDest] = useState(
    settings.siteKind === "git" && settings.gitConnectionId
      ? `git:${settings.gitConnectionId}`
      : wordpress.length || !gitSites[0]
        ? "wordpress"
        : `git:${gitSites[0].id}`,
  )
  const [gitAuthor, setGitAuthor] = useState(settings.gitDefaultAuthor ?? "")
  const [gitTags, setGitTags] = useState(settings.gitDefaultTags)
  const [pending, start] = useTransition()
  const zones = COMMON_ZONES.includes(tz) ? COMMON_ZONES : [tz, ...COMMON_ZONES]
  const site = wordpress.find((w) => w.id === wpId) ?? null

  const save = () =>
    start(async () => {
      if (!isValidZone(tz)) {
        toast.error("Unknown time zone.")
        return
      }
      const blog = blogs?.find((b) => b.id === blogId)
      const r = await saveContentSettings(clientId, {
        timezone: tz,
        defaultCtaUrl: cta.trim() || null,
        signature: sig.trim() || null,
        wpDefaultAuthor: author.trim() || null,
        wpDefaultTags: tags,
        ...(wordpress.length ? { wpAccountId: wpId || null } : {}),
        ...(blogs ? { wpBlogId: blogId || null, wpBlogName: blog?.name ?? null } : {}),
        ...(gitSites.length
          ? {
              siteKind: dest.startsWith("git:") ? ("git" as const) : ("wordpress" as const),
              gitConnectionId: dest.startsWith("git:") ? dest.slice(4) : null,
              gitDefaultAuthor: gitAuthor.trim() || null,
              gitDefaultTags: gitTags,
            }
          : {}),
      })
      if (r.ok) toast.success("Settings saved")
      else toast.error(r.error)
    })

  return (
    <form
      className="flex max-w-2xl flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-semibold tracking-tight">Posting</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tz">Client&apos;s time zone</Label>
          <Select value={tz} onValueChange={setTz} disabled={!canEdit}>
            <SelectTrigger id="tz" className="w-full sm:w-[340px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem key={z} value={z}>
                  {zoneLabel(z)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Posts and articles are planned and shown in this time zone.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cta">Google post button link</Label>
          <Input id="cta" inputMode="url" placeholder="https://" value={cta} onChange={(e) => setCta(e.target.value)} disabled={!canEdit} />
          <p className="text-xs text-muted-foreground">Filled in for “Learn more” on new Google Business Profile posts.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sig">Post signature</Label>
          <Input id="sig" maxLength={300} placeholder="Call us at (555) 010-2000" value={sig} onChange={(e) => setSig(e.target.value)} disabled={!canEdit} />
          <p className="text-xs text-muted-foreground">An “Add signature” button in the composer adds this line.</p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-semibold tracking-tight">WordPress</h2>
        {wordpress.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No WordPress site is connected.{" "}
            <Link className="underline" href={connectionsHref}>
              Connect it in Connections
            </Link>{" "}
            (WordPress.com sign-in or an application password).
          </p>
        ) : (
          <>
            {wordpress.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wp">Site</Label>
                <Select value={wpId} onValueChange={(v) => { setWpId(v); setBlogs(null) }} disabled={!canEdit}>
                  <SelectTrigger id="wp" className="w-full sm:w-[340px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {wordpress.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <PlatformLogo platform="wordpress" className="size-4" />
                <span className="font-medium">{site?.name}</span>
                {site && site.status !== "connected" && <StatusTag tone="warning">Needs reconnecting</StatusTag>}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="blog">Blog</Label>
              {blogs ? (
                <Select value={blogId} onValueChange={setBlogId} disabled={!canEdit || blogs.length === 0}>
                  <SelectTrigger id="blog" className="w-full sm:w-[340px]">
                    <SelectValue placeholder={blogs.length ? "Pick the blog" : "Zernio found no blogs"} />
                  </SelectTrigger>
                  <SelectContent>
                    {blogs.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">{settings.wpBlogName ?? (settings.wpBlogId ? `Blog ${settings.wpBlogId}` : "Not picked yet")}</span>
                  {canEdit && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending || !wpId}
                      onClick={() =>
                        start(async () => {
                          const r = await loadBlogs(clientId, wpId)
                          if (!r.ok) {
                            toast.error(r.error)
                            return
                          }
                          setBlogs(r.data.blogs)
                          if (r.data.blogs.length === 1) setBlogId(r.data.blogs[0].id)
                        })
                      }
                    >
                      {settings.wpBlogId ? "Change" : "Pick the blog"}
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="author">Default author (WordPress user number)</Label>
              <Input id="author" inputMode="numeric" className="w-[160px]" value={author} onChange={(e) => setAuthor(e.target.value.replace(/\D/g, "").slice(0, 12))} disabled={!canEdit} placeholder="1" />
              <p className="text-xs text-muted-foreground">In WordPress, Users → edit the user: the number after user_id= in the address. Empty = the connected user.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tags">Default tags</Label>
              <ChipsInput id="tags" values={tags} onChange={setTags} max={20} maxLength={50} placeholder="Type a tag and press Enter" />
              <p className="text-xs text-muted-foreground">Zernio can&apos;t set WordPress categories; pick those in WordPress after publishing.</p>
            </div>
          </>
        )}
      </section>

      {gitSites.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-[15px] font-semibold tracking-tight">Git-based site</h2>
          {(wordpress.length ? 1 : 0) + gitSites.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dest">New articles go to</Label>
              <Select value={dest} onValueChange={setDest} disabled={!canEdit}>
                <SelectTrigger id="dest" className="w-full sm:w-[340px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {wordpress.length > 0 && <SelectItem value="wordpress">WordPress{settings.wpBlogName ? ` · ${settings.wpBlogName}` : ""}</SelectItem>}
                  {gitSites.map((g) => (
                    <SelectItem key={g.id} value={`git:${g.id}`}>
                      {g.label} ({g.repo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Each article can still pick another site before it&apos;s first sent.</p>
            </div>
          )}
          <ul className="flex flex-col gap-1.5 text-sm">
            {gitSites.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{g.label}</span>
                <span className="text-muted-foreground">{g.repo}</span>
                {g.ready ? (
                  <StatusTag tone="success">Ready</StatusTag>
                ) : (
                  <StatusTag tone="warning">
                    <Link href={connectionsHref} className="hover:underline">
                      {g.status === "needs_attention" ? "Needs attention" : "Finish setting up"}
                    </Link>
                  </StatusTag>
                )}
              </li>
            ))}
          </ul>
          {gitSites.some((g) => g.hasAuthorField) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="git-author">Default author</Label>
              <Input id="git-author" className="w-full sm:w-[340px]" maxLength={100} value={gitAuthor} onChange={(e) => setGitAuthor(e.target.value)} disabled={!canEdit} placeholder="Name shown on the post" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="git-tags">Default tags</Label>
            <ChipsInput id="git-tags" values={gitTags} onChange={setGitTags} max={20} maxLength={50} placeholder="Type a tag and press Enter" />
            <p className="text-xs text-muted-foreground">Used when an article for a Git site has no tags of its own.</p>
          </div>
        </section>
      )}

      {canEdit ? (
        <div>
          <Button type="submit" disabled={pending}>
            Save settings
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Only admins and account managers change these settings.</p>
      )}
    </form>
  )
}
