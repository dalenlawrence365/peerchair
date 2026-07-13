export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/notifications -> { unread, items[] }  (latest 50)
export async function GET() {
  const sb = serverClient()
  const { data: items } = await sb
    .from("notifications")
    .select("id, kind, person_id, title, body, href, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(50)
  const { count } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false)
  const { count: eventsPending } = await sb
    .from("event_attendees")
    .select("id", { count: "exact", head: true })
    .in("status", ["Registered", "Requested"])
  return Response.json({ unread: count || 0, events_pending: eventsPending || 0, items: items || [] })
}

// POST /api/notifications  { action:"read_all" } | { id }
export async function POST(request) {
  const sb = serverClient()
  let body = {}
  try { body = await request.json() } catch {}
  if (body.action === "read_all") {
    await sb.from("notifications").update({ is_read: true }).eq("is_read", false)
  } else if (body.id) {
    await sb.from("notifications").update({ is_read: true }).eq("id", body.id)
  }
  return Response.json({ ok: true })
}
