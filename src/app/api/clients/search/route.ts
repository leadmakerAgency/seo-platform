import { NextResponse, type NextRequest } from "next/server"

import type { ClientSearchResult } from "@/features/clients/types"
import { formatLocation } from "@/lib/format"
import { ilikePattern } from "@/lib/search"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/** GET /api/clients/search?q= — used by the Ctrl/Cmd+K client switcher. RLS applies. */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  let query = supabase
    .from("clients")
    .select("id, slug, name, city, region, country_code, health")
    .order("name")
    .limit(20)

  const pattern = ilikePattern(request.nextUrl.searchParams.get("q"))
  if (pattern)
    query = query.or(`name.ilike.${pattern},city.ilike.${pattern},website.ilike.${pattern}`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: "Search failed" }, { status: 500 })

  const results: ClientSearchResult[] = data.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    location: formatLocation(c.city, c.region, c.country_code),
    health: c.health,
  }))
  return NextResponse.json({ results })
}
