"use client"

import { ChevronDown, CircleAlert, CircleCheck, Play } from "@/components/icons"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { saveGitSite, testGitUrl } from "../actions"
import type { CmsCollection } from "../config"
import { autoFieldMap, excerptIsMeta, FIELD_KEYS, FIELD_LABELS, emptyRequired, type FieldKey, type FieldMap } from "../field-map"
import { composePost } from "../frontmatter"
import type { DetectedCollection, GitSite } from "../queries"

const NONE = "__none"

/** The detected collection (stored summary) as the shape the pure helpers use. */
function asCollection(d: DetectedCollection): CmsCollection {
  return {
    name: d.name,
    label: d.label,
    folder: d.folder,
    extension: d.extension,
    format: "frontmatter",
    slug: d.slug,
    previewPath: d.preview_path,
    mediaFolder: d.media_folder,
    publicFolder: d.public_folder,
    fields: d.fields.map((f) => ({
      name: f.name,
      label: f.label,
      widget: f.widget,
      required: f.required,
      ...(f.format ? { format: f.format } : {}),
      ...(f.default !== undefined ? { default: f.default } : {}),
      ...(f.widget === "hidden" ? { hidden: true } : {}),
    })),
    hasBody: d.fields.some((f) => f.name === "body"),
    supported: d.supported,
    reason: d.reason,
  }
}

const SAMPLE = {
  title: "How much does an SDR cost in 2026?",
  slug: "sdr-cost-2026",
  excerpt: "A short summary of the article.",
  metaDescription: "What an SDR really costs in 2026, and what drives the price.",
  seoTitle: "SDR cost in 2026",
  tags: ["sdr", "pricing"],
  author: "Jane Doe",
  imageAlt: null,
  draft: false,
  markdown: "Opening paragraph…\n\n## First section\n",
}

/** Connections → Git-based site → Set up site. */
export function GitSiteSheet({ site, open, onOpenChange }: { site: GitSite; open: boolean; onOpenChange: (v: boolean) => void }) {
  const collections = useMemo(() => site.detected.collections.map(asCollection), [site.detected.collections])
  const supported = collections.filter((c) => c.supported)
  const [collection, setCollection] = useState(site.collection ?? supported[0]?.name ?? NONE)
  const current = collections.find((c) => c.name === collection) ?? null
  const [folder, setFolder] = useState(site.folder ?? current?.folder ?? "")
  const [extension, setExtension] = useState<"md" | "markdown">(site.extension === "markdown" ? "markdown" : "md")
  const [slugTemplate, setSlugTemplate] = useState(site.slugTemplate || "{{slug}}")
  const [mediaFolder, setMediaFolder] = useState(site.mediaFolder ?? current?.mediaFolder ?? "")
  const [publicFolder, setPublicFolder] = useState(site.publicFolder ?? current?.publicFolder ?? "")
  const [dateFormat, setDateFormat] = useState(site.dateFormat ?? "")
  const [map, setMap] = useState<FieldMap>(() =>
    Object.values(site.fieldMap).some(Boolean) ? site.fieldMap : current ? autoFieldMap(current) : site.fieldMap,
  )
  const [urlPattern, setUrlPattern] = useState(site.urlPattern ?? "/blog/{slug}/")
  const [siteUrl, setSiteUrl] = useState(site.siteUrl ?? "")
  const [branch, setBranch] = useState(site.branch)
  const [commitName, setCommitName] = useState(site.commitName ?? "")
  const [commitEmail, setCommitEmail] = useState(site.commitEmail ?? "")
  const [deployHook, setDeployHook] = useState<string | undefined>(undefined)
  const [test, setTest] = useState<{ ok: boolean; text: string; url?: string | null } | null>(null)
  const [pending, start] = useTransition()
  const [testing, startTest] = useTransition()

  const pickCollection = (name: string) => {
    setCollection(name)
    const c = collections.find((x) => x.name === name)
    if (!c) return
    setFolder(c.folder)
    setExtension(c.extension === "markdown" ? "markdown" : "md")
    setSlugTemplate(c.slug || "{{slug}}")
    setMediaFolder(c.mediaFolder ?? "")
    setPublicFolder(c.publicFolder ?? "")
    const auto = autoFieldMap(c)
    setMap(auto)
    setDateFormat(auto.date ? (c.fields.find((f) => f.name === auto.date)?.format ?? "") : "")
  }

  const preview = useMemo(() => {
    const c: CmsCollection =
      current ??
      ({
        name: "posts",
        label: "Posts",
        folder,
        extension,
        format: "frontmatter",
        slug: slugTemplate,
        previewPath: null,
        mediaFolder,
        publicFolder,
        fields: [],
        hasBody: true,
        supported: true,
        reason: null,
      } satisfies CmsCollection)
    const withFormat: CmsCollection = {
      ...c,
      fields: c.fields.map((f) => (f.name === map.date ? { ...f, format: dateFormat || undefined } : f)),
    }
    try {
      return composePost(
        { ...SAMPLE, featuredImage: `${(publicFolder || "").replace(/\/+$/, "")}/sdr-cost-2026.png`, date: new Date() },
        withFormat,
        map,
      ).text
    } catch {
      return ""
    }
  }, [current, folder, extension, slugTemplate, mediaFolder, publicFolder, map, dateFormat])

  const missing = current ? emptyRequired(current, map) : []

  const save = () =>
    start(async () => {
      const r = await saveGitSite(site.id, {
        collection: collection === NONE ? null : collection,
        folder,
        extension,
        slugTemplate,
        mediaFolder,
        publicFolder,
        dateFormat: dateFormat || null,
        fieldMap: map,
        urlPattern,
        siteUrl,
        branch,
        commitName: commitName || null,
        commitEmail: commitEmail || null,
        ...(deployHook !== undefined ? { deployHook } : {}),
      })
      if (!r.ok) toast.error(r.error)
      else {
        toast.success("Site settings saved")
        onOpenChange(false)
      }
    })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>
            Set up {site.owner}/{site.repo}
          </SheetTitle>
          <SheetDescription>
            Where articles go in the repo and how they look. Read from the site&apos;s CMS config
            {site.configPath ? ` (${site.configPath})` : ""}; change anything that&apos;s wrong.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-5 py-5">
          {(site.detected.problem || site.detected.warnings.length > 0) && (
            <div className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
              {[site.detected.problem, ...site.detected.warnings].filter(Boolean).map((w) => (
                <p key={w} className="flex items-start gap-1.5">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  {w}
                </p>
              ))}
            </div>
          )}

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Blog collection</h3>
            {collections.length > 0 ? (
              <>
                <Select value={collection} onValueChange={pickCollection}>
                  <SelectTrigger className="w-full" aria-label="Collection">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map((c) => (
                      <SelectItem key={c.name} value={c.name} disabled={!c.supported}>
                        {c.label} ({c.folder || c.name}){c.supported ? "" : " · not supported"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {collections
                  .filter((c) => !c.supported)
                  .map((c) => (
                    <p key={c.name} className="text-xs text-muted-foreground">
                      {c.label}: {c.reason}
                    </p>
                  ))}
                {current?.reason && current.supported && <p className="text-xs text-muted-foreground">{current.reason}</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No CMS collections found. Set the post folder below by hand.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Post folder" id="gs-folder" value={folder} onChange={setFolder} placeholder="content/posts" />
              <Field label="Branch" id="gs-branch" value={branch} onChange={setBranch} placeholder="main" />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-semibold">Fields</h3>
              <p className="text-xs text-muted-foreground">Which field on the site gets each part of the article.</p>
            </div>
            <div className="flex flex-col divide-y rounded-md border">
              {FIELD_KEYS.map((k) => (
                <MapRow key={k} k={k} map={map} setMap={setMap} collection={current} />
              ))}
            </div>
            {excerptIsMeta(map) && (
              <p className="text-xs text-muted-foreground">
                The site has no separate meta description field, so the article&apos;s meta description is sent as the
                excerpt (falling back to the excerpt).
              </p>
            )}
            {missing.length > 0 && (
              <p className="text-xs text-warning">Required on the site but left empty: {missing.join(", ")}.</p>
            )}
            {map.date && (
              <Field
                label="Date format"
                id="gs-datefmt"
                value={dateFormat}
                onChange={setDateFormat}
                placeholder="Empty = 2026-11-27T09:00:00.000Z"
                hint="As the CMS stores it (YYYY-MM-DD, …). Always in UTC."
              />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Post address</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Site address" id="gs-site" value={siteUrl} onChange={setSiteUrl} placeholder="https://example.com" />
              <Field label="Post URL pattern" id="gs-url" value={urlPattern} onChange={setUrlPattern} placeholder="/blog/{slug}/" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                disabled={testing}
                onClick={() =>
                  startTest(async () => {
                    setTest(null)
                    const r = await testGitUrl(site.id, { siteUrl, urlPattern, folder, extension })
                    if (!r.ok) setTest({ ok: false, text: r.error })
                    else setTest({ ok: r.data.status === 200, text: r.data.message, url: r.data.url })
                  })
                }
              >
                <Play />
                {testing ? "Testing…" : "Test with an existing post"}
              </Button>
              {test && (
                <p className={cn("flex items-start gap-1.5 text-xs", test.ok ? "text-success" : "text-warning")}>
                  {test.ok ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleAlert className="size-3.5" aria-hidden />}
                  <span>
                    {test.text}
                    {test.url && (
                      <>
                        {" "}
                        <a href={test.url} target="_blank" rel="noreferrer" className="underline">
                          {test.url.replace(/^https?:\/\//, "")}
                        </a>
                      </>
                    )}
                  </span>
                </p>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Preview of a post file</h3>
            <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {preview || "Pick a collection to see the preview."}
            </pre>
          </section>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-2 text-muted-foreground">
                Advanced
                <ChevronDown />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-3 pt-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="File name" id="gs-slug" value={slugTemplate} onChange={setSlugTemplate} hint="{{slug}}, {{year}}-{{month}}-{{day}}-{{slug}}…" />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gs-ext">File type</Label>
                  <Select value={extension} onValueChange={(v) => setExtension(v === "markdown" ? "markdown" : "md")}>
                    <SelectTrigger id="gs-ext" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="md">.md</SelectItem>
                      <SelectItem value="markdown">.markdown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Field label="Image folder (repo)" id="gs-media" value={mediaFolder} onChange={setMediaFolder} placeholder="content/media" />
                <Field label="Image address (site)" id="gs-public" value={publicFolder} onChange={setPublicFolder} placeholder="/media" />
                <Field label="Commit as (name)" id="gs-cname" value={commitName} onChange={setCommitName} hint="Empty = LeadMaker Publisher" />
                <Field label="Commit as (email)" id="gs-cmail" value={commitEmail} onChange={setCommitEmail} />
              </div>
              <Field
                label="Deploy hook (optional)"
                id="gs-hook"
                type="password"
                value={deployHook ?? ""}
                onChange={(v) => setDeployHook(v)}
                placeholder="Only if the host doesn't build on every push"
                hint="A Vercel or Netlify deploy hook URL, kept in our vault. Leave empty to keep the current one."
              />
              <Button type="button" variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={() => setDeployHook("")}>
                Remove the saved deploy hook
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <SheetFooter className="sticky bottom-0 flex-row justify-end gap-2 border-t bg-popover px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
  hint,
  type = "text",
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  type?: "text" | "password"
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={type === "password" ? "new-password" : "off"}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function MapRow({
  k,
  map,
  setMap,
  collection,
}: {
  k: FieldKey
  map: FieldMap
  setMap: (m: FieldMap) => void
  collection: CmsCollection | null
}) {
  const fields = (collection?.fields ?? []).filter((f) => f.name !== "body" && (k !== "draft" || f.widget === "boolean"))
  const value = k === "draft" ? (map.draft?.name ?? NONE) : ((map[k] as string | null | undefined) ?? NONE)
  const set = (v: string) => {
    if (k === "draft") {
      const invert = /^(published|publish|ispublished)$/i.test(v.replace(/[^a-z]/gi, ""))
      setMap({ ...map, draft: v === NONE ? null : { name: v, invert } })
    } else setMap({ ...map, [k]: v === NONE ? null : v })
  }
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-40 shrink-0 text-sm">{FIELD_LABELS[k]}</span>
      {fields.length > 0 ? (
        <Select value={value} onValueChange={set}>
          <SelectTrigger className="h-8 w-full sm:flex-1" aria-label={`Site field for ${FIELD_LABELS[k]}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Don&apos;t send</SelectItem>
            {fields.map((f) => (
              <SelectItem key={f.name} value={f.name}>
                {f.label === f.name ? f.name : `${f.label} (${f.name})`}
                {k === "draft" && /^(published|publish|ispublished)$/i.test(f.name.replace(/[^a-z]/gi, "")) ? " · inverted" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          className="h-8 sm:flex-1"
          value={value === NONE ? "" : value}
          onChange={(e) => set(e.target.value.trim() || NONE)}
          placeholder="Field name, or empty to skip"
          aria-label={`Site field for ${FIELD_LABELS[k]}`}
        />
      )}
    </div>
  )
}
