export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/events/all -> every published event, NEWEST FIRST.
// Powers the event switcher: the newest date is where you most likely want to be.
export async function GET() {
  const sb = serverClient()
  const { data } = await sb
    .from("events")
    .select("slug, name, event_date, status")
    .eq("published", true)
    .order("event_date", { ascending: false })
  return Response.json({ events: data || [] })
}
