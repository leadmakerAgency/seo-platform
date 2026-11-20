import "server-only"

import { accountBalance } from "@/lib/dataforseo/api"
import type { Db } from "@/lib/dataforseo/client"
import { hasDataForSeo } from "@/lib/env.server"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Credits left on the paid accounts (admins only; public.account_balances, migration 0041).
 * DataForSEO's balance comes from its free user_data call, refreshed here when the stored one
 * is more than an hour old. Anthropic has no balance API: an admin enters the console balance
 * and the app subtracts every Claude call logged since.
 */

export type AccountBalances = {
  dataforseo: {
    balance: number | null
    checkedAt: string | null
    low: number
    monthSpend: number
    monthBudget: number
  }
  anthropic: {
    credit: number | null
    creditAt: string | null
    spentSince: number
    left: number | null
    monthSpend: number
    monthBudget: number
  }
}

const STALE_MS = 60 * 60 * 1000
const REFRESH_TIMEOUT_MS = 4000

type Rec = Record<string, unknown>
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v))

async function refreshDataForSeoBalance(checkedAt: string | null) {
  if (!hasDataForSeo() || !hasSupabaseSecretKey()) return
  if (checkedAt && Date.now() - Date.parse(checkedAt) < STALE_MS) return
  const db = createSupabaseAdminClient() as unknown as Db
  const balance = await Promise.race([
    accountBalance(db).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), REFRESH_TIMEOUT_MS)),
  ])
  if (balance === null) return
  await db
    .from("dfs_settings")
    .update({ last_balance_usd: balance, last_balance_at: new Date().toISOString() })
    .eq("id", true)
}

export async function getAccountBalances(isAdmin: boolean): Promise<AccountBalances | null> {
  if (!isAdmin) return null
  const supabase = await createSupabaseServerClient()
  const read = async () => {
    const { data } = await supabase.rpc("account_balances")
    return (data as Rec | null) ?? null
  }
  let raw = await read()
  if (!raw) return null
  const checkedAt = ((raw.dataforseo as Rec | undefined)?.checked_at as string | null) ?? null
  if (!checkedAt || Date.now() - Date.parse(checkedAt) >= STALE_MS) {
    try {
      await refreshDataForSeoBalance(checkedAt)
      raw = (await read()) ?? raw
    } catch (e) {
      console.error("[backlinks] DataForSEO balance refresh", e)
    }
  }
  const d = (raw.dataforseo ?? {}) as Rec
  const a = (raw.anthropic ?? {}) as Rec
  return {
    dataforseo: {
      balance: numOrNull(d.balance),
      checkedAt: (d.checked_at as string | null) ?? null,
      low: num(d.low),
      monthSpend: num(d.month_spend),
      monthBudget: num(d.month_budget),
    },
    anthropic: {
      credit: numOrNull(a.credit),
      creditAt: (a.credit_at as string | null) ?? null,
      spentSince: num(a.spent_since),
      left: numOrNull(a.left),
      monthSpend: num(a.month_spend),
      monthBudget: num(a.month_budget),
    },
  }
}
