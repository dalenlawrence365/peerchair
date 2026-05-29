export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"

// Calendly webhook receiver — event-type-aware routing.
//
// Not every Calendly link carries pipeline intent:
//
//   PIPELINE-BEARING (booking is real forward intent → match-or-auto-create):
//     "CFO Circle - Fit Chat"               → CFO at prospect
//     "CFO Circle - Sponsor Discovery Call" → sponsor_contact at discovery
//
//   GENERIC (booking carries no funnel signal — could be anyone):
//     "CFO Circle - 15 Minute Chat"
//     "CFO Circle - 30 Minute"
//     → if matched, log booking as a communication (timeline history).
//       No stage advance, no action tag.
//     → if no match, do NOT auto-create. Log to webhook_unmatched.
//
//   Anything else (unrecognized name): log to webhook_unmatched.

const PIPELINE_EVENTS = {
  "cfo circle - fit chat": {
    role: "cfo", advanceTo: "prospect", advanceFrom: ["pool", "audience"],
    actionTag: "fit_call_scheduled", stepLabel: "Fit Call Scheduled",
    legacyStage: "Fit Call Scheduled"
  },
  "cfo circle - sponsor discovery call": {
    role: "sponsor_contact", advanceTo: "discovery", advanceFrom: ["pool", "audience"],
    actionTag: "sponsor_discovery_scheduled", stepLabel: "Sponsor Discovery Scheduled",
    legacyStage: "Discovery Sched."
  }
}
const GENERIC_EVENTS = new Set(["cfo circle - 15 minute chat", "cfo circle - 30 minute"])

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  })
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Calendly-Webhook-Signature"
    }
  })
}

export async function POST(request) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  let body
  try { body = await request.json() } catch (e) {
    return json({ error: "Invalid JSON" }, 400)
  }

  const eventType = body.event || ""
  const payload = body.payload || {}
  console.log(`Calendly webhook: ${eventType}`)

  if (eventType !== "invitee.created") {
    return json({ ok: true, skipped: true, reason: "Not a booking event" })
  }

  // Defensive payload parsing — Calendly variants
  const invitee = payload.invitee || payload || {}
  const event = payload.event || {}
  const email = (payload.email || invitee.email || "").toLowerCase()
  const name = payload.name || invitee.name || ""
  const startTime = payload.scheduled_event?.start_time || event.start_time || payload.event?.start_time || ""
  const eventName = payload.scheduled_event?.name || payload.event_type?.name || event.name || ""

  // Company from the required custom question
  const qa = payload.questions_and_answers || invitee.questions_and_answers || []
  let company = ""
  for (const item of qa) {
    if ((item.question || "").toLowerCase().includes("company")) {
      company = (item.answer || "").trim()
      break
    }
  }

  console.log(`Booking: ${name} (${email}) — ${eventName} — company: ${company} at ${startTime}`)

  if (!email) return json({ error: "No email in payload" }, 400)

  // Classify the event by exact name (lowercased)
  const norm = eventName.trim().toLowerCase()
  const pipeline = PIPELINE_EVENTS[norm] || null
  const isGeneric = GENERIC_EVENTS.has(norm)

  // Unknown event name → log a trail, no changes
  if (!pipeline && !isGeneric) {
    await sb.from("webhook_unmatched").insert({
      event_type: "calendly_booking_unknown_event",
      lead_name: name, lead_company: company || null,
      message_body: `Unrecognized Calendly event "${eventName}" booked by ${name} (${email}) at ${startTime}`,
      raw_payload: body
    })
    return json({ ok: true, skipped: true, reason: "Unknown event name", event: eventName })
  }

  // ── Match cascade (email → name → name+company → company) ─────────────
  let contact = null
  let matchedBy = null
  if (email) {
    const { data: byEmail } = await sb.from("people")
      .select("id, first_name, last_name, full_name, company, roles, cfo_state, sponsor_state, email")
      .ilike("email", email).maybeSingle()
    if (byEmail) { contact = byEmail; matchedBy = "email" }
  }
  if (!contact) {
    const parts = name.trim().split(" ")
    const firstName = parts[0] || ""
    const lastName = parts.slice(1).join(" ") || ""
    if (firstName) {
      const { data: nameMatches } = await sb.from("people")
        .select("id, first_name, last_name, full_name, company, roles, cfo_state, sponsor_state, email")
        .ilike("first_name", firstName).ilike("last_name", `%${lastName}%`).limit(5)
      if (nameMatches && nameMatches.length === 1) {
        contact = nameMatches[0]; matchedBy = "name"
      } else if (nameMatches && nameMatches.length > 1 && company) {
        const byCompany = nameMatches.find(m => (m.company || "").toLowerCase() === company.toLowerCase())
        if (byCompany) { contact = byCompany; matchedBy = "name+company" }
      }
    }
    if (!contact && company) {
      const { data: coMatches } = await sb.from("people")
        .select("id, first_name, last_name, full_name, company, roles, cfo_state, sponsor_state, email")
        .ilike("company", company).limit(3)
      if (coMatches && coMatches.length === 1) { contact = coMatches[0]; matchedBy = "company" }
    }
  }

  // ── GENERIC link, no match: do NOT auto-create ────────────────────────
  if (!contact && isGeneric) {
    await sb.from("webhook_unmatched").insert({
      event_type: "calendly_booking_generic_no_match",
      lead_name: name, lead_company: company || null,
      message_body: `Generic-link booking ("${eventName}") by ${name} (${email}). Not auto-created (generic links carry no funnel intent).`,
      raw_payload: body
    })
    return json({ ok: true, skipped: true, reason: "Generic link, unknown person — not auto-creating", event: eventName })
  }

  // ── PIPELINE link, no match: Option C auto-create ─────────────────────
  if (!contact && pipeline) {
    const parts = name.trim().split(" ")
    const firstName = parts[0] || ""
    const lastName = parts.slice(1).join(" ") || ""

    const insertRow = {
      first_name: firstName || null, last_name: lastName || null,
      full_name: name || null, email: email || null, company: company || null,
      roles: [pipeline.role],
      cfo_state:     pipeline.role === "cfo" ? pipeline.advanceTo : null,
      sponsor_state: pipeline.role === "sponsor_contact" ? pipeline.advanceTo : null,
      source: "calendly-inbound-unmatched",
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }
    const { data: created, error: cErr } = await sb.from("people").insert(insertRow).select("id, full_name").single()
    if (cErr) {
      await sb.from("webhook_unmatched").insert({
        event_type: "calendly_booking_create_failed",
        lead_name: name, lead_company: company || null,
        message_body: `Booked: ${eventName} at ${startTime} (auto-create failed: ${cErr.message})`,
        raw_payload: body
      })
      return json({ ok: true, matched: false, created: false, error: cErr.message })
    }

    await sb.rpc("set_status_tag", { p_person_id: created.id, p_tag: "needs_role_review", p_set_by: "calendly_webhook" })
    await sb.rpc("set_status_tag", { p_person_id: created.id, p_tag: "not_on_linkedin", p_set_by: "calendly_webhook" })
    await sb.rpc("set_action_tag", { p_person_id: created.id, p_action_type: pipeline.actionTag, p_set_by: "calendly_webhook", p_notes: `${eventName} @ ${startTime} (auto-created from booking)` })
    await sb.from("communications").insert({
      person_id: created.id,
      direction: "IN", channel: "Calendly",
      body: `${eventName} booked for ${startTime ? new Date(startTime).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) : "TBD"}. Auto-created from booking (company: ${company || "—"}). Role guessed as ${pipeline.role} — confirm.`,
      occurred_at: new Date().toISOString(),
      step_label: pipeline.stepLabel,
      source: "Calendly"
    })
    return json({
      ok: true, matched: false, created: true,
      contact_id: created.id, name: created.full_name,
      inferred_role: pipeline.role, inferred_state: pipeline.advanceTo,
      note: "Auto-created and flagged needs_role_review"
    })
  }

  // ── MATCHED ───────────────────────────────────────────────────────────
  // Backfill email/company on any non-email match
  if (matchedBy && matchedBy !== "email") {
    const patch = {}
    if (email && !contact.email) patch.email = email
    if (company && !contact.company) patch.company = company
    if (Object.keys(patch).length > 0) await sb.from("people").update(patch).eq("id", contact.id)
  }

  // Pipeline link: advance state + action tag + legacy stage sync
  if (pipeline) {
    if ((contact.roles || []).includes(pipeline.role)) {
      const currentState = pipeline.role === "cfo" ? contact.cfo_state : contact.sponsor_state
      if (pipeline.advanceFrom.includes(currentState)) {
        await sb.rpc("set_role_state", { p_person_id: contact.id, p_role: pipeline.role, p_new_state: pipeline.advanceTo, p_set_by: "calendly_webhook" })
      }
      await sb.rpc("set_action_tag", { p_person_id: contact.id, p_action_type: pipeline.actionTag, p_set_by: "calendly_webhook", p_notes: `${eventName} @ ${startTime}` })
    }
    await sb.from("contacts").update({ pipeline_stage: pipeline.legacyStage, last_activity_date: new Date().toISOString() }).eq("id", contact.id)
  }
  // Generic link, matched: no stage change, no action tag — just the comm below.

  await sb.from("people").update({ last_meaningful_touch: new Date().toISOString() }).eq("id", contact.id)

  await sb.from("communications").insert({
    person_id: contact.id,
    direction: "IN", channel: "Calendly",
    body: `${eventName} booked for ${startTime ? new Date(startTime).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) : "TBD"}`,
    occurred_at: new Date().toISOString(),
    step_label: pipeline ? pipeline.stepLabel : "Generic Meeting",
    source: "Calendly"
  })

  console.log(`${contact.full_name || contact.first_name} booking logged (matched by ${matchedBy}, event=${pipeline ? "pipeline" : "generic"})`)

  return json({
    ok: true, matched: true, matched_by: matchedBy,
    event_kind: pipeline ? "pipeline" : "generic",
    contact_id: contact.id,
    name: contact.full_name || `${contact.first_name} ${contact.last_name}`,
    event: eventName, scheduled_for: startTime
  })
}
