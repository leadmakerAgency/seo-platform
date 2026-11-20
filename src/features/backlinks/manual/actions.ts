"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import type { ActionResult } from "@/features/tasks/schemas"
import { PermissionError, requirePermission } from "@/lib/auth"
import type { Permission } from "@/lib/roles"
import type { Json } from "@/lib/supabase/database.types"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { DIRECTORY_TYPES } from "../constants"
import { siteKeyOf } from "../site-key"
import {
  BLOCK_REASONS,
  CATEGORIES,
  LINK_KINDS,
  PRICINGS,
  SUBMISSION_STATUSES,
  MAX_PICK,
} from "./constants"

/**
 * Manual Search actions. Each checks its permission here; the database functions check the role
 * and the client again (private.require_backlinks_worker / _manager) and own every rule.
 */

async function guard(permission: Permission): Promise<string | null> {
  try {
    await requirePermission(permission)
    return null
  } catch (error) {
    if (error instanceof PermissionError) return error.message
    throw error
  }
}

const uuid = z.uuid()
const isUuid = (v: unknown): v is string => uuid.safeParse(v).success

function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  if (["P0001", "P0002", "42501", "22023", "23505"].includes(error?.code ?? "") && error?.message)
    return error.message
  return fallback
}

export type PickResult = {
  added: number
  approved: number
  already: number
  refused: { id: string; name: string; status: string; reason: string | null }[]
}

export async function pickCatalogSites(
  clientId: string,
  catalogIds: string[],
): Promise<ActionResult<PickResult>> {
  const denied = await guard("backlinks.manual")
  if (denied) return { ok: false, error: denied }
  const ids = [...new Set(catalogIds)].filter(isUuid)
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (ids.length === 0) return { ok: false, error: "Tick at least one site." }
  if (ids.length > MAX_PICK) return { ok: false, error: `Add at most ${MAX_PICK} sites at a time.` }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("pick_catalog_sites", {
    p_client_id: clientId,
    p_catalog_ids: ids,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't add the sites. Try again.") }
  refresh()
  return { ok: true, data: data as unknown as PickResult }
}

const addSiteSchema = z.object({
  url: z.string().trim().min(4, "Paste the site's address.").max(2000),
  name: z.string().trim().min(1, "Name the site.").max(120, "Keep the name under 120 characters."),
  type: z.enum(DIRECTORY_TYPES as [string, ...string[]]),
  costType: z.enum(["free", "paid", "unknown"]),
  note: z.string().trim().max(1000, "Keep the note under 1,000 characters.").optional(),
  suggest: z.boolean(),
})
export type AddSiteInput = z.input<typeof addSiteSchema>

export async function addManualSite(
  clientId: string,
  input: AddSiteInput,
): Promise<ActionResult<{ submissionId: string | null; result: string }>> {
  const denied = await guard("backlinks.manual")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const parsed = addSiteSchema.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Check the form.",
      fieldErrors: { [String(first?.path[0] ?? "url")]: first?.message ?? "" },
    }
  }
  const v = parsed.data
  const url = /^https?:\/\//i.test(v.url) ? v.url : `https://${v.url}`
  const key = siteKeyOf(url)
  if (!key)
    return {
      ok: false,
      error: "That doesn't look like a website address.",
      fieldErrors: { url: "Use a full link like https://example.com" },
    }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("add_manual_site", {
    p_client_id: clientId,
    p: {
      site_key: key.siteKey,
      domain: key.domain,
      url,
      name: v.name,
      type: v.type,
      cost_type: v.costType,
      note: v.note || null,
      suggest: v.suggest,
    } as Json,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't add the site. Try again.") }
  refresh()
  const res = data as { result: string; submission_id: string | null } | null
  return {
    ok: true,
    data: { submissionId: res?.submission_id ?? null, result: res?.result ?? "added" },
  }
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date.")
const patchSchema = z
  .object({
    status: z.enum(SUBMISSION_STATUSES as [string, ...string[]]),
    block_reason: z.enum(BLOCK_REASONS as [string, ...string[]]).nullable(),
    block_note: z.string().trim().max(500, "Keep the note under 500 characters.").nullable(),
    assigned_to: uuid.nullable(),
    follow_up_on: day.nullable(),
    listing_url: z
      .string()
      .trim()
      .max(2000)
      .refine(
        (s) => s === "" || /^https?:\/\/\S+$/i.test(s),
        "Use a full link starting with https://",
      )
      .nullable(),
    link_kind: z.enum(LINK_KINDS as [string, ...string[]]).nullable(),
    submitted_on: day.nullable(),
    live_on: day.nullable(),
    login_id: uuid.nullable(),
    cost_usd: z.number().min(0, "Can't be negative.").max(100000).nullable(),
    cost_note: z.string().trim().max(200, "Keep it under 200 characters.").nullable(),
    notes: z.string().trim().max(4000, "Keep notes under 4,000 characters.").nullable(),
  })
  .partial()
export type SubmissionPatch = z.input<typeof patchSchema>

export async function updateSubmission(id: string, patch: SubmissionPatch): Promise<ActionResult> {
  const denied = await guard("backlinks.manual")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(id)) return { ok: false, error: "Unknown listing." }
  const parsed = patchSchema.safeParse(patch)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("update_submission", { p_id: id, p: parsed.data as Json })
  if (error) return { ok: false, error: dbError(error, "Couldn't save. Try again.") }
  refresh()
  return { ok: true }
}

const bulkSchema = z
  .object({
    status: z.enum(["todo", "doing", "submitted", "skipped"]),
    assigned_to: uuid.nullable(),
    follow_up_on: day.nullable(),
  })
  .partial()

export async function bulkUpdateSubmissions(
  ids: string[],
  patch: z.input<typeof bulkSchema>,
): Promise<ActionResult<{ changed: number }>> {
  const denied = await guard("backlinks.manual")
  if (denied) return { ok: false, error: denied }
  const clean = [...new Set(ids)].filter(isUuid)
  if (clean.length === 0) return { ok: false, error: "Tick at least one listing." }
  const parsed = bulkSchema.safeParse(patch)
  if (!parsed.success || Object.keys(parsed.data).length === 0)
    return { ok: false, error: "Pick what to change." }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("bulk_update_submissions", {
    p_ids: clean,
    p: parsed.data as Json,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save. Try again.") }
  refresh()
  return { ok: true, data: { changed: Number(data ?? 0) } }
}

const loginSchema = z.object({
  siteName: z.string().trim().min(1, "Name the site.").max(120),
  siteUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (s) => s === "" || /^https?:\/\/\S+$/i.test(s),
      "Use a full link starting with https://",
    ),
  username: z.string().trim().min(1, "Enter the username or email.").max(200),
  password: z.string().min(1, "Enter the password.").max(500),
  has2fa: z.boolean(),
})

/** Save the account a VA made on a directory to the vault and link it to the listing. */
export async function addBacklinkLogin(
  submissionId: string,
  input: z.input<typeof loginSchema>,
): Promise<ActionResult> {
  const denied = await guard("backlinks.manual")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(submissionId)) return { ok: false, error: "Unknown listing." }
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." }
  const v = parsed.data
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("add_backlink_login", {
    p_submission_id: submissionId,
    p_site_name: v.siteName,
    p_site_url: v.siteUrl || "",
    p_username: v.username,
    p_password: v.password,
    p_has_2fa: v.has2fa,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the login. Try again.") }
  refresh()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// The catalog (admins and managers)
// ---------------------------------------------------------------------------

const list = (max: number) => z.array(z.string().trim().min(1).max(60)).max(max)
const catalogSchema = z.object({
  id: uuid.optional(),
  url: z.string().trim().max(500).optional(),
  name: z.string().trim().min(1, "Name the site.").max(120, "Keep the name under 120 characters."),
  kind: z.enum(["site", "play"]),
  category: z.enum(CATEGORIES as [string, ...string[]]),
  homeUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (s) => s === "" || /^https?:\/\/\S+$/i.test(s),
      "Use a full link starting with https://",
    ),
  submitUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (s) => s === "" || /^https?:\/\/\S+$/i.test(s),
      "Use a full link starting with https://",
    ),
  countries: list(60),
  reach: z.array(z.enum(["local", "national", "global"])),
  buyer: z.array(z.enum(["b2b", "b2c"])),
  offering: z.array(z.enum(["services", "software", "products"])),
  industries: list(60),
  pricing: z.enum(PRICINGS as [string, ...string[]]),
  priceNote: z.string().trim().max(160, "Keep it under 160 characters."),
  typicalLink: z.enum(LINK_KINDS as [string, ...string[]]),
  priority: z.number().int().min(1).max(3),
  benefits: list(6),
  needs: list(12),
  howTo: z.string().trim().max(2000, "Keep the steps under 2,000 characters."),
  warnings: z.string().trim().max(500, "Keep warnings under 500 characters."),
  notes: z.string().trim().max(1000, "Keep notes under 1,000 characters."),
  active: z.boolean(),
})
export type CatalogInput = z.input<typeof catalogSchema>

export async function saveCatalogSite(input: CatalogInput): Promise<ActionResult<{ id: string }>> {
  const denied = await guard("backlinks.catalog")
  if (denied) return { ok: false, error: denied }
  const parsed = catalogSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." }
  const v = parsed.data
  const p: Record<string, unknown> = {
    id: v.id ?? null,
    name: v.name,
    kind: v.kind,
    category: v.category,
    home_url: v.homeUrl,
    submit_url: v.submitUrl,
    countries: v.countries.map((c) => c.toUpperCase()),
    reach: v.reach,
    buyer: v.buyer,
    offering: v.offering,
    industries: v.industries,
    pricing: v.pricing,
    price_note: v.priceNote,
    typical_link: v.typicalLink,
    priority: v.priority,
    benefits: v.benefits,
    needs: v.needs,
    how_to: v.howTo,
    warnings: v.warnings,
    notes: v.notes,
    active: v.active,
  }
  if (!v.id) {
    const raw = (v.url || v.homeUrl || "").trim()
    if (v.kind === "play") {
      const slug = v.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60)
      p.site_key = `play:${slug || "play"}`
      p.domain = "catalog-play.invalid"
    } else {
      const key = siteKeyOf(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
      if (!key)
        return { ok: false, error: "Add the site's address (for example https://www.yelp.com)." }
      p.site_key = key.siteKey
      p.domain = key.domain
      if (!v.homeUrl) p.home_url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    }
  }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("save_catalog_site", { p: p as Json })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the site. Try again.") }
  refresh()
  return { ok: true, data: { id: String(data) } }
}

export async function verifyCatalogSite(id: string): Promise<ActionResult> {
  const denied = await guard("backlinks.catalog")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(id)) return { ok: false, error: "Unknown site." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("verify_catalog_site", { p_id: id })
  if (error) return { ok: false, error: dbError(error, "Couldn't save. Try again.") }
  refresh()
  return { ok: true }
}

export async function reviewCatalogSuggestion(id: string, accept: boolean): Promise<ActionResult> {
  const denied = await guard("backlinks.catalog")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(id)) return { ok: false, error: "Unknown site." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("review_catalog_suggestion", { p_id: id, p_accept: accept })
  if (error) return { ok: false, error: dbError(error, "Couldn't save. Try again.") }
  refresh()
  return { ok: true }
}

export async function reportCatalogProblem(id: string, note: string): Promise<ActionResult> {
  const denied = await guard("backlinks.manual")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(id)) return { ok: false, error: "Unknown site." }
  const text = note.trim()
  if (text.length < 3 || text.length > 500)
    return { ok: false, error: "Say what's wrong in 3 to 500 characters." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("report_catalog_problem", { p_id: id, p_note: text })
  if (error) return { ok: false, error: dbError(error, "Couldn't send. Try again.") }
  refresh()
  return { ok: true }
}
