import { NextResponse } from "next/server"

import { getNotifications } from "@/features/tasks/queries"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/** GET /api/notifications — the latest 20 for the signed-in person (RLS: own only). */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }
  try {
    const items = await getNotifications(20)
    return NextResponse.json({ items, unread: items.filter((n) => !n.readAt).length })
  } catch {
    return NextResponse.json({ error: "Could not load notifications" }, { status: 500 })
  }
}
