export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/cfo-metrics
//
// "Connected CFO" = 'cfo' in roles AND cfo_state in (audience, prospect,
// qualified, member). Returns metrics for brochure + assessment delivery,
// plus per-person activity tags / status tags / connected_at so the row
// can show the FULL outreach picture for each person at a glance.

const LIST_LIMIT = 500
const CONNECTED_STATES = ["audience", "prospect", "qualified", "member"]

// Action tags we care about per row
const ACTIVITY_TAGS = [
  "connection_accepted",
  "reply_received",
  "brochure_sent",
  "assessment_sent",
  "fit_call_scheduled",
  "fit_call_completed",
  "event_invite_sent",
]

export async function GET() {
  const sb = serverClient()

  // 1. Pull all connected CFOs
  const { data: cfos, error } = await sb
    .from("people")
    .select("id, full_name, first_name, last_name, title, company, email, email2, linkedin_url, cfo_state, last_meaningful_touch")
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

  // 2. Pull all action tags (for the activity pills + connected_at)
  // Pull in chunks of 500 if needed; PostgREST has IN-list size limits
  const actionTagsByPerson = new Map()
  const connectedAtByPerson = new Map()
  for (let i = 0; i < cfoIds.length; i += 500) {
    const chunk = cfoIds.slice(i, i + 500)
    const { data: tags } = await sb
      .from("person_action_tags")
      .select("person_id, action_type, as_of_date, as_of_time, set_at")
      .in("person_id", chunk)
      .in("action_type", ACTIVITY_TAGS)
    for (const t of tags || []) {
      if (!actionTagsByPerson.has(t.person_id)) actionTagsByPerson.set(t.person_id, new Set())
      actionTagsByPerson.get(t.person_id).add(t.action_type)
      if (t.action_type === "connection_accepted") {
        // Prefer as_of_date, then as_of_time, then set_at
        const when = t.as_of_date || t.as_of_time || t.set_at
        if (when) {
          const existing = connectedAtByPerson.get(t.person_id)
          if (!existing || when < existing) connectedAtByPerson.set(t.person_id, when)
        }
      }
    }
  }

  // 3. Pull active status tags
  const statusTagsByPerson = new Map()
  for (let i = 0; i < cfoIds.length; i += 500) {
    const chunk = cfoIds.slice(i, i + 500)
    const { data: stags } = await sb
      .from("person_status_tags")
      .select("person_id, tag")
      .in("person_id", chunk)
      .is("removed_at", null)
    for (const s of stags || []) {
      if (!statusTagsByPerson.has(s.person_id)) statusTagsByPerson.set(s.person_id, [])
      statusTagsByPerson.get(s.person_id).push(s.tag)
    }
  }

  // Shape an output row with all the metadata
  function row(p) {
    const acts = actionTagsByPerson.get(p.id) || new Set()
    return {
      id: p.id,
      name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      title: p.title,
      company: p.company,
      email: (p.email && p.email.trim()) || (p.email2 && p.email2.trim()) || null,
      linkedin_url: (p.linkedin_url && p.linkedin_url.trim()) || null,
      cfo_state: p.cfo_state,
      last_touch: p.last_meaningful_touch,
      connected_at: connectedAtByPerson.get(p.id) || null,
      activity: {
        replied:           acts.has("reply_received"),
        brochure_sent:     acts.has("brochure_sent"),
        assessment_sent:   acts.has("assessment_sent"),
        fit_call_scheduled: acts.has("fit_call_scheduled"),
        fit_call_completed: acts.has("fit_call_completed"),
        event_invite_sent: acts.has("event_invite_sent"),
      },
      status_tags: statusTagsByPerson.get(p.id) || [],
    }
  }

  // Sort by cfo_state importance, then last_touch desc
  const stateRank = { member: 0, qualified: 1, prospect: 2, audience: 3 }
  const sorter = (a, b) => {
    const r = (stateRank[a.cfo_state] ?? 9) - (stateRank[b.cfo_state] ?? 9)
    if (r !== 0) return r
    if (a.last_touch && b.last_touch) return b.last_touch.localeCompare(a.last_touch)
    if (a.last_touch) return -1
    if (b.last_touch) return 1
    return 0
  }

  // Compute the four lists
  const withBrochure   = []
  const noBrochure     = []
  const withAssessment = []
  const noAssessment   = []
  for (const p of cfos) {
    const r = row(p)
    if (r.activity.brochure_sent)   withBrochure.push(r);   else noBrochure.push(r)
    if (r.activity.assessment_sent) withAssessment.push(r); else noAssessment.push(r)
  }
  withBrochure.sort(sorter)
  noBrochure.sort(sorter)
  withAssessment.sort(sorter)
  noAssessment.sort(sorter)

  const total = cfos.length
  const bSent = withBrochure.length
  const aSent = withAssessment.length
  const pct = (n) => total === 0 ? 0 : Math.round((n / total) * 1000) / 10

  return Response.json({
    connected_total: total,
    brochure:   { sent: bSent, not_sent: total - bSent, pct_sent: pct(bSent) },
    assessment: { sent: aSent, not_sent: total - aSent, pct_sent: pct(aSent) },
    lists: {
      no_brochure:     noBrochure.slice(0, LIST_LIMIT),
      no_assessment:   noAssessment.slice(0, LIST_LIMIT),
      with_brochure:   withBrochure.slice(0, LIST_LIMIT),
      with_assessment: withAssessment.slice(0, LIST_LIMIT),
    },
  })
}
