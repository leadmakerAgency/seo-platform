import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { getDataForSeoAuth, getDataForSeoBase } from "@/lib/env.server"
import type { Database } from "@/lib/supabase/database.types"

/**
 * DataForSEO v3 client (server only; the login never reaches the browser).
 *
 * - Every HTTP call is written to `dfs_calls` with the real `cost` from the response,
 *   so spend is exact and the monthly budget can be enforced.
 * - At most 20 calls at once (DataForSEO allows 30); Google Ads Live calls are spaced
 *   5 s apart (12 per minute).
 * - Retries: transient codes (40103, 50303, 50401, 5xx, 429) and "too many requests"
 *   (40202, 40209) with backoff. Calls that create tasks (`idempotent: false`) are only
 *   retried when DataForSEO answered and refused them, never after a timeout, so a
 *   task is never paid for twice. Funds/limit errors (40200, 40210, 40203) stop at once.
 */

export type Db = SupabaseClient<Database>
export type DfsApi = Database["public"]["Enums"]["dfs_api"]

export type DfsTask<R = Record<string, unknown>> = {
  id: string
  status_code: number
  status_message: string
  cost?: number
  result_count?: number
  data?: Record<string, unknown>
  result: R[] | null
}

export type DfsEnvelope<R = Record<string, unknown>> = {
  status_code: number
  status_message: string
  cost?: number
  tasks?: DfsTask<R>[] | null
}

export type DfsErrorKind = "funds" | "rate" | "input" | "server" | "network" | "auth"

export class DfsError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly http: number | null,
    readonly kind: DfsErrorKind,
  ) {
    super(message)
    this.name = "DfsError"
  }
}

const TIMEOUT_MS = 120_000
const MAX_CONCURRENT = 20
const ADS_GAP_MS = 5_100
const RETRY_CODES = new Set([40103, 40202, 40209, 50000, 50001, 50303, 50401])
const REFUSED_CODES = new Set([40202, 40209, 50303]) // the request was not accepted: safe to resend
const FUNDS_CODES = new Set([40200, 40210, 40203])
const BACKOFF_MS = [2_000, 8_000, 30_000]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// --- concurrency --------------------------------------------------------------
let active = 0
const waiting: (() => void)[] = []
async function acquire() {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve))
  active++
}
function release() {
  active--
  waiting.shift()?.()
}

let lastAdsCall = 0
async function spaceAdsCall() {
  const wait = lastAdsCall + ADS_GAP_MS - Date.now()
  lastAdsCall = Math.max(Date.now(), lastAdsCall + ADS_GAP_MS)
  if (wait > 0) await sleep(wait)
}

function kindFor(code: number | null, http: number | null): DfsErrorKind {
  if (http === 401) return "auth"
  if (http === 402 || (code !== null && FUNDS_CODES.has(code))) return "funds"
  if (code === 40202 || code === 40209 || http === 429) return "rate"
  if ((code !== null && code >= 50000) || (http !== null && http >= 500)) return "server"
  return "input"
}

/** "/v3/serp/google/organic/task_get/advanced/0b1c…" → "serp/google/organic/task_get/advanced/:id" */
const endpointLabel = (path: string) =>
  path
    .replace(/^\/?v3\//, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .slice(0, 200)

function itemsIn(envelope: DfsEnvelope | null): number {
  let n = 0
  for (const t of envelope?.tasks ?? []) {
    for (const r of t.result ?? []) {
      const c = (r as { items_count?: unknown }).items_count
      if (typeof c === "number") n += c
    }
  }
  return n
}

export type CallOptions = {
  api: DfsApi
  /** For the spend ledger and per-client budgets. */
  clientId?: string | null
  /** Run / check / research id, for the ledger. */
  ref?: string | null
  body?: unknown
  /** Safe to resend after a timeout (reads, Live lookups). Task posts: false. */
  idempotent?: boolean
  /** Longer wait for slow calls (Live searches that resolve Google's goto links). */
  timeoutMs?: number
}

/** One DataForSEO request. Returns the envelope when the top-level status is 20000. */
export async function dfsCall<R = Record<string, unknown>>(
  db: Db,
  method: "GET" | "POST",
  path: string,
  opts: CallOptions,
): Promise<DfsEnvelope<R>> {
  const url = `${getDataForSeoBase()}/${path.replace(/^\/+/, "")}`
  const idempotent = opts.idempotent ?? method === "GET"
  if (opts.api === "google_ads") await spaceAdsCall()

  for (let attempt = 0; ; attempt++) {
    const started = Date.now()
    let http: number | null = null
    let envelope: DfsEnvelope<R> | null = null
    let networkError: string | null = null

    await acquire()
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: getDataForSeoAuth(),
          "Content-Type": "application/json",
        },
        body: method === "POST" ? JSON.stringify(opts.body ?? []) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
        cache: "no-store",
      })
      http = res.status
      envelope = (await res.json().catch(() => null)) as DfsEnvelope<R> | null
    } catch (error) {
      networkError = error instanceof Error ? error.message : String(error)
    } finally {
      release()
    }

    const code = envelope?.status_code ?? null
    await recordCall(db, opts, path, {
      http,
      code,
      cost: envelope?.cost ?? 0,
      tasks: envelope?.tasks?.length ?? (Array.isArray(opts.body) ? opts.body.length : 1),
      items: itemsIn(envelope as DfsEnvelope | null),
      ms: Date.now() - started,
      error: networkError ?? (code !== 20000 ? (envelope?.status_message ?? `HTTP ${http}`) : null),
    })

    if (envelope && code === 20000) return envelope

    const kind = networkError ? "network" : kindFor(code, http)
    const retryable =
      attempt < BACKOFF_MS.length &&
      kind !== "funds" &&
      kind !== "auth" &&
      kind !== "input" &&
      (networkError
        ? idempotent
        : (code !== null && RETRY_CODES.has(code) && (idempotent || REFUSED_CODES.has(code))) ||
          (http !== null && (http >= 500 || http === 429) && idempotent))
    if (retryable) {
      await sleep(kind === "rate" ? 10_000 : BACKOFF_MS[attempt])
      continue
    }

    const message =
      kind === "auth"
        ? "DataForSEO rejected the login. Check DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD."
        : kind === "funds"
          ? "DataForSEO has no funds left (or hit its daily limit). Top up the balance."
          : networkError
            ? `DataForSEO didn't answer: ${networkError}`
            : (envelope?.status_message ?? `DataForSEO returned HTTP ${http}`)
    throw new DfsError(message, code, http, kind)
  }
}

async function recordCall(
  db: Db,
  opts: CallOptions,
  path: string,
  r: {
    http: number | null
    code: number | null
    cost: number
    tasks: number
    items: number
    ms: number
    error: string | null
  },
) {
  const { error } = await db.from("dfs_calls").insert({
    client_id: opts.clientId ?? null,
    api: opts.api,
    endpoint: endpointLabel(path),
    tasks: r.tasks,
    items: r.items,
    cost_usd: r.cost,
    status_code: r.code,
    http_status: r.http,
    ms: r.ms,
    ref: opts.ref ?? null,
    error: r.error ? r.error.slice(0, 500) : null,
  })
  if (error) console.error("[dataforseo] could not record the call", error.message)
}

/** Live endpoints carry one task: returns its first result, or throws the task's error. */
export function firstResult<R>(envelope: DfsEnvelope<R>): R | null {
  const task = envelope.tasks?.[0]
  if (!task) return null
  if (task.status_code !== 20000) {
    throw new DfsError(task.status_message, task.status_code, null, kindFor(task.status_code, null))
  }
  return task.result?.[0] ?? null
}
