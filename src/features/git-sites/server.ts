import "server-only"

import type { Db } from "@/lib/dataforseo/client"
import { forInstallation, forToken, gitHubProblem, GitHub, GitHubError } from "@/lib/github/app"
import type { Json } from "@/lib/supabase/database.types"
import { CONFIG_PATHS, configLinkFromIndexHtml, guessBlogCollection, parseCmsConfig, type CmsCollection, type CmsConfig } from "./config"
import { autoFieldMap } from "./field-map"
import { patternFromPermalink, patternFromPreviewPath } from "./files"
import { parseFrontMatter } from "./frontmatter"

/**
 * Talking to a connected Git site (docs/plans/git-cms/05-github-app-and-connecting.md).
 * Server only; called with the admin client after the action checked the person's permission.
 * Repo content is untrusted data: it only fills settings, and paths are checked in config.ts.
 */

export type GitConnectionRow = {
  id: string
  client_id: string
  auth_method: "github_app" | "token"
  installation_id: number | null
  owner: string
  repo: string
  repo_id: number | null
  branch: string
  collection: string | null
  token_expires_at: string | null
  status: "connected" | "needs_attention" | "removed"
}

/** A GitHub client for a connection: an installation token, or the Vault token. */
export async function clientFor(admin: Db, c: Pick<GitConnectionRow, "id" | "auth_method" | "installation_id" | "repo_id">): Promise<GitHub> {
  if (c.auth_method === "github_app") {
    if (!c.installation_id) throw new GitHubError("This site has no GitHub App installation. Reconnect it.", 401, "auth")
    return forInstallation(c.installation_id, c.repo_id)
  }
  const { data, error } = await admin.rpc("git_connection_secret", { p_id: c.id, p_kind: "token" })
  if (error || !data) throw new GitHubError("The token for this site is missing. Add it again.", 401, "auth")
  return forToken(data)
}

export type Discovery = {
  repoId: number
  defaultBranch: string
  branch: string
  configPath: string | null
  config: CmsConfig | null
  problem: string | null
  /** Set up site defaults for git_finish_connect / git_set_connection_status. */
  defaults: Record<string, unknown>
  /** What Set up site shows (no file contents). */
  detected: Record<string, unknown>
}

function summarise(cfg: CmsConfig | null, configPath: string | null, problem: string | null) {
  return {
    config_path: configPath,
    problem,
    warnings: cfg?.warnings ?? [],
    backend: cfg?.backend ?? null,
    media_folder: cfg?.mediaFolder ?? null,
    public_folder: cfg?.publicFolder ?? null,
    collections: (cfg?.collections ?? []).map((c) => ({
      name: c.name,
      label: c.label,
      folder: c.folder,
      extension: c.extension,
      slug: c.slug,
      preview_path: c.previewPath,
      media_folder: c.mediaFolder,
      public_folder: c.publicFolder,
      supported: c.supported,
      reason: c.reason,
      fields: c.fields.map((f) => ({
        name: f.name,
        label: f.label,
        widget: f.widget,
        required: f.required,
        ...(f.format ? { format: f.format } : {}),
        ...(f.default !== undefined && ["string", "number", "boolean"].includes(typeof f.default) ? { default: f.default } : {}),
      })),
    })),
    read_at: new Date().toISOString(),
  }
}

/** Finds and reads the CMS config on `branch` (the usual paths, then admin/index.html's link). */
async function findConfig(gh: GitHub, owner: string, repo: string, branch: string) {
  for (const path of CONFIG_PATHS) {
    const f = await gh.getFile(owner, repo, path, branch)
    if (f) return { path, text: f.content.toString("utf8") }
  }
  for (const index of ["admin/index.html", "public/admin/index.html", "static/admin/index.html"]) {
    const f = await gh.getFile(owner, repo, index, branch)
    const link = f ? configLinkFromIndexHtml(f.content.toString("utf8"), index) : null
    if (link) {
      const cfg = await gh.getFile(owner, repo, link, branch)
      if (cfg) return { path: link, text: cfg.content.toString("utf8") }
    }
  }
  return null
}

/** The post URL pattern: the collection's preview_path, else an existing post's permalink. */
async function guessUrlPattern(gh: GitHub, owner: string, repo: string, branch: string, c: CmsCollection): Promise<string> {
  const fromPreview = patternFromPreviewPath(c.previewPath)
  if (fromPreview) return fromPreview
  try {
    const list = (await gh.listFolder(owner, repo, c.folder, branch)) ?? []
    const mdFiles = list.filter((e) => e.type === "file" && e.name.endsWith(`.${c.extension}`)).slice(-3)
    for (const e of mdFiles) {
      const f = await gh.getFile(owner, repo, e.path, branch)
      const fm = f ? parseFrontMatter(f.content.toString("utf8").slice(0, 20_000)) : null
      const p = fm ? patternFromPermalink(fm.data.permalink, fm.data.slug ?? e.name.replace(/\.[^.]+$/, "")) : null
      if (p) return p
    }
  } catch {
    // Fall back below.
  }
  return "/blog/{slug}/"
}

/** Reads a repo: access, branch, CMS config, the blog collection and Set up site defaults. */
export async function discoverSite(gh: GitHub, owner: string, repo: string, branchWanted?: string | null): Promise<Discovery> {
  const info = await gh.getRepo(owner, repo)
  if (!info.canPush) throw new GitHubError("LeadMaker can read this repo but can't write to it.", 403, "forbidden")
  let branch = branchWanted || info.defaultBranch
  let found = await findConfig(gh, owner, repo, branch)
  let config: CmsConfig | null = null
  let problem: string | null = null
  if (found) {
    const parsed = parseCmsConfig(found.text, `${owner}/${repo}`)
    if ("error" in parsed) problem = parsed.error
    else {
      config = parsed
      // The CMS commits to its own branch; follow it unless one was picked.
      if (!branchWanted && parsed.backend.branch && parsed.backend.branch !== branch) {
        branch = parsed.backend.branch
        found = (await findConfig(gh, owner, repo, branch)) ?? found
      }
    }
  } else {
    problem = "No Sveltia or Decap CMS config found (admin/config.yml). We can still publish once the post folder is set."
  }

  const defaults: Record<string, unknown> = { branch, config_path: found?.path ?? null }
  const blog = config ? guessBlogCollection(config) : null
  if (config && !blog) problem = "The CMS config has no blog collection we can publish to yet."
  if (blog) {
    defaults.collection = blog.name
    defaults.folder = blog.folder
    defaults.media_folder = blog.mediaFolder
    defaults.public_folder = blog.publicFolder
    defaults.slug_template = blog.slug
    const map = autoFieldMap(blog)
    defaults.field_map = map
    defaults.date_format = map.date ? (blog.fields.find((f) => f.name === map.date)?.format ?? null) : null
    defaults.url_pattern = await guessUrlPattern(gh, owner, repo, branch, blog)
  }
  return {
    repoId: info.id,
    defaultBranch: info.defaultBranch,
    branch,
    configPath: found?.path ?? null,
    config,
    problem,
    defaults,
    detected: summarise(config, found?.path ?? null, problem),
  }
}

/** The client's website as `https://host`, for the site address default. */
export async function clientSiteUrl(admin: Db, clientId: string): Promise<string | null> {
  const { data } = await admin.from("clients").select("website").eq("id", clientId).maybeSingle()
  const raw = (data?.website ?? "").trim()
  if (!raw) return null
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

/**
 * The health check (daily, after connecting, and from "Check connection"): access, push,
 * branch, config and collection, token expiry. Stores the result with git_set_connection_status.
 */
export async function checkGitConnection(admin: Db, connectionId: string): Promise<{ ok: boolean; error: string | null }> {
  const { data: c } = await admin
    .from("git_connections")
    .select("id, client_id, auth_method, installation_id, owner, repo, repo_id, branch, collection, token_expires_at, status")
    .eq("id", connectionId)
    .maybeSingle()
  if (!c || c.status === "removed") return { ok: false, error: "Unknown site." }
  let status: "connected" | "needs_attention" = "connected"
  let error: string | null = null
  const extra: Record<string, unknown> = {}
  try {
    const gh = await clientFor(admin, c as GitConnectionRow)
    const d = await discoverSite(gh, c.owner, c.repo, c.branch)
    await gh.getBranchHead(c.owner, c.repo, c.branch)
    extra.repo_id = d.repoId
    extra.detected = d.detected
    if (d.configPath) extra.config_path = d.configPath
    Object.assign(extra, { ...d.defaults, branch: undefined, config_path: d.configPath ?? undefined })
    if (gh.tokenExpiresAt) extra.token_expires_at = gh.tokenExpiresAt
    const collections = d.config?.collections ?? []
    if (c.collection && !collections.some((x) => x.name === c.collection && x.supported)) {
      status = "needs_attention"
      error = `The collection "${c.collection}" isn't in the CMS config any more. Pick it again in Set up site.`
    } else if (!c.collection && d.problem) {
      status = "needs_attention"
      error = d.problem
    }
    const exp = gh.tokenExpiresAt ?? c.token_expires_at
    if (status === "connected" && exp && Date.parse(exp) - Date.now() < 14 * 86_400_000) {
      status = "needs_attention"
      error = `The GitHub token expires on ${exp.slice(0, 10)}. Add a new one.`
    }
  } catch (e) {
    status = "needs_attention"
    error = gitHubProblem(e)
  }
  const p = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined && v !== null))
  await admin.rpc("git_set_connection_status", { p_id: c.id, p_status: status, p_error: error ?? "", p: p as Json })
  return { ok: status === "connected", error }
}
