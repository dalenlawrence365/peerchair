export const dynamic = "force-dynamic"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { corsResponse, handleOptions, CORS_HEADERS } from "@/lib/cors"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

// Stage progression map — what stage to move to when logging outreach
const STAGE_AFTER_OUTREACH = {
  "fit_call_link_sent": "Fit Invite Sent",
  "fit_call_scheduled": "Fit Call Scheduled",
  "fit_call_completed": "Fit Call Completed",
  "sponsor_discovery_link_sent": "Discovery Sched.",
  "sponsor_discovery_scheduled": "Discovery Sched.",
  "sponsor_discovery_completed": "Discovery Done",
  "general_follow_up": null, // no stage change
}

// Equivalent advance in the unified people model (role + per-role state).
// Used so people-only records (no contacts row) still advance correctly.
const PEOPLE_STATE_AFTER_OUTREACH = {
  "fit_call_link_sent":          { role: "cfo", state: "prospect" },
  "fit_call_scheduled":          { role: "cfo", state: "prospect" },
  "fit_call_completed":          { role: "cfo", state: "prospect" },
  "sponsor_discovery_link_sent": { role: "sponsor_contact", state: "discovery" },
  "sponsor_discovery_scheduled": { role: "sponsor_contact", state: "discovery" },
  "sponsor_discovery_completed": { role: "sponsor_contact", state: "discovery" },
  "general_follow_up": null,
}

export async function OPTIONS() { return handleOptions() }

export async function POST(request) {
  console.log('log-outreach POST called')
  let rawBody = null
  try {
    rawBody = await request.text()
    console.log('log-outreach body:', rawBody.slice(0, 500))
  } catch(e) {
    console.error('log-outreach body parse error:', e.message)
    return corsResponse({ error: 'Could not read request body' }, { status: 400 })
  }

  if (!verifyGptActionKey(request)) {
    return corsResponse({ error: "Unauthorized" }, { status: 401 })
  }

  let body
  try { body = JSON.parse(rawBody) } catch(e) { return corsResponse({ error: "Invalid JSON" }, { status: 400 }) }
  const {
    contact_id,
    message,       // the message text
    channel,       // LinkedIn | Email | Phone | Note
    outreach_type, // fit_call_link_sent | sponsor_discovery_link_sent | general_follow_up etc
    subject,       // optional, for email
  } = body

  if (!contact_id || !message || !channel) {
    return corsResponse({ error: "contact_id, message, and channel are required" }, { status: 400 })
  }

  const sb = serverClient()

  // Verify the person exists (people, not contacts)
  const { data: contact } = await sb
    .from("people")
    .select("id, first_name, last_name, cfo_state, sponsor_state, roles")
    .eq("id", contact_id)
    .maybeSingle()

  if (!contact) {
    return corsResponse({ error: "Contact not found" }, { status: 404 })
  }

  // Log to communications — person_id only (people-first; contact_id FK needs a contacts row)
  const { error: insertError } = await sb.from("communications").insert({
    person_id: contact_id,
    direction: "OUT",
    channel,
    body: subject ? `Subject: ${subject}\n\n${message}` : message,
    occurred_at: new Date().toISOString(),
    step_label: `${channel} Outreach (ChatGPT)`
  })
  if (insertError) console.error("communications insert error:", insertError.message)

  // Update stage if appropriate
  const newStage = STAGE_AFTER_OUTREACH[outreach_type] || null
  const peopleAdvance = PEOPLE_STATE_AFTER_OUTREACH[outreach_type] || null
  let stageUpdated = false

  // Legacy contacts update (no-ops for people-only rows; fires trigger for migrated rows)
  if (newStage) {
    await sb.from("contacts").update({ pipeline_stage: newStage, last_activity_date: new Date().toISOString() }).eq("id", contact_id)
    stageUpdated = true
  } else {
    await sb.from("contacts").update({ last_activity_date: new Date().toISOString() }).eq("id", contact_id)
  }

  // Unified people update — works for ALL records including people-only.
  // Uses the centralized set_role_state function so supersession rules apply.
  if (peopleAdvance) {
    await sb.rpc("set_role_state", {
      p_person_id: contact_id,
      p_role: peopleAdvance.role,
      p_new_state: peopleAdvance.state,
      p_set_by: "log_outreach_gpt"
    })
  }

  return corsResponse({
    success: true,
    message: `Logged ${channel} outreach to ${contact.first_name} ${contact.last_name}.${stageUpdated ? ` Stage updated to "${newStage}".` : ""} PeerChair is up to date.`,
    contact_name: `${contact.first_name} ${contact.last_name}`,
    channel,
    stage_updated: stageUpdated,
    new_stage: newStage || contact.pipeline_stage,
    previous_stage: contact.pipeline_stage
  })
}
