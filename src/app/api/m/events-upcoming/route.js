export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* GET /api/m/events-upcoming -> { events[] }
   Published events from ~1 day ago forward, soonest first. Feeds the invite
   template pickers on the mobile profile screen. */

export async function GET() {
  const sb = serverClient()
  const { data, error } = await sb
    .from("events")
    .select("id, name, kind, event_date, slug")
    .eq("published", true)
    .gte("event_date", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .order("event_date", { ascending: true })
    .limit(10)

  if (error) return Response.json({ events: [], error: error.message }, { status: 500 })
  return Response.json({ events: data || [] })
}
