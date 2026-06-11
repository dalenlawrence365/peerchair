export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/meetings/[id] — one meeting + the people who were there.
export async function GET(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })
  const sb = serverClient()

  const { data: meeting, error } = await sb.from("provisors_meetings")
    .select("id, meeting_date, label, outlook_event_id, group_id, provisors_groups(name, troika_master_person_id)")
    .eq("id", id).maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!meeting) return Response.json({ error: "Meeting not found" }, { status: 404 })

  const { data: att } = await sb.from("meeting_attendance")
    .select("people(id, full_name, company, title, avatar_url, photo_url, linkedin_url, linkedin_connected, roles, provisors_member, sponsor_state)")
    .eq("meeting_id", id)
  const attendees = (att || []).map(r => r.people).filter(Boolean)
    .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""))

  return Response.json({
    meeting: {
      id: meeting.id, meeting_date: meeting.meeting_date, label: meeting.label,
      group: meeting.provisors_groups ? meeting.provisors_groups.name : null,
      troika_master_person_id: meeting.provisors_groups ? meeting.provisors_groups.troika_master_person_id : null,
      outlook_event_id: meeting.outlook_event_id,
    },
    attendees,
  })
}
