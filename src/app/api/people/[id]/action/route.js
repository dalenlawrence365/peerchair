export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

// POST /api/people/[id]/action
// Body: { action, ... }
//   action="note"        { body }                       → log an internal note
//   action="set_state"   { role, state }                → advance/change a per-role state
//   action="add_tag"     { tag, notes? }                → add a status tag
//   action="remove_tag"  { tag }                        → remove a status tag
//
// Browser-facing (pc_auth localStorage model — same trust level as the rest
// of the new app's read/write surfaces).

const VALID_STATES = {
  cfo: ["pool", "audience", "prospect", "qualified", "member"],
  sponsor_contact: ["pool", "audience", "discovery", "proposal", "active"],
  referral_partner: ["pool", "audience", "active"],
}

export async function POST(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })

  let body
  try { body = await request.json() } catch(e) { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  const action = body.action

  const sb = serverClient()

  // Confirm the person exists
  const { data: person } = await sb.from("people").select("id, roles").eq("id", id).maybeSingle()
  if (!person) return Response.json({ error: "Person not found" }, { status: 404 })

  if (action === "note") {
    const text = (body.body || "").trim()
    if (!text) return Response.json({ error: "note body required" }, { status: 400 })
    const { error } = await sb.from("communications").insert({
      person_id: id,
      direction: "INTERNAL", channel: "Note",
      body: text, occurred_at: new Date().toISOString(),
      step_label: "Note", source: "App", logged_by: "Dalen Lawrence"
    })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    await sb.from("people").update({ last_meaningful_touch: new Date().toISOString() }).eq("id", id)
    return Response.json({ ok: true })
  }

  if (action === "set_state") {
    const role = body.role, state = body.state
    if (!role || !state) return Response.json({ error: "role and state required" }, { status: 400 })
    if (!VALID_STATES[role] || VALID_STATES[role].indexOf(state) < 0) {
      return Response.json({ error: `invalid state '${state}' for role '${role}'` }, { status: 400 })
    }
    const { error } = await sb.rpc("set_role_state", { p_person_id: id, p_role: role, p_new_state: state, p_set_by: "profile_ui" })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    // Ensure the role is present in the roles array (in case they advance a role they didn't formally have)
    if ((person.roles || []).indexOf(role) < 0) {
      await sb.from("people").update({ roles: [...(person.roles || []), role] }).eq("id", id)
    }
    return Response.json({ ok: true })
  }

  if (action === "add_tag") {
    const tag = (body.tag || "").trim()
    if (!tag) return Response.json({ error: "tag required" }, { status: 400 })
    const { error } = await sb.rpc("set_status_tag", { p_person_id: id, p_tag: tag, p_set_by: "profile_ui", p_notes: body.notes || null })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  if (action === "remove_tag") {
    const tag = (body.tag || "").trim()
    if (!tag) return Response.json({ error: "tag required" }, { status: 400 })
    const { error } = await sb.rpc("remove_status_tag", { p_person_id: id, p_tag: tag, p_removed_by: "profile_ui" })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  if (action === "set_firmographics") {
    // body.firmographics is the full JSONB object
    if (!body.firmographics || typeof body.firmographics !== "object") {
      return Response.json({ error: "firmographics object required" }, { status: 400 })
    }
    const { error } = await sb.from("people").update({ firmographics: body.firmographics, last_meaningful_touch: new Date().toISOString() }).eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  if (action === "set_avatar") {
    // body.avatar_url is a URL string, or empty/null to clear it
    const raw = (body.avatar_url || "").trim()
    if (raw && !/^https?:\/\//i.test(raw)) {
      return Response.json({ error: "avatar_url must be an http(s) URL" }, { status: 400 })
    }
    const { error } = await sb.from("people").update({ avatar_url: raw || null }).eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  return Response.json({ error: "unknown action" }, { status: 400 })
}
