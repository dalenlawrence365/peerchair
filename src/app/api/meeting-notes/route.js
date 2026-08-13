export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// Logged notes on a meeting (append-only). POST adds one; DELETE removes one.
// source distinguishes a manual note from an ingested AI summary (granola/zoom).
export async function POST(req) {
  const sb = serverClient()
  let b; try { b = await req.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  if (!b.meeting_id) return Response.json({ error: "meeting_id required" }, { status: 400 })
  const body = (b.body || "").trim()
  if (!body) return Response.json({ error: "body required" }, { status: 400 })
  const row = { meeting_id: b.meeting_id, body, source: (b.source || "manual").toString().trim() || "manual", author: (b.author || "").toString().trim() || null }
  const { data, error } = await sb.from("meeting_notes").insert(row).select("id").single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, id: data.id })
}

export async function DELETE(req) {
  const sb = serverClient()
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return Response.json({ error: "id required" }, { status: 400 })
  const { error } = await sb.from("meeting_notes").delete().eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
