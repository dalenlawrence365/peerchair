export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET  /api/content            -> all posts + automatic performance (clicks, unique, assessment reach)
// POST /api/content            -> create a post; server generates src_tag when destination != 'none'
// PATCH /api/content           -> update a post (publish, paste permalink, enter manual metrics, attach/detach graphic)

// Post destinations. Any page path on la-cfo.com works — slashes are fine, the
// URL builder concatenates directly. Add a new event here (one line) as they launch.
const DESTINATIONS = ["none", "overview", "assessment", "meeting", "investment", "events/august-11-workshop", "events/september-16-workshop"]
const FORMATS = ["video", "text", "carousel", "image", "poll", "article"]
// Unified production pipeline — one status for every post, script text included
// (transcript field). Dates only matter once a post reaches "scheduled", and the
// publish date/URL only matter once it reaches "posted" — enforced in the UI, not
// here, but this is the source-of-truth order.
const STATUSES = ["draft", "ready_to_shoot", "shot", "edited", "scheduled", "posted"]

export async function GET() {
  const sb = serverClient()
  const { data, error } = await sb
    .from("v_content_post_performance")
    .select("*")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("scheduled_for", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Hide soft-deleted posts (delete is recoverable via Undo / restore).
  const { data: del } = await sb.from("content_posts").select("id").not("deleted_at", "is", null)
  const deletedIds = new Set((del || []).map(function (r) { return r.id }))
  const visible = (data || []).filter(function (p) { return !deletedIds.has(p.id) })

  // Attach a fresh 1h signed URL for any post that has a graphic (private bucket).
  const posts = await Promise.all(visible.map(async function (p) {
    if (!p.graphic_storage_path) return p
    const { data: signed } = await sb.storage
      .from("content-media")
      .createSignedUrl(p.graphic_storage_path, 60 * 60)
    return Object.assign({}, p, { graphic_url: signed ? signed.signedUrl : null })
  }))

  return Response.json({ posts })
}

export async function POST(req) {
  const sb = serverClient()
  let b
  try { b = await req.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  // Calendar quick-create posts with no title yet (the full edit form fills it in),
  // so fall back to a placeholder instead of rejecting.
  const title = (b.title || "").trim() || "Untitled post"

  const format = FORMATS.includes(b.format) ? b.format : "text"
  const destination = DESTINATIONS.includes(b.destination) ? b.destination : "none"
  const status = STATUSES.includes(b.status) ? b.status : (b.scheduled_for ? "scheduled" : "draft")

  // src_tag generated server-side, from the scheduled date when present
  let src_tag = null
  if (destination !== "none") {
    const tagDate = (b.scheduled_for ? new Date(b.scheduled_for) : new Date()).toISOString().slice(0, 10)
    const { data: tag, error: tagErr } = await sb.rpc("gen_src_tag", {
      p_format: format, p_title: title, p_date: tagDate
    })
    if (tagErr) return Response.json({ error: "Tag generation failed: " + tagErr.message }, { status: 500 })
    src_tag = tag
  }

  const row = {
    title, format, destination, status, src_tag,
    scheduled_for: b.scheduled_for || null,
    scheduled_on: b.scheduled_on || (b.scheduled_for ? new Date().toISOString() : null),
    // Default the publish date to the scheduled date (that's the publish date ~99% of
    // the time). This only fills the date field; status stays whatever was set manually.
    published_at: status === "posted"
      ? (b.published_at || new Date().toISOString())
      : (b.published_at || b.scheduled_for || null),
    short_label: (b.short_label || "").trim() || null,
    theme: (b.theme || "").trim() || null,
    post_url: (b.post_url || "").trim() || null,
    notes: (b.notes || "").trim() || null,
    body: (b.body || "").trim() || null,
    transcript: (b.transcript || "").trim() || null
  }

  const { data, error } = await sb.from("content_posts").insert(row).select("id").single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const destination_url = src_tag && destination !== "none"
    ? `https://la-cfo.com/${destination}?src=${src_tag}` : null

  return Response.json({ id: data.id, src_tag, destination_url })
}

export async function PATCH(req) {
  const sb = serverClient()
  let b
  try { b = await req.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  if (!b.id) return Response.json({ error: "id is required" }, { status: 400 })

  // Restore (Undo): deleted_at is explicitly cleared. Route through the RPC so the
  // post gets renumbered back onto the end of the active list instead of a raw
  // column write that would leave two posts sharing a control_number.
  if (b.deleted_at === null) {
    const { error: rErr } = await sb.rpc("content_post_restore", { p_id: b.id })
    if (rErr) return Response.json({ error: rErr.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  const patch = {}
  if (typeof b.title === "string" && b.title.trim()) patch.title = b.title.trim()
  if (STATUSES.includes(b.status)) patch.status = b.status
  if (FORMATS.includes(b.format)) patch.format = b.format
  // Marking a post Published should NOT clobber a publish date it already has. Only
  // fill it when empty, preferring the scheduled date over "now" (so a post you flip
  // to Published keeps landing on its intended day, not today).
  if (b.status === "posted" && b.published_at === undefined) {
    const { data: cur } = await sb.from("content_posts").select("published_at, scheduled_for").eq("id", b.id).single()
    if (cur && !cur.published_at) patch.published_at = cur.scheduled_for || new Date().toISOString()
  }
  if (b.short_label !== undefined) patch.short_label = (b.short_label || "").trim() || null
  if (b.theme !== undefined) patch.theme = (b.theme || "").trim() || null
  if (b.published_at !== undefined) patch.published_at = b.published_at || null
  if (b.scheduled_for !== undefined) patch.scheduled_for = b.scheduled_for || null
  if (b.scheduled_on !== undefined) patch.scheduled_on = b.scheduled_on || null
  if (b.post_url !== undefined) patch.post_url = (b.post_url || "").trim() || null
  if (b.notes !== undefined) patch.notes = (b.notes || "").trim() || null
  if (b.body !== undefined) patch.body = (b.body || "").trim() || null
  if (b.transcript !== undefined) patch.transcript = (b.transcript || "").trim() || null
  if (b.graphic_asset_id !== undefined) patch.graphic_asset_id = b.graphic_asset_id || null
  if (b.boosted !== undefined) {
    patch.boosted = !!b.boosted
    // Turning the boost on stamps the moment paid traffic begins, so clicks
    // before it stay attributable to organic reach. Turning it off clears both.
    if (patch.boosted && !b.boost_started_at) patch.boost_started_at = new Date().toISOString()
    if (!patch.boosted) { patch.boost_started_at = null; patch.boost_spend_usd = null }
  }
  if (b.boost_started_at !== undefined) patch.boost_started_at = b.boost_started_at || null
  if (b.boost_spend_usd !== undefined) {
    const n = parseFloat(b.boost_spend_usd)
    patch.boost_spend_usd = Number.isFinite(n) && n >= 0 ? n : null
  }
  for (const k of ["impressions", "reactions", "comments"]) {
    if (b[k] !== undefined) {
      const n = parseInt(b[k], 10)
      patch[k] = Number.isFinite(n) && n >= 0 ? n : null
    }
  }
  if (Object.keys(patch).length === 0) return Response.json({ error: "Nothing to update" }, { status: 400 })

  const { error } = await sb.from("content_posts").update(patch).eq("id", b.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function DELETE(req) {
  const sb = serverClient()
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  if (!id) return Response.json({ error: "id is required" }, { status: 400 })
  // Soft delete: mark the row deleted instead of destroying it, so an accidental
  // delete can be undone/restored. The script link is preserved. The RPC also closes
  // the control_number gap this post leaves, so the lifetime video count stays
  // contiguous and the next new post doesn't skip past the reclaimed number.
  const { error } = await sb.rpc("content_post_soft_delete", { p_id: id })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
