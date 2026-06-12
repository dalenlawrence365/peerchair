export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/provisors
// Returns all people with provisors_member=true, plus aggregate stats
// for the page header. Sorted by most recent touch first.

export async function GET() {
  const sb = serverClient()

  const { data: people, error } = await sb
    .from("people")
    .select("id, full_name, first_name, last_name, title, company, email, linkedin_url, photo_url, linkedin_connected, cfo_circle_member, roles, cfo_state, sponsor_state, referral_state, last_meaningful_touch, notes")
    .eq("provisors_member", true)
    .limit(2000)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Group memberships: person_id -> [group name, ...]
  const groupsByPerson = {}
  const { data: gm } = await sb
    .from("person_provisors_groups")
    .select("person_id, provisors_groups(name)")
  for (const row of (gm || [])) {
    const nm = row.provisors_groups?.name
    if (!nm) continue
    ;(groupsByPerson[row.person_id] ||= []).push(nm)
  }

  // Aggregate stats
  const stats = {
    total: people.length,
    by_role: { cfo: 0, sponsor: 0, referral: 0, unroled: 0 },
    connected: 0,
    touched_last_30d: 0,
    touched_last_90d: 0,
  }
  const cutoff30 = Date.now() - 30 * 24 * 3600000
  const cutoff90 = Date.now() - 90 * 24 * 3600000
  for (const p of people) {
    const roles = p.roles || []
    let counted = false
    if (roles.includes("cfo")) { stats.by_role.cfo++; counted = true }
    if (roles.includes("sponsor_contact")) { stats.by_role.sponsor++; counted = true }
    if (roles.includes("referral_partner")) { stats.by_role.referral++; counted = true }
    if (!counted) stats.by_role.unroled++
    if (p.linkedin_connected) stats.connected++
    if (p.last_meaningful_touch) {
      const t = new Date(p.last_meaningful_touch).getTime()
      if (t > cutoff30) stats.touched_last_30d++
      if (t > cutoff90) stats.touched_last_90d++
    }
  }

  // Sort: most recent touch first, then by name
  people.sort((a, b) => {
    if (a.last_meaningful_touch && b.last_meaningful_touch) return b.last_meaningful_touch.localeCompare(a.last_meaningful_touch)
    if (a.last_meaningful_touch) return -1
    if (b.last_meaningful_touch) return 1
    return (a.full_name || "").localeCompare(b.full_name || "")
  })

  // Shape the row payload
  const rows = people.map(p => ({
    id: p.id,
    name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
    title: p.title,
    company: p.company,
    email: p.email,
    linkedin_url: p.linkedin_url,
    photo_url: p.photo_url,
    linkedin_connected: p.linkedin_connected,
    groups: groupsByPerson[p.id] || [],
    roles: p.roles || [],
    provisors_member: true,
    cfo_circle_member: p.cfo_circle_member === true,
    cfo_state: p.cfo_state,
    sponsor_state: p.sponsor_state,
    referral_state: p.referral_state,
    last_touch: p.last_meaningful_touch,
  }))

  return Response.json({ stats, people: rows })
}
