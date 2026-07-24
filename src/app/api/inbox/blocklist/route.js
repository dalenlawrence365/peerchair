export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// The saved blacklist: senders Dalen chose to permanently ignore.
// GET  -> the list. POST { pattern, action:'unblock' } -> deactivate a block.
export async function GET() {
  const sb = serverClient()
  const { data, error } = await sb
    .from("sender_rules")
    .select("id, pattern, label, notes, created_at, active")
    .eq("is_blacklist", true)
    .order("created_at", { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ blocked: (data || []).filter(function (r) { return r.active }) })
}

export async function POST(request) {
  const sb = serverClient()
  const body = await request.json().catch(function () { return {} })
  const pattern = (body.pattern || "").toString().trim().toLowerCase()
  if (!pattern || body.action !== "unblock") {
    return Response.json({ error: "pattern and action:'unblock' required" }, { status: 400 })
  }
  // Deactivate rather than delete — un-blocking is reversible, and future mail
  // simply lands in the queue again.
  const { error } = await sb.from("sender_rules")
    .update({ active: false })
    .eq("match_type", "address").eq("pattern", pattern).eq("is_blacklist", true)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, unblocked: pattern })
}
