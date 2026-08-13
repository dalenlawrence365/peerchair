export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// Script library. GET is AI-readable: the full history of every script, its
// production stage, and the publish date of any post it's linked to — so an
// agent can scan it for repetition. Also feeds the Scripts board.
const STAGES = ["draft", "ready_to_shoot", "shot", "edited", "posted"]

export async function GET() {
  const sb = serverClient()
  const { data: scripts, error } = await sb.from("content_scripts").select("*").order("created_at", { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const postIds = [...new Set((scripts || []).map(s => s.linked_post_id).filter(Boolean))]
  const postsById = {}
  if (postIds.length) {
    const { data: posts } = await sb.from("content_posts").select("id, title, status, published_at, scheduled_for").in("id", postIds)
    for (const p of (posts || [])) postsById[p.id] = p
  }
  const out = (scripts || []).map(s => {
    const p = s.linked_post_id ? postsById[s.linked_post_id] : null
    return Object.assign({}, s, {
      linked_post_title: p ? p.title : null,
      linked_post_status: p ? p.status : null,
      published_at: p ? p.published_at : null,
      scheduled_for: p ? p.scheduled_for : null,
    })
  })
  return Response.json({ scripts: out, count: out.length })
}

export async function POST(req) {
  const sb = serverClient()
  let b; try { b = await req.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  const title = (b.title || "").trim()
  if (!title) return Response.json({ error: "Title is required" }, { status: 400 })
  const stage = STAGES.includes(b.stage) ? b.stage : "draft"
  const row = { title, script_text: (b.script_text || "").trim() || null, stage, notes: (b.notes || "").trim() || null }
  const { data, error } = await sb.from("content_scripts").insert(row).select("id").single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ id: data.id })
}

export async function PATCH(req) {
  const sb = serverClient()
  let b; try { b = await req.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  if (!b.id) return Response.json({ error: "id is required" }, { status: 400 })
  const patch = { updated_at: new Date().toISOString() }
  if (typeof b.title === "string" && b.title.trim()) patch.title = b.title.trim()
  if (b.script_text !== undefined) patch.script_text = (b.script_text || "").trim() || null
  if (STAGES.includes(b.stage)) patch.stage = b.stage
  if (b.linked_post_id !== undefined) patch.linked_post_id = b.linked_post_id || null
  if (b.notes !== undefined) patch.notes = (b.notes || "").trim() || null
  const { error } = await sb.from("content_scripts").update(patch).eq("id", b.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function DELETE(req) {
  const sb = serverClient()
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return Response.json({ error: "id required" }, { status: 400 })
  const { error } = await sb.from("content_scripts").delete().eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
