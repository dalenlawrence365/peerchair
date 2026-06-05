export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/sponsor-pipeline?stage=<pool|audience|discovery|proposal|active>
//
// Companies-first. The relationship lives at the firm level (a sponsor deal
// is signed by Bank of America, not by Bank of America's relationship manager).
// Returns a stage funnel counted on companies.sponsor_state, plus a list of
// companies in the requested stage with their contacts embedded.
//
// Unlike /api/pipeline, every stage is listable here — there are only ~77
// companies total, so no "too many to list" branch is needed.

const STAGES = ["pool", "audience", "discovery", "proposal", "active"]

export async function GET(request) {
  const url = new URL(request.url)
  const stage = url.searchParams.get("stage") || "pool"

  const sb = serverClient()

  // Funnel — count companies per sponsor_state
  const funnel = {}
  await Promise.all(STAGES.map(async function(s){
    const { count } = await sb.from("companies")
      .select("id", { count: "exact", head: true })
      .eq("sponsor_state", s)
      .eq("is_sponsor", true)
    funnel[s] = count || 0
  }))
  const total = Object.values(funnel).reduce((a, b) => a + b, 0)

  // Companies in the requested stage with their contacts
  const { data: companies, error } = await sb
    .from("companies")
    .select("id, name, sponsor_type, sponsor_state, host_viable, hosting_type, notes")
    .eq("sponsor_state", stage)
    .eq("is_sponsor", true)
    .order("name", { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const companyIds = (companies || []).map(c => c.id)

  // Fetch host_locations for these companies — used for location_count + a short preview
  let locationsByCompany = {}
  if (companyIds.length) {
    const { data: locs } = await sb
      .from("host_locations")
      .select("id, company_id, label, address_line1, neighborhood, city, is_primary")
      .in("company_id", companyIds)
      .order("is_primary", { ascending: false })

    for (const loc of locs || []) {
      const cid = loc.company_id
      if (!locationsByCompany[cid]) locationsByCompany[cid] = []
      locationsByCompany[cid].push(loc)
    }
  }

  // Fetch all contacts at these companies in one query, then group by company_id
  let contactsByCompany = {}
  if (companyIds.length) {
    const { data: contacts } = await sb
      .from("people")
      .select("id, full_name, first_name, last_name, title, company_id, last_meaningful_touch, next_action_date, avatar_url, linkedin_url, email")
      .in("company_id", companyIds)
      .contains("roles", ["sponsor_contact"])
      .order("last_meaningful_touch", { ascending: false, nullsFirst: false })

    for (const p of contacts || []) {
      const cid = p.company_id
      if (!contactsByCompany[cid]) contactsByCompany[cid] = []
      contactsByCompany[cid].push({
        id: p.id,
        name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        title: p.title,
        last_touch: p.last_meaningful_touch,
        next_action: p.next_action_date,
        avatar_url: p.avatar_url || null,
        linkedin_url: p.linkedin_url,
        email: p.email,
      })
    }
  }

  // Attach contacts + locations + derived fields to each company
  const list = (companies || []).map(function(c){
    const contacts = contactsByCompany[c.id] || []
    const locations = locationsByCompany[c.id] || []
    // Latest activity across all contacts at the firm
    const latestTouch = contacts.reduce(function(acc, p){
      if (!p.last_touch) return acc
      if (!acc || p.last_touch > acc) return p.last_touch
      return acc
    }, null)
    return {
      id: c.id,
      name: c.name,
      category: c.sponsor_type,
      sponsor_state: c.sponsor_state,
      host_viable: c.host_viable,
      hosting_type: c.hosting_type,
      contact_count: contacts.length,
      location_count: locations.length,
      last_touch: latestTouch,
      contacts: contacts,
      locations: locations,
    }
  })

  // Re-sort: most-recently-touched firms first, then alphabetical for untouched
  list.sort(function(a, b){
    if (a.last_touch && b.last_touch) return b.last_touch.localeCompare(a.last_touch)
    if (a.last_touch) return -1
    if (b.last_touch) return 1
    return a.name.localeCompare(b.name)
  })

  return Response.json({
    stages: STAGES,
    funnel,
    total,
    listable: STAGES, // every stage is listable — companies max ~77
    list,
  })
}
