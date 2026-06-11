export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/meetings — list meeting instances, newest first, with attendee counts.
export async function GET() {
  const sb = serverClient()
  const { data: meetings, error } = await sb.from("provisors_meetings")
    .select("id, meeting_date, label, group_id, provisors_groups(name)")
    .order("meeting_date", { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const ids = (meetings || []).map(m => m.id)
  const counts = {}
  if (ids.length) {
    const { data: rows } = await sb.from("meeting_attendance").select("meeting_id").in("meeting_id", ids)
    for (const r of (rows || [])) counts[r.meeting_id] = (counts[r.meeting_id] || 0) + 1
  }
  const out = (meetings || []).map(m => ({
    id: m.id, meeting_date: m.meeting_date, label: m.label,
    group: m.provisors_groups ? m.provisors_groups.name : null,
    attendees: counts[m.id] || 0,
  }))
  return Response.json({ meetings: out })
}
