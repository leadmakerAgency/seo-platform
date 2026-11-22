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
import type { ContentAccount, ContentSettings } from "../queries"
import { COMMON_ZONES, isValidZone, zoneLabel } from "../time"

export function SettingsForm({
  clientId,
  settings,
  wordpress,
  canEdit,
  connectionsHref,
}: {
  clientId: string
  settings: ContentSettings
  wordpress: ContentAccount[]
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
