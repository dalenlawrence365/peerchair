export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/people/[id] — full profile for the /people/[id] page.
// Returns person row, communications (latest 50), active status & action tags,
// linked company, and the LinkedIn thread snapshot if present.

export async function GET(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })

  const sb = serverClient()

  const { data: person, error: pErr } = await sb.from("people").select("*").eq("id", id).maybeSingle()
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 })
  if (!person) return Response.json({ error: "Person not found" }, { status: 404 })

  // Communications — latest 50, matched by person_id
  const { data: comms } = await sb.from("communications")
    .select("id, occurred_at, direction, channel, body, step_label, source, subject")
    .eq("person_id", id)
    .order("occurred_at", { ascending: false })
    .limit(50)

  // Tags — only active (not removed)
  const { data: statusTags } = await sb.from("person_status_tags")
    .select("tag, set_at, set_by, notes")
    .eq("person_id", id)
    .is("removed_at", null)
    .order("set_at", { ascending: false })

  const { data: actionTags } = await sb.from("person_action_tags")
    .select("action_type, as_of_date, set_at, set_by, notes")
    .eq("person_id", id)
    .order("set_at", { ascending: false })
    .limit(20)

  // Linked company (sponsor contact)
  let company = null
  if (person.company_id) {
    const { data: co } = await sb.from("companies")
      .select("id, name, sponsor_type, sponsor_state, host_viable")
      .eq("id", person.company_id).maybeSingle()
    company = co || null
  }

  // ProVisors group memberships (names) — used by the profile Groups tab
  const { data: gmRows } = await sb.from("person_provisors_groups")
    .select("provisors_groups(name)")
    .eq("person_id", id)
  const groups = (gmRows || []).map(function(r){ return r.provisors_groups && r.provisors_groups.name }).filter(Boolean)

  // Troika master designations — groups where this person is the troika master
  const { data: tmRows } = await sb.from("provisors_groups")
    .select("name")
    .eq("troika_master_person_id", id)
  const troika_master_of = (tmRows || []).map(function(r){ return r.name }).filter(Boolean)

  // Meetings this person attended (newest first)
  const { data: maRows } = await sb.from("meeting_attendance")
    .select("provisors_meetings(id, meeting_date, label, provisors_groups(name))")
    .eq("person_id", id)
  const meetings = (maRows || [])
    .map(function(r){ return r.provisors_meetings })
    .filter(Boolean)
    .map(function(m){ return { id: m.id, meeting_date: m.meeting_date, label: m.label, group: m.provisors_groups ? m.provisors_groups.name : null } })
    .sort(function(a, b){ return (b.meeting_date || "").localeCompare(a.meeting_date || "") })

  return Response.json({
    person,
    company,
    groups,
    troika_master_of,
    meetings,
    communications: comms || [],
    status_tags: statusTags || [],
    action_tags: actionTags || [],
  })
}
