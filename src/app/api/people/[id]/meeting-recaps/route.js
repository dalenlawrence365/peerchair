export const dynamic = "force-dynamic"

import { serverClient } from "@/lib/supabaseServer"

// GET    /api/people/[id]/meeting-recaps         -> { recaps }
// DELETE /api/people/[id]/meeting-recaps?recap_id=xxx
//
// Lists every meeting recap this person was a participant in (a recap can
// be shared across multiple people — see /api/meeting-recaps), newest
// first, with the OTHER participants' names attached so a multi-person
// recap shows who else was in the room. Delete removes the recap entirely
// (for everyone it was posted to, not just this person) — same "explicit,
// scoped delete" pattern as person_research_notes; there's no per-person
// partial delete since the recap is one shared record of one real meeting.

export async function GET(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })
  const sb = serverClient()

  const { data: links, error: linkErr } = await sb.from("meeting_recap_participants")
    .select("meeting_recap_id")
    .eq("person_id", id)
  if (linkErr) return Response.json({ error: linkErr.message }, { status: 500 })

  const recapIds = (links || []).map(function (l) { return l.meeting_recap_id })
  if (!recapIds.length) return Response.json({ recaps: [] })

  const { data: recaps, error: recapErr } = await sb.from("meeting_recaps")
    .select("*")
    .in("id", recapIds)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
  if (recapErr) return Response.json({ error: recapErr.message }, { status: 500 })

  // Attach co-participants (everyone on the recap except this person).
  const { data: allParticipants } = await sb.from("meeting_recap_participants")
    .select("meeting_recap_id, people(id, full_name)")
    .in("meeting_recap_id", recapIds)

  const coParticipantsByRecap = {}
  ;(allParticipants || []).forEach(function (row) {
    if (!row.people || row.people.id === id) return
    if (!coParticipantsByRecap[row.meeting_recap_id]) coParticipantsByRecap[row.meeting_recap_id] = []
    coParticipantsByRecap[row.meeting_recap_id].push({ id: row.people.id, full_name: row.people.full_name })
  })

  const out = (recaps || []).map(function (r) {
    return Object.assign({}, r, { other_participants: coParticipantsByRecap[r.id] || [] })
  })

  return Response.json({ recaps: out })
}

// PATCH /api/people/[id]/meeting-recaps   { recap_id, warning_tag_applied: true }
//
// Marks a recap's suggested hard-stop tag as applied so the "Apply tag"
// button doesn't keep offering itself after Dalen has already acted on it.
// Only ever sets this to true from the UI (after the actual add_tag call
// to /api/people/[id]/action succeeds) — this endpoint doesn't set the tag
// itself, it just records that it was handled.
export async function PATCH(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })
  let b
  try { b = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }
  const recapId = (b.recap_id || "").toString()
  if (!recapId) return Response.json({ error: "recap_id required" }, { status: 400 })

  const sb = serverClient()
  const { data: link } = await sb.from("meeting_recap_participants")
    .select("meeting_recap_id").eq("meeting_recap_id", recapId).eq("person_id", id).maybeSingle()
  if (!link) return Response.json({ error: "recap not found for this person" }, { status: 404 })

  const { error } = await sb.from("meeting_recaps").update({ warning_tag_applied: true }).eq("id", recapId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function DELETE(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })
  const { searchParams } = new URL(request.url)
  const recapId = searchParams.get("recap_id")
  if (!recapId) return Response.json({ error: "recap_id required" }, { status: 400 })

  const sb = serverClient()

  // Scope the delete to recaps this person actually participates in, so
  // one profile can't delete another person's unrelated recap by id-guessing.
  const { data: link } = await sb.from("meeting_recap_participants")
    .select("meeting_recap_id").eq("meeting_recap_id", recapId).eq("person_id", id).maybeSingle()
  if (!link) return Response.json({ error: "recap not found for this person" }, { status: 404 })

  const { error } = await sb.from("meeting_recaps").delete().eq("id", recapId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
