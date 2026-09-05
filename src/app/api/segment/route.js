export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/segment?key=silent_connections — people in a connection-funnel segment.
// Valid keys: uninvited, invite_pending, invite_lapsed, silent_connections, replied, cfo_circle.
const VALID = ["uninvited", "invite_pending", "invite_lapsed", "silent_connections", "replied", "cfo_circle", "out_of_market"]

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const key = (searchParams.get("key") || "").trim()
  if (!VALID.includes(key)) {
    return Response.json({ error: "invalid segment key", valid: VALID }, { status: 400 })
  }
  // days only matters for invite_lapsed — the lookback window for "sent but never
  // accepted/replied," i.e. eligible to ask again (default 30, e.g. pass 180 for a
  // 6-month re-invite campaign list). Ignored by every other segment key.
  const daysParam = parseInt(searchParams.get("days"), 10)
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 30
  const sb = serverClient()

  // CFO Circle is a boolean label across the whole people table — NOT a
  // connection-funnel segment — so it bypasses connection_segment_people and
  // queries people.cfo_circle_member directly (includes non-connections).
  if (key === "cfo_circle") {
    const { data, error } = await sb.from("people")
      .select("id, full_name, avatar_url, title, company, location, last_meaningful_touch, next_action_date")
      .eq("cfo_circle_member", true)
      .order("full_name", { ascending: true })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return await withStatusTags(sb, key, data || [])
  }

  // Out-of-market — CFO first-degree connections carrying the out_of_market status
  // tag. Direct people-table query (not a connection-funnel segment).
  if (key === "out_of_market") {
    const { data, error } = await sb.from("people")
      .select("id, full_name, avatar_url, title, company, location, cfo_state, linkedin_url, last_meaningful_touch, next_action_date, person_status_tags!inner(tag, removed_at)")
      .contains("roles", ["cfo"])
      .eq("linkedin_connected", true)
      .eq("person_status_tags.tag", "out_of_market")
      .is("person_status_tags.removed_at", null)
      .order("full_name", { ascending: true })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    const people = (data || []).map(function(d){ const { person_status_tags, ...rest } = d; return rest })
    return await withStatusTags(sb, key, people)
  }

  const { data, error } = await sb.rpc("connection_segment_people", { p_key: key, p_days: days })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return await withStatusTags(sb, key, data || [])
}

// Attach the active STATUS tags (person_status_tags, not action/activity tags) to
// each person so the list can show them inline. One extra query, keyed by id.
async function withStatusTags(sb, key, people) {
  const ids = (people || []).map(function(p){ return p.id }).filter(Boolean)
  if (!ids.length) return Response.json({ key, people: people || [] })
  const { data: tags } = await sb.from("person_status_tags")
    .select("person_id, tag, set_at").in("person_id", ids).is("removed_at", null)
  const byPerson = {}
  for (const t of (tags || [])) {
    if (!byPerson[t.person_id]) byPerson[t.person_id] = []
    byPerson[t.person_id].push(t.tag)
  }
  const withTags = (people || []).map(function(p){ return Object.assign({}, p, { status_tags: byPerson[p.id] || [] }) })
  return Response.json({ key, people: withTags })
}
