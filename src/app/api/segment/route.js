export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/segment?key=silent_connections — people in a connection-funnel segment.
// Valid keys: uninvited, invite_pending, silent_connections, engaged.
const VALID = ["uninvited", "invite_pending", "silent_connections", "replied", "cfo_circle"]

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const key = (searchParams.get("key") || "").trim()
  if (!VALID.includes(key)) {
    return Response.json({ error: "invalid segment key", valid: VALID }, { status: 400 })
  }
  const sb = serverClient()

  // CFO Circle is a boolean label across the whole people table — NOT a
  // connection-funnel segment — so it bypasses connection_segment_people and
  // queries people.cfo_circle_member directly (includes non-connections).
  if (key === "cfo_circle") {
    const { data, error } = await sb.from("people")
      .select("id, full_name, avatar_url, title, company, last_meaningful_touch, next_action_date")
      .eq("cfo_circle_member", true)
      .order("full_name", { ascending: true })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ key, people: data || [] })
  }

  const { data, error } = await sb.rpc("connection_segment_people", { p_key: key })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ key, people: data || [] })
}
