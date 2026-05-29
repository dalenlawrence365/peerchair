export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/segment?key=silent_connections — people in a connection-funnel segment.
// Valid keys: uninvited, invite_pending, silent_connections, engaged.
const VALID = ["uninvited", "invite_pending", "silent_connections", "replied"]

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const key = (searchParams.get("key") || "").trim()
  if (!VALID.includes(key)) {
    return Response.json({ error: "invalid segment key", valid: VALID }, { status: 400 })
  }
  const sb = serverClient()
  const { data, error } = await sb.rpc("connection_segment_people", { p_key: key })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ key, people: data || [] })
}
