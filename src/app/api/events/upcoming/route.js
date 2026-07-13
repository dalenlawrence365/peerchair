export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/events/upcoming -> { events: [{slug,name,event_date}] } (today or later)
export async function GET() {
  const sb = serverClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await sb
    .from("events")
    .select("slug, name, event_date")
    .eq("published", true)
    .gte("event_date", today)
    .order("event_date", { ascending: true })
  return Response.json({ events: data || [] })
}
