"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import type { ActionResult } from "@/features/tasks/schemas"
import { PermissionError, requirePermission } from "@/lib/auth"
import type { Db } from "@/lib/dataforseo/client"
import { hasGitHubApp } from "@/lib/env.server"
import { forToken, gitHubProblem, installUrl } from "@/lib/github/app"
import type { Json } from "@/lib/supabase/database.types"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { safePublicPath, safeRepoPath } from "./config"
import { FIELD_KEYS, readFieldMap } from "./field-map"
import { isPublicSiteUrl, liveUrl } from "./files"
import { parseFrontMatter } from "./frontmatter"
import { checkGitConnection, clientFor, clientSiteUrl, discoverSite } from "./server"

/**
 * Connections → Git-based site (docs/plans/git-cms/05-github-app-and-connecting.md).
 * Every action checks `connections.manage` here; the database functions check the role and
 * the client again. Tokens go straight into Vault and are never returned or logged.
 */

async function guard(): Promise<string | null> {
  try {
    await requirePermission("connections.manage")
    return null
  } catch (error) {
    if (error instanceof PermissionError) return error.message
    throw error
  }
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)
const NO_SECRET = "The server isn't set up for this yet: SUPABASE_SECRET_KEY is missing."

function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  if (error?.message && ["P0001", "42501", "22023"].includes(error.code ?? "")) return error.message
  return fallback
}

/** "Connect with GitHub": returns the GitHub App install page to send the browser to. */
export async function startGitConnect(clientId: string): Promise<ActionResult<{ url: string }>> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (!hasGitHubApp()) return { ok: false, error: "The GitHub App isn't set up on the server yet. Use a token for now." }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("start_git_connect", { p_client_id: clientId })
  const r = (data ?? {}) as { attempt_id?: string; key?: string }
  if (error || !r.attempt_id || !r.key) return { ok: false, error: dbError(error, "Couldn't start connecting.") }
  return { ok: true, data: { url: installUrl(`${r.attempt_id}.${r.key}`) } }
}

const repoSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, ""))
  .pipe(z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/, "Enter the repo as owner/name, for example acme/website."))

const tokenSchema = z.object({
  repo: repoSchema,
  token: z.string().trim().min(20, "That doesn't look like a GitHub token.").max(400),
  connectionId: z.string().uuid().nullable().optional(),
})

/** "Use a token instead": stores the token (Vault), then checks it against the repo. */
export async function connectGitToken(
  clientId: string,
  input: z.input<typeof tokenSchema>,
): Promise<ActionResult<{ connectionId: string; connected: boolean; message: string | null }>> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (!hasSupabaseSecretKey()) return { ok: false, error: NO_SECRET }
  const parsed = tokenSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the repo and token." }
  const [owner, repo] = parsed.data.repo.split("/")

  // Check first, so a wrong token or repo never reaches Vault.
  let discovery: Awaited<ReturnType<typeof discoverSite>>
  const gh = forToken(parsed.data.token)
  try {
    discovery = await discoverSite(gh, owner, repo)
  } catch (e) {
    return { ok: false, error: gitHubProblem(e) }
  }

  const supabase = await createSupabaseServerClient()
  const { data: id, error } = await supabase.rpc("save_git_token", {
    p_client_id: clientId,
    // null = a new connection (the function accepts it; the generated type says string).
    p_connection_id: (parsed.data.connectionId ?? null) as string,
    p_owner: owner,
    p_repo: repo,
    p_token: parsed.data.token,
  })
  if (error || !id) return { ok: false, error: dbError(error, "Couldn't save the token.") }

  const admin = createSupabaseAdminClient() as unknown as Db
  const p: Record<string, unknown> = {
    repo_id: discovery.repoId,
    config_path: discovery.configPath,
    detected: discovery.detected,
    site_url: await clientSiteUrl(admin, clientId),
    token_expires_at: gh.tokenExpiresAt ?? "",
    ...discovery.defaults,
  }
  await admin.rpc("git_set_connection_status", {
    p_id: id,
    p_status: discovery.problem ? "needs_attention" : "connected",
    p_error: discovery.problem ?? "",
    p: p as Json,
  })
  refresh()
  return { ok: true, data: { connectionId: id, connected: !discovery.problem, message: discovery.problem } }
}

const relPath = (label: string) =>
  z
    .string()
    .trim()
    .max(200)
    .refine((s) => safeRepoPath(s) !== null, `${label}: use a folder inside the repo (no "..").`)

const settingsSchema = z.object({
  collection: z.string().trim().max(100).nullable(),
  folder: relPath("Post folder"),
  extension: z.enum(["md", "markdown"]),
  slugTemplate: z.string().trim().min(1).max(200).refine((s) => !s.includes(".."), "The file name can't contain ..").default("{{slug}}"),
  mediaFolder: relPath("Image folder"),
  publicFolder: z
    .string()
    .trim()
    .max(200)
    .refine((s) => safePublicPath(s) !== null, "Image address: start with / (for example /media)."),
  dateFormat: z.string().trim().max(40).nullable(),
  fieldMap: z.record(z.string(), z.unknown()),
  urlPattern: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/[A-Za-z0-9/_{}.-]*$/, "The post address must start with / (for example /blog/{slug}/).")
    .refine((s) => s.includes("{slug}"), "The post address needs {slug}."),
  siteUrl: z
    .string()
    .trim()
    .transform((s) => s.replace(/\/+$/, ""))
    .pipe(z.string().regex(/^https?:\/\/[^/\s]+$/, "The site address must look like https://example.com.")),
  branch: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._/-]+$/, "That branch name isn't valid.").refine((s) => !s.includes("..")),
  commitName: z.string().trim().max(100).nullable(),
  commitEmail: z.union([z.string().trim().email("The commit email isn't valid.").max(200), z.literal(""), z.null()]),
  /** undefined = unchanged; "" = remove. */
  deployHook: z.string().trim().max(400).optional(),
})

export type GitSiteSettings = z.input<typeof settingsSchema>

/** Set up site → Save. */
export async function saveGitSite(connectionId: string, input: GitSiteSettings): Promise<ActionResult> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(connectionId)) return { ok: false, error: "Unknown site." }
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the settings." }
  const s = parsed.data
  const map = readFieldMap(s.fieldMap)
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("save_git_connection", {
    p_id: connectionId,
    p: {
      collection: s.collection ?? "",
      folder: safeRepoPath(s.folder),
      extension: s.extension,
      slug_template: s.slugTemplate,
      media_folder: safeRepoPath(s.mediaFolder),
      public_folder: safePublicPath(s.publicFolder),
      date_format: s.dateFormat ?? "",
      field_map: Object.fromEntries(FIELD_KEYS.map((k) => [k, map[k] ?? null])),
      url_pattern: s.urlPattern,
      site_url: s.siteUrl,
      branch: s.branch,
      commit_name: s.commitName ?? "",
      commit_email: s.commitEmail ?? "",
    } as Json,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the site settings.") }
  if (s.deployHook !== undefined) {
    const { error: e2 } = await supabase.rpc("save_git_deploy_hook", { p_id: connectionId, p_url: s.deployHook })
    if (e2) return { ok: false, error: dbError(e2, "Couldn't save the deploy hook.") }
  }
  refresh()
  return { ok: true }
}

/** "Check connection": access, branch, config, token expiry (also re-reads the CMS config). */
export async function checkGitSite(connectionId: string): Promise<ActionResult<{ connected: boolean; message: string | null }>> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(connectionId)) return { ok: false, error: "Unknown site." }
  if (!hasSupabaseSecretKey()) return { ok: false, error: NO_SECRET }
  // The person must be able to see this connection (RLS), before the admin client is used.
  const supabase = await createSupabaseServerClient()
  const { data: visible } = await supabase.from("git_connections").select("id").eq("id", connectionId).maybeSingle()
  if (!visible) return { ok: false, error: "Unknown site." }
  const r = await checkGitConnection(createSupabaseAdminClient() as unknown as Db, connectionId)
  refresh()
  return { ok: true, data: { connected: r.ok, message: r.error } }
}

export async function removeGitSite(connectionId: string): Promise<ActionResult> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(connectionId)) return { ok: false, error: "Unknown site." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("remove_git_connection", { p_id: connectionId })
  if (error) return { ok: false, error: dbError(error, "Couldn't disconnect the site.") }
  refresh()
  return { ok: true }
}

/**
 * Set up site → Test: builds the address of an existing post with the pattern and checks that
 * the site answers 200. Only fetches the client's own site address.
 */
export async function testGitUrl(
  connectionId: string,
  input: { siteUrl: string; urlPattern: string; folder: string; extension: string },
): Promise<ActionResult<{ url: string | null; status: number | null; message: string }>> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  if (!isUuid(connectionId)) return { ok: false, error: "Unknown site." }
  const folder = safeRepoPath(input.folder)
  const site = input.siteUrl.trim().replace(/\/+$/, "")
  if (!folder || !/^https?:\/\/[^/\s]+$/.test(site)) return { ok: false, error: "Set the post folder and site address first." }

  const supabase = await createSupabaseServerClient()
  const { data: c } = await supabase
    .from("git_connections")
    .select("id, auth_method, installation_id, repo_id, owner, repo, branch")
    .eq("id", connectionId)
    .maybeSingle()
  if (!c) return { ok: false, error: "Unknown site." }
  try {
    const gh = await clientFor(createSupabaseAdminClient() as unknown as Db, c)
    const list = (await gh.listFolder(c.owner, c.repo, folder, c.branch)) ?? []
    const ext = input.extension === "markdown" ? ".markdown" : ".md"
    const files = list.filter((e) => e.type === "file" && e.name.endsWith(ext))
    if (!files.length) return { ok: true, data: { url: null, status: null, message: "No posts in that folder yet, so there's nothing to test." } }
    const last = files[files.length - 1]
    const f = await gh.getFile(c.owner, c.repo, last.path, c.branch)
    const fm = f ? parseFrontMatter(f.content.toString("utf8").slice(0, 20_000)) : null
    const raw = (typeof fm?.data.slug === "string" && fm.data.slug) || last.name.slice(0, -ext.length)
    const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    const date = fm?.data.date ? new Date(String(fm.data.date)) : new Date()
    const url = liveUrl(site, input.urlPattern.trim(), { slug, date: Number.isNaN(date.getTime()) ? new Date() : date })
    if (!url) return { ok: false, error: "The post address must start with / and use {slug}." }
    if (!isPublicSiteUrl(url)) return { ok: false, error: "Only public https sites can be tested." }
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10_000), cache: "no-store" })
    await res.body?.cancel()
    return {
      ok: true,
      data: {
        url,
        status: res.status,
        message: res.ok ? "An existing post opens at this address." : `The site answered ${res.status} for an existing post. Check the pattern.`,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "The site didn't answer in 10 seconds." : gitHubProblem(e) }
  }
}
