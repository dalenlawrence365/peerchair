export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"
import { stampSources, isValidSource } from "@/lib/firmoSources"

// Invitations are a sub-category of action tag (ws_invite_MM-DD-YY, legacy
// social_invite_/*_invite_MM-DD-YY, and the legacy generic event_invite_sent)
// — kept in sync with the same check the profile UI uses to split them into
// their own "Invitations" section. When one of these gets logged, it's
// mirrored onto the Timeline as its own "Workshop Invitation" entry so the
// invite is visible chronologically alongside emails/LinkedIn/notes, and so
// deep research (which reads the timeline) knows about it without a
// separate lookup.
function isInvitationTag(actionType) {
  const t = actionType || ""
  return /^ws_invite_/.test(t) || /^social_invite_/.test(t) || /_invite_\d{2}-\d{2}-\d{2}$/.test(t) || t === "event_invite_sent"
}

function describeInviteTag(actionType) {
  const t = actionType || ""
  const ws = t.match(/^ws_invite_(\d{2})-(\d{2})-(\d{2})$/)
  if (ws) return `Invited to the ${friendlyDate(ws[1], ws[2], ws[3])} workshop.`
  const social = t.match(/^social_invite_(\d{2})-(\d{2})-(\d{2})$/)
  if (social) return `Invited to the ${friendlyDate(social[1], social[2], social[3])} social event.`
  const generic = t.match(/_invite_(\d{2})-(\d{2})-(\d{2})$/)
  if (generic) return `Invited to the ${friendlyDate(generic[1], generic[2], generic[3])} event.`
  if (t === "event_invite_sent") return "Invited to an event."
  return `Invited (${t}).`
}

function friendlyDate(mm, dd, yy) {
  const d = new Date(2000 + parseInt(yy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10))
  try { return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) } catch (e) { return `${mm}/${dd}/${yy}` }
}

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
  const { data: person } = await sb.from("people").select("id, roles, referral_state").eq("id", id).maybeSingle()
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

    // Marking a connection accepted flips the LinkedIn pill to connected. For cfo/sponsor
    // roles, cfo_state/sponsor_state are auto-recomputed by a DB trigger (people_recompute_role_states)
    // from linkedin_connected + the independent cfo_*_at / sponsor_*_at flag columns the
    // moment linkedin_connected changes — no manual advance needed, and it's demotion-safe
    // (a person who's already prospect/qualified/member never gets knocked down to audience).
    // referral_partner has no flag columns, so it still needs the old manual advance-only bump.
    if (actionType === "connection_accepted") {
      await sb.from("people").update({ linkedin_connected: true }).eq("id", id)
      if ((person.roles || []).includes("referral_partner") && (person.referral_state == null || person.referral_state === "" || person.referral_state === "pool")) {
        await sb.rpc("set_role_state", { p_person_id: id, p_role: "referral", p_new_state: "audience", p_set_by: "connection_accepted" })
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

    // Mirror invitation action tags onto the Timeline (see isInvitationTag
    // above). Dedupe on (person_id, channel, step_label) — step_label is the
    // exact tag (e.g. ws_invite_09-16-26), which already encodes the specific
    // invite, so re-adding the same tag never double-logs the timeline entry.
    // NOTE: a DB trigger (normalize_communications_format) lowercases
    // `channel` on insert, so the dedupe check below has to match against
    // the lowercased form even though the insert writes the display-cased
    // "Workshop Invitation" — matching on the pre-trigger case here silently
    // never finds the existing row and re-inserts a duplicate every time.
    if (isInvitationTag(actionType)) {
      const { data: existingTimeline } = await sb.from("communications")
        .select("id").eq("person_id", id).eq("channel", "workshop invitation")
        .eq("step_label", actionType).limit(1)
      if (!existingTimeline || !existingTimeline.length) {
        const occurredAt = body.as_of_date ? new Date(body.as_of_date + "T12:00:00").toISOString() : new Date().toISOString()
        await sb.from("communications").insert({
          person_id: id,
          direction: "INTERNAL",
          channel: "Workshop Invitation",
          step_label: actionType,
          body: describeInviteTag(actionType),
          occurred_at: occurredAt,
          source: "App",
          logged_by: "Dalen Lawrence",
        })
      }
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
    // cfo_state/sponsor_state recompute automatically (DB trigger) whenever linkedin_connected
    // changes, in either direction — connecting lifts the audience floor, disconnecting drops
    // it, and an independently-set prospect/qualified/member flag is never touched either way.
    // referral_partner has no flag columns, so it still needs a manual advance-only bump, and
    // only forward (connecting), never on disconnect — matches the old "never demote" rule.
    if (val && (person.roles || []).includes("referral_partner") && (person.referral_state == null || person.referral_state === "" || person.referral_state === "pool")) {
      await sb.rpc("set_role_state", { p_person_id: id, p_role: "referral", p_new_state: "audience", p_set_by: "first_degree_toggle" })
    }
    return Response.json({ ok: true })
  }

  // action="set_stage_flag" — independently toggle one engagement flag on/off.
  // Body: { role: "cfo"|"sponsor", stage: <flag name>, on: boolean }
  // Unlike the old cumulative ladder, these are NOT mutually exclusive or ordered:
  // someone can be "qualified" (e.g. pre-qualified from public research) without ever
  // having been "prospect". Writing the *_at column is all this does — cfo_state /
  // sponsor_state (the legacy single-value summary other code still reads) recompute
  // automatically via the people_recompute_role_states DB trigger.
  const STAGE_FLAG_COL = {
    cfo:     { prospect: "cfo_prospect_at",      qualified: "cfo_qualified_at",  member: "cfo_member_at" },
    sponsor: { discovery: "sponsor_discovery_at", proposal: "sponsor_proposal_at", active: "sponsor_active_at" },
  }
  if (action === "set_stage_flag") {
    const role = body.role
    const stage = body.stage
    const on = body.on === true
    const col = STAGE_FLAG_COL[role] && STAGE_FLAG_COL[role][stage]
    if (!col) return Response.json({ error: `invalid role/stage '${role}'/'${stage}'` }, { status: 400 })
    const { error } = await sb.from("people").update({ [col]: on ? new Date().toISOString() : null }).eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
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
