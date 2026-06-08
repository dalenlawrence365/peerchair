export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/unmatched
// Returns all people with an active 'unmatched' status_tag, plus context
// (LinkedIn URL, title, company, action history) so Dalen can decide what
// to do with each one individually.

export async function GET() {
  const sb = serverClient()

  // 1. Get all active unmatched tags
  const { data: tags, error: tagErr } = await sb
    .from("person_status_tags")
    .select("person_id, set_at, notes")
    .eq("tag", "unmatched")
    .is("removed_at", null)
  if (tagErr) return Response.json({ error: tagErr.message }, { status: 500 })

  const ids = (tags || []).map(t => t.person_id)
  const tagBy = new Map((tags || []).map(t => [t.person_id, t]))

  if (ids.length === 0) return Response.json({ people: [] })

  // 2. Get people details
  const { data: people, error: pErr } = await sb
    .from("people")
    .select("id, full_name, first_name, last_name, title, company, email, linkedin_url, roles, cfo_state, sponsor_state, referral_state, last_meaningful_touch, notes")
    .in("id", ids)
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 })

  // 3. Pull action history per person — what activity tags they have
  const { data: actions } = await sb
    .from("person_action_tags")
    .select("person_id, action_type")
    .in("person_id", ids)
  const actsByPerson = new Map()
  for (const a of actions || []) {
    if (!actsByPerson.has(a.person_id)) actsByPerson.set(a.person_id, new Set())
    actsByPerson.get(a.person_id).add(a.action_type)
  }

  const result = people.map(p => {
    const tag = tagBy.get(p.id)
    const acts = actsByPerson.get(p.id) || new Set()
    return {
      id: p.id,
      name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      title: p.title,
      company: p.company,
      email: p.email,
      linkedin_url: p.linkedin_url,
      roles: p.roles || [],
      last_touch: p.last_meaningful_touch,
      tagged_at: tag?.set_at,
      tag_notes: tag?.notes,
      activity: {
        replied: acts.has("reply_received"),
        connected: acts.has("connection_accepted"),
        brochure_sent: acts.has("brochure_sent"),
        assessment_sent: acts.has("assessment_sent"),
      },
    }
  })

  // Sort: people who replied first (most actionable), then by tagged_at desc
  result.sort((a, b) => {
    if (a.activity.replied !== b.activity.replied) return a.activity.replied ? -1 : 1
    if (a.tagged_at && b.tagged_at) return b.tagged_at.localeCompare(a.tagged_at)
    return 0
  })

  return Response.json({ people: result, count: result.length })
}
