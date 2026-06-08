export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// PATCH /api/meetings/[id]
// Body: { tags?: string[] }  — full replacement of the tag set
// Body: { add?: string[], remove?: string[] }  — incremental edit
//
// Used by the meetings page inline pill editor. Pass either `tags` (full
// replace) or the add/remove combo (additive). Validation: tag values
// must be in VALID_TAGS so typos / arbitrary strings don't leak in.

const VALID_TAGS = new Set([
  // Pipeline-type tags (one or zero per meeting)
  "fit_call", "sponsor_discovery", "call",
  // Role tags from attendees
  "cfo", "sponsor", "referral",
  // Networking + sub-tags
  "networking", "provisors", "acg", "mixer", "troika",
  // Other categories
  "chapter_peer", "personal", "other",
])

export async function PATCH(req, { params }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const sb = serverClient()

  const { data: row, error: getErr } = await sb
    .from("meetings").select("tags").eq("id", id).maybeSingle()
  if (getErr) return Response.json({ error: getErr.message }, { status: 500 })
  if (!row)   return Response.json({ error: "Meeting not found" }, { status: 404 })

  let newTags
  if (Array.isArray(body.tags)) {
    newTags = body.tags
  } else {
    const current = new Set(row.tags || [])
    for (const t of body.add || []) current.add(t)
    for (const t of body.remove || []) current.delete(t)
    newTags = Array.from(current)
  }

  // Validation: every tag must be in the vocabulary, no duplicates
  const invalid = newTags.filter(t => !VALID_TAGS.has(t))
  if (invalid.length) {
    return Response.json({ error: "Invalid tag(s): " + invalid.join(", ") }, { status: 400 })
  }
  newTags = Array.from(new Set(newTags))

  const { error: upErr } = await sb.from("meetings")
    .update({
      tags: newTags,
      tags_manually_edited: true,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

  return Response.json({ ok: true, tags: newTags })
}
