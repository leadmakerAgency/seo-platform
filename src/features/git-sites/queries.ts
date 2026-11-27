import "server-only"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { readFieldMap, type FieldMap } from "./field-map"

/** Git sites of a client for Connections and Content (RLS: team members who can see the client). */

export type DetectedCollection = {
  name: string
  label: string
  folder: string
  extension: string
  slug: string
  preview_path: string | null
  media_folder: string | null
  public_folder: string | null
  supported: boolean
  reason: string | null
  fields: { name: string; label: string; widget: string; required: boolean; format?: string; default?: unknown }[]
}

export type GitSite = {
  id: string
  authMethod: "github_app" | "token"
  owner: string
  repo: string
  branch: string
  status: "connected" | "needs_attention" | "removed"
  lastError: string | null
  lastCheckedAt: string | null
  tokenExpiresAt: string | null
  collection: string | null
  folder: string | null
  extension: string
  slugTemplate: string
  mediaFolder: string | null
  publicFolder: string | null
  dateFormat: string | null
  fieldMap: FieldMap
  urlPattern: string | null
  siteUrl: string | null
  commitName: string | null
  commitEmail: string | null
  configPath: string | null
  detected: {
    problem: string | null
    warnings: string[]
    collections: DetectedCollection[]
    read_at: string | null
  }
  createdAt: string
}

const COLUMNS =
  "id, auth_method, owner, repo, branch, status, last_error, last_checked_at, token_expires_at, collection, folder, extension, slug_template, media_folder, public_folder, date_format, field_map, url_pattern, site_url, commit_name, commit_email, config_path, detected, created_at"

export async function getGitSites(clientId: string): Promise<GitSite[]> {
  const db = await createSupabaseServerClient()
  const { data } = await db
    .from("git_connections")
    .select(COLUMNS)
    .eq("client_id", clientId)
    .neq("status", "removed")
    .order("created_at", { ascending: true })
  return (data ?? []).map((r) => {
    const d = (r.detected ?? {}) as Record<string, unknown>
    return {
      id: r.id,
      authMethod: r.auth_method,
      owner: r.owner,
      repo: r.repo,
      branch: r.branch,
      status: r.status,
      lastError: r.last_error,
      lastCheckedAt: r.last_checked_at,
      tokenExpiresAt: r.token_expires_at,
      collection: r.collection,
      folder: r.folder,
      extension: r.extension,
      slugTemplate: r.slug_template,
      mediaFolder: r.media_folder,
      publicFolder: r.public_folder,
      dateFormat: r.date_format,
      fieldMap: readFieldMap(r.field_map),
      urlPattern: r.url_pattern,
      siteUrl: r.site_url,
      commitName: r.commit_name,
      commitEmail: r.commit_email,
      configPath: r.config_path,
      detected: {
        problem: typeof d.problem === "string" ? d.problem : null,
        warnings: Array.isArray(d.warnings) ? (d.warnings as string[]) : [],
        collections: Array.isArray(d.collections) ? (d.collections as DetectedCollection[]) : [],
        read_at: typeof d.read_at === "string" ? d.read_at : null,
      },
      createdAt: r.created_at,
    }
  })
}

/** Set up is finished when the post folder and URL pattern are known. */
export const isSetUp = (s: Pick<GitSite, "folder" | "urlPattern" | "siteUrl">) => Boolean(s.folder && s.urlPattern && s.siteUrl)
