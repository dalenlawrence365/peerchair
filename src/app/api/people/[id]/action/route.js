export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"
import { stampSources, isValidSource } from "@/lib/firmoSources"

// POST /api/people/[id]/action
// Body: { action, ... }
//   action="note"        { body }                       → log an internal note
//   action="set_state"   { role, state }                → advance/change a per-role state
//   action="add_tag"     { tag, notes? }                → add a status tag
//   action="action_tag"  { action_type, as_of_date?, notes? } → log an action tag (runs supersession)
//   action="remove_tag"  { tag }                        → remove a status tag
//
// Browser-facing (pc_auth localStorage model — same trust level as the rest
// of the new app's read/write surfaces).

const VALID_STATES = {
  cfo: ["pool", "audience", "prospect", "qualified", "member"],
  sponsor_contact: ["pool", "audience", "discovery", "proposal", "active"],
  referral_partner: ["pool", "audience"],
}

// The set_role_state Postgres fn expects short role keys (cfo|sponsor|referral)
// and writes <role>_state. Map the app's role keys onto that contract.
const RPC_ROLE = { cfo: "cfo", sponsor_contact: "sponsor", referral_partner: "referral" }

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
    const { error } = await sb.rpc("set_role_state", { p_person_id: id, p_role: RPC_ROLE[role] || role, p_new_state: state, p_set_by: "profile_ui" })
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

  // action="action_tag" — log a point-in-time ACTION tag (audit-trail event).
  // Routes through set_action_tag so supersession rules fire (e.g. completing a
  // fit call deletes the now-consumed fit_call_scheduled tag). Lifecycle events
  // like fit_call_completed/event_invite_sent are action tags, NOT status tags —
  // writing them via add_tag/set_status_tag silently skips supersession.
  if (action === "action_tag") {
    const actionType = (body.action_type || body.tag || "").trim()
    if (!actionType) return Response.json({ error: "action_type required" }, { status: 400 })

    // Marking a connection accepted flips the LinkedIn pill to connected and lifts any
    // pool/none role to 'audience' (a first-degree connection is, by definition, in the
    // audience). Runs before the same-day de-dupe return so re-clicking accept always
    // leaves the pill connected, even if the tag itself is a same-day dupe. Never demotes.
    if (actionType === "connection_accepted") {
      await sb.from("people").update({ linkedin_connected: true }).eq("id", id)
      const { data: full } = await sb.from("people")
        .select("roles, cfo_state, sponsor_state, referral_state").eq("id", id).maybeSingle()
      const stateField = { cfo: "cfo_state", sponsor_contact: "sponsor_state", referral_partner: "referral_state" }
      for (const role of (full?.roles || [])) {
        const cur = full[stateField[role]]
        if (cur === null || cur === undefined || cur === "" || cur === "pool") {
          await sb.rpc("set_role_state", { p_person_id: id, p_role: RPC_ROLE[role] || role, p_new_state: "audience", p_set_by: "connection_accepted" })
        }
      }
    }

    // De-dupe connection lifecycle tags to one-per-person-per-day so an accidental
    // double-click (or same-day re-click) doesn't write duplicate rows. A genuine re-send
    // on a later day still records. Backed by the uniq_conn_lifecycle_tag_per_day index.
    const DEDUP_SAME_DAY = ["connection_sent", "connection_accepted"]
    if (DEDUP_SAME_DAY.includes(actionType)) {
      const day = body.as_of_date || new Date().toISOString().slice(0, 10)
      const { data: existing } = await sb.from("person_action_tags")
        .select("id")
        .eq("person_id", id)
        .eq("action_type", actionType)
        .eq("as_of_date", day)
        .limit(1)
      if (existing && existing.length) {
        return Response.json({ ok: true, deduped: true, action_tag_id: existing[0].id })
      }
    }

    const { data, error } = await sb.rpc("set_action_tag", {
      p_person_id: id,
      p_action_type: actionType,
      p_as_of_date: body.as_of_date || null,
      p_as_of_time: body.as_of_time || null,
      p_set_by: "profile_ui",
      p_notes: body.notes || null,
    })
    if (error) {
      // Race: two near-simultaneous clicks can both pass the check above; the unique index
      // then rejects the second insert. Treat that as a successful no-op, not an error.
      if (DEDUP_SAME_DAY.includes(actionType) && /duplicate key|unique|23505/i.test(error.message || "")) {
        return Response.json({ ok: true, deduped: true })
      }
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ ok: true, action_tag_id: data })
  }

  if (action === "set_next_action") {
    // date is 'YYYY-MM-DD' to set, or null/empty to clear
    const d = body.date || null
    const { error } = await sb.from("people").update({ next_action_date: d }).eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  if (action === "set_firmographics") {
    // body.firmographics is the full JSONB object
    if (!body.firmographics || typeof body.firmographics !== "object") {
      return Response.json({ error: "firmographics object required" }, { status: 400 })
    }
    // body.source (optional) records WHERE these figures came from — a number a
    // CFO told you on a fit call and a number Sales Navigator guessed are not
    // worth the same, and without this they look identical forever.
    // Stamped per field, and only on fields whose value actually changed, so
    // re-saving the form can't relabel something you were told as something you
    // looked up.
    const src = body.source || null
    if (src && !isValidSource(src)) {
      return Response.json({ error: "Unknown source: " + src }, { status: 400 })
    }

    const { data: cur } = await sb.from("people").select("firmographics").eq("id", id).maybeSingle()
    const merged = stampSources(cur && cur.firmographics, body.firmographics, src)

    const { error } = await sb.from("people").update({ firmographics: merged, last_meaningful_touch: new Date().toISOString() }).eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true, firmographics: merged })
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

  if (action === "set_fields") {
    // Whitelisted scalar identity fields. Empty string clears (-> null).
    const ALLOWED = ["full_name", "title", "company", "email", "phone", "mobile", "location", "headline", "linkedin_url"]
    const fields = body.fields || {}
    const updates = {}
    for (const k of ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(fields, k)) {
        const v = fields[k]
        updates[k] = (v === null || String(v).trim() === "") ? null : String(v).trim()
      }
    }
    if (Object.keys(updates).length === 0) return Response.json({ error: "no editable fields supplied" }, { status: 400 })
    updates.last_meaningful_touch = new Date().toISOString()
    const { error } = await sb.from("people").update(updates).eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  if (action === "set_connected") {
    const val = body.connected === true
    const { error } = await sb.from("people").update({ linkedin_connected: val }).eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    // A first-degree connection is, by definition, in the audience. Advance any role
    // still at pool/none up to 'audience' — never demote someone already past it.
    if (val) {
      const { data: full } = await sb.from("people")
        .select("roles, cfo_state, sponsor_state, referral_state").eq("id", id).maybeSingle()
      const stateField = { cfo: "cfo_state", sponsor_contact: "sponsor_state", referral_partner: "referral_state" }
      for (const role of (full?.roles || [])) {
        const cur = full[stateField[role]]
        if (cur === null || cur === undefined || cur === "" || cur === "pool") {
          await sb.rpc("set_role_state", { p_person_id: id, p_role: RPC_ROLE[role] || role, p_new_state: "audience", p_set_by: "first_degree_toggle" })
        }
      }
    }
    return Response.json({ ok: true })
  }

  if (action === "set_roles") {
    const VALID_ROLES = ["cfo", "sponsor_contact", "referral_partner"]
    const incoming = Array.isArray(body.roles) ? Array.from(new Set(body.roles.filter(r => VALID_ROLES.includes(r)))) : null
    if (!incoming) return Response.json({ error: "roles array required" }, { status: 400 })
    const stateField = { cfo: "cfo_state", sponsor_contact: "sponsor_state", referral_partner: "referral_state" }
    const removed = (person.roles || []).filter(r => !incoming.includes(r))
    const patch = { roles: incoming }
    for (const r of removed) if (stateField[r]) patch[stateField[r]] = null  // clear stale stage of removed role
    const { error } = await sb.from("people").update(patch).eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  if (action === "set_cfo_circle") {
    const { error } = await sb.from("people").update({ cfo_circle_member: body.member === true }).eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  return Response.json({ error: "unknown action" }, { status: 400 })
}
