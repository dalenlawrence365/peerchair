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

  // Communications — latest 50, match by person_id OR contact_id (migrated rows share id)
  const { data: comms } = await sb.from("communications")
    .select("id, occurred_at, direction, channel, body, step_label, source, subject")
    .or(`person_id.eq.${id},contact_id.eq.${id}`)
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
      .select("id, name, sponsor_type, sponsor_state, neighborhood_la, host_viable")
      .eq("id", person.company_id).maybeSingle()
    company = co || null
  }

  return Response.json({
    person,
    company,
    communications: comms || [],
    status_tags: statusTags || [],
    action_tags: actionTags || [],
  })
}
