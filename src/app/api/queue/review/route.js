export const dynamic = "force-dynamic"

// Review queue for auto-created / role-uncertain people.
//
// GET  /api/queue/review
//   Lists everyone with an active 'needs_role_review' status tag, newest first,
//   with their inferred role/state, company, email, source, and the most recent
//   booking note so Dalen can confirm or correct the role guess.
//
// POST /api/queue/review
//   Body: { person_id, action: 'confirm' | 'set_role', role?, state? }
//   - 'confirm'  → clear the needs_role_review tag, keep role/state as-is
//   - 'set_role' → set roles=[role] + the matching per-role state, then clear the tag
//   Either way the needs_role_review tag is removed (resolved).

import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

const ROLE_STATE_FIELD = { cfo: "cfo_state", sponsor_contact: "sponsor_state", referral_partner: "referral_state" }

export async function GET() {
  const sb = serverClient()

  // Active needs_role_review tags
  const { data: tags, error: tErr } = await sb
    .from("person_status_tags")
    .select("person_id, set_at")
    .eq("tag", "needs_role_review")
    .is("removed_at", null)
    .order("set_at", { ascending: false })
  if (tErr) return Response.json({ error: tErr.message }, { status: 500 })

  const ids = (tags || []).map(t => t.person_id)
  if (ids.length === 0) return Response.json({ count: 0, people: [] })

  const { data: people } = await sb
    .from("people")
    .select("id, full_name, first_name, last_name, email, company, roles, cfo_state, sponsor_state, referral_state, source, created_at")
    .in("id", ids)

  // Grab the latest Calendly note per person for context
  const { data: comms } = await sb
    .from("communications")
    .select("person_id, body, occurred_at, channel")
    .in("person_id", ids)
    .eq("channel", "Calendly")
    .order("occurred_at", { ascending: false })

  const noteByPerson = {}
  ;(comms || []).forEach(c => { if (!noteByPerson[c.person_id]) noteByPerson[c.person_id] = c.body })

  const setAtById = {}
  ;(tags || []).forEach(t => { setAtById[t.person_id] = t.set_at })

  const out = (people || [])
    .map(p => ({
      id: p.id,
      name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      email: p.email,
      company: p.company,
      roles: p.roles || [],
      cfo_state: p.cfo_state,
      sponsor_state: p.sponsor_state,
      referral_state: p.referral_state,
      source: p.source,
      flagged_at: setAtById[p.id],
      booking_note: noteByPerson[p.id] || null
    }))
    .sort((a, b) => (b.flagged_at || "").localeCompare(a.flagged_at || ""))

  return Response.json({ count: out.length, people: out })
}

export async function POST(request) {
  const sb = serverClient()

  let body
  try { body = await request.json() } catch(e) { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { person_id, action, role, state } = body
  if (!person_id || !action) return Response.json({ error: "person_id and action required" }, { status: 400 })

  if (action === "set_role") {
    if (!role || !ROLE_STATE_FIELD[role]) return Response.json({ error: "valid role required for set_role" }, { status: 400 })
    // Set the single role + its state via the centralized function (keeps tags consistent)
    await sb.rpc("set_role_state", {
      p_person_id: person_id,
      p_role: role,
      p_new_state: state || "prospect",
      p_set_by: "review_queue"
    })
    // Ensure roles array is exactly [role] (the auto-create guessed a single role)
    await sb.from("people").update({ roles: [role] }).eq("id", person_id)
  }

  // Clear the review flag
  await sb.rpc("remove_status_tag", { p_person_id: person_id, p_tag: "needs_role_review", p_removed_by: "review_queue" })

  return Response.json({ ok: true, person_id, resolved: true })
}
