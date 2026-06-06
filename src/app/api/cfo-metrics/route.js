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
//       no_brochure:    [{ id, name, title, company, cfo_state, last_touch }, ...],
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

  // Who has brochure_sent / assessment_sent
  const { data: tags } = await sb
    .from("person_action_tags")
    .select("person_id, action_type")
    .in("person_id", cfoIds)
    .in("action_type", ["brochure_sent", "assessment_sent"])

  const hasBrochure   = new Set()
  const hasAssessment = new Set()
  for (const t of tags || []) {
    if (t.action_type === "brochure_sent")   hasBrochure.add(t.person_id)
    if (t.action_type === "assessment_sent") hasAssessment.add(t.person_id)
  }

  // Helper to shape an output row
  function row(p) {
    return {
      id: p.id,
      name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      title: p.title,
      company: p.company,
      cfo_state: p.cfo_state,
      last_touch: p.last_meaningful_touch,
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
