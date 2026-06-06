export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/cfo-metrics
//
// Returns the brochure / assessment delivery picture for "connected CFOs"
// (those past the Pool stage — by definition LinkedIn-connected).
//
// Response shape:
//   {
//     connected_total: 306,
//     brochure:   { sent: 12, not_sent: 294, pct_sent: 3.9 },
//     assessment: { sent: 8,  not_sent: 298, pct_sent: 2.6 },
//     lists: {
//       no_brochure:    [{
//         id, name, title, company, cfo_state, last_touch,
//         connected_at,    // date of connection_accepted action_tag, or null
//         activity_pills,  // [reply_received, brochure_sent, ...] — subset present
//         status_tags,     // [reserve, not_a_fit, opted_out, ...] — currently set
//       }, ...],
//       no_assessment:  [...],
//       with_brochure:  [...],
//       with_assessment:[...],
//     }
//   }
//
// Each list capped at 500 rows to keep payload reasonable.

const LIST_LIMIT = 500
const CONNECTED_STATES = ["audience", "prospect", "qualified", "member"]

export async function GET() {
  const sb = serverClient()

  // All connected CFOs
  const { data: cfos, error } = await sb
    .from("people")
    .select("id, full_name, first_name, last_name, title, company, cfo_state, last_meaningful_touch")
    .in("cfo_state", CONNECTED_STATES)
    .contains("roles", ["cfo"])
    .limit(5000)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const cfoIds = (cfos || []).map(c => c.id)
  if (cfoIds.length === 0) {
    return Response.json({
      connected_total: 0,
      brochure:   { sent: 0, not_sent: 0, pct_sent: 0 },
      assessment: { sent: 0, not_sent: 0, pct_sent: 0 },
      lists: { no_brochure: [], no_assessment: [], with_brochure: [], with_assessment: [] },
    })
  }

  // All action tags for these CFOs (whole picture, not just brochure/assessment).
  // We need this for: brochure/assessment bucketing, the connected_at date,
  // and rendering activity pills on each row.
  const { data: tags } = await sb
    .from("person_action_tags")
    .select("person_id, action_type, as_of_date, set_at")
    .in("person_id", cfoIds)
    .is("removed_at", null)

  // Group by person — keep the array, and also derive a quick-lookup set per type
  const tagsByPerson = {}      // person_id → [{action_type, as_of_date, set_at}, ...]
  const hasBrochure   = new Set()
  const hasAssessment = new Set()
  for (const t of tags || []) {
    if (!tagsByPerson[t.person_id]) tagsByPerson[t.person_id] = []
    tagsByPerson[t.person_id].push({
      type: t.action_type,
      as_of_date: t.as_of_date,
      set_at: t.set_at,
    })
    if (t.action_type === "brochure_sent")   hasBrochure.add(t.person_id)
    if (t.action_type === "assessment_sent") hasAssessment.add(t.person_id)
  }

  // Status tags currently active (not removed) — for warning pills
  const { data: statusRows } = await sb
    .from("person_status_tags")
    .select("person_id, tag")
    .in("person_id", cfoIds)
    .is("removed_at", null)

  const statusByPerson = {}    // person_id → [tag, ...]
  for (const s of statusRows || []) {
    if (!statusByPerson[s.person_id]) statusByPerson[s.person_id] = []
    statusByPerson[s.person_id].push(s.tag)
  }

  // Action types we surface as pills (in display order). Anything else is hidden.
  const PILL_ORDER = ["reply_received", "brochure_sent", "assessment_sent", "fit_call_completed"]

  // Helper to shape an output row — includes activity_pills, status_tags, connected_at
  function row(p) {
    const personTags = tagsByPerson[p.id] || []

    // connected_at = earliest as_of_date / set_at for connection_accepted
    const connectTag = personTags.find(t => t.type === "connection_accepted")
    const connectedAt = connectTag ? (connectTag.as_of_date || (connectTag.set_at ? connectTag.set_at.slice(0, 10) : null)) : null

    // Activity pills, sorted by PILL_ORDER
    const presentTypes = new Set(personTags.map(t => t.type))
    const activityPills = PILL_ORDER.filter(type => presentTypes.has(type))

    return {
      id: p.id,
      name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      title: p.title,
      company: p.company,
      cfo_state: p.cfo_state,
      last_touch: p.last_meaningful_touch,
      connected_at: connectedAt,
      activity_pills: activityPills,
      status_tags: statusByPerson[p.id] || [],
    }
  }

  // Sort: by cfo_state importance (member > qualified > prospect > audience),
  // then by last touch desc (most-recently-touched first within each bucket)
  const stateRank = { member: 0, qualified: 1, prospect: 2, audience: 3 }
  const sorter = (a, b) => {
    const r = (stateRank[a.cfo_state] ?? 9) - (stateRank[b.cfo_state] ?? 9)
    if (r !== 0) return r
    if (a.last_touch && b.last_touch) return b.last_touch.localeCompare(a.last_touch)
    if (a.last_touch) return -1
    if (b.last_touch) return 1
    return 0
  }

  const noBrochure     = cfos.filter(p => !hasBrochure.has(p.id)).sort(sorter).slice(0, LIST_LIMIT).map(row)
  const noAssessment   = cfos.filter(p => !hasAssessment.has(p.id)).sort(sorter).slice(0, LIST_LIMIT).map(row)
  const withBrochure   = cfos.filter(p =>  hasBrochure.has(p.id)).sort(sorter).slice(0, LIST_LIMIT).map(row)
  const withAssessment = cfos.filter(p =>  hasAssessment.has(p.id)).sort(sorter).slice(0, LIST_LIMIT).map(row)

  const total = cfos.length
  const pct = (n) => total === 0 ? 0 : Math.round((n / total) * 1000) / 10

  return Response.json({
    connected_total: total,
    brochure:   { sent: hasBrochure.size,   not_sent: total - hasBrochure.size,   pct_sent: pct(hasBrochure.size) },
    assessment: { sent: hasAssessment.size, not_sent: total - hasAssessment.size, pct_sent: pct(hasAssessment.size) },
    lists: {
      no_brochure:     noBrochure,
      no_assessment:   noAssessment,
      with_brochure:   withBrochure,
      with_assessment: withAssessment,
    },
  })
}
