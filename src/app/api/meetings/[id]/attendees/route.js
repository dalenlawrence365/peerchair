export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// Attendees of a calendar meeting. A meeting has many people; the Outlook invite list on the
// meeting row is only a suggestion, so editing here never touches it and the calendar sync
// never overwrites it.
//   POST   { person_id, role? }   add (or change the role of) an attendee
//   DELETE ?person_id=...         remove an attendee
export async function POST(request, { params }) {
  const meeting_id = params?.id
  let b; try { b = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  if (!meeting_id || !b.person_id) return Response.json({ error: "meeting id and person_id required" }, { status: 400 })
  const role = ["attendee", "organizer", "primary"].includes(b.role) ? b.role : "attendee"
  const sb = serverClient()
  const { error } = await sb.from("meeting_attendees")
    .upsert({ meeting_id, person_id: b.person_id, role, source: "manual" }, { onConflict: "meeting_id,person_id" })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function DELETE(request, { params }) {
  const meeting_id = params?.id
  const person_id = new URL(request.url).searchParams.get("person_id")
  if (!meeting_id || !person_id) return Response.json({ error: "meeting id and person_id required" }, { status: 400 })
  const sb = serverClient()
  const { error } = await sb.from("meeting_attendees").delete().eq("meeting_id", meeting_id).eq("person_id", person_id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
