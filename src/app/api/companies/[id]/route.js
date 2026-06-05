export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// Editable company fields (anything else in a PATCH body is ignored).
const ALLOWED_FIELDS = new Set([
  "name", "notes", "sponsor_type", "host_viable", "hosting_type", "sponsor_state",
])

// GET /api/companies/[id]
// Returns the company plus its host_locations and sponsor_contact people.
export async function GET(_request, { params }) {
  const { id } = await params
  const sb = serverClient()

  const { data: company, error } = await sb
    .from("companies")
    .select("id, name, notes, sponsor_type, host_viable, hosting_type, sponsor_state, source, is_sponsor, created_at, updated_at")
    .eq("id", id)
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!company) return Response.json({ error: "Company not found" }, { status: 404 })

  // Locations
  const { data: locations } = await sb
    .from("host_locations")
    .select("id, label, address_line1, address_line2, city, state, zip, neighborhood, is_primary, notes")
    .eq("company_id", id)
    .order("is_primary", { ascending: false })
    .order("label", { ascending: true })

  // Contacts (people linked via company_id and sponsor_contact role)
  const { data: contacts } = await sb
    .from("people")
    .select("id, full_name, first_name, last_name, title, email, linkedin_url, avatar_url, last_meaningful_touch, next_action_date, sponsor_state")
    .eq("company_id", id)
    .contains("roles", ["sponsor_contact"])
    .order("last_meaningful_touch", { ascending: false, nullsFirst: false })

  return Response.json({
    company,
    locations: locations || [],
    contacts: (contacts || []).map(p => ({
      id: p.id,
      name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      title: p.title,
      email: p.email,
      linkedin_url: p.linkedin_url,
      avatar_url: p.avatar_url,
      last_touch: p.last_meaningful_touch,
      next_action: p.next_action_date,
      sponsor_state: p.sponsor_state,
    })),
  })
}

// PATCH /api/companies/[id]
// Body: subset of ALLOWED_FIELDS. Silently drops anything else.
export async function PATCH(request, { params }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const patch = {}
  for (const k of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(k)) patch[k] = body[k]
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No allowed fields in body" }, { status: 400 })
  }

  const sb = serverClient()
  const { data, error } = await sb
    .from("companies")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: "Company not found" }, { status: 404 })

  return Response.json({ company: data })
}
