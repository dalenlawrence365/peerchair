export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
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
  try { body = await request.json() } catch(e) {
    return json({ error: "Invalid JSON" }, 400)
  }

  const eventType = body.event || ""
  const payload = body.payload || {}

  console.log(`Calendly webhook: ${eventType}`)

  // Only handle invitee.created (new booking)
  if (eventType !== "invitee.created") {
    return json({ ok: true, skipped: true, reason: "Not a booking event" })
  }

  const invitee = payload.invitee || {}
  const event = payload.event || {}
  const email = invitee.email?.toLowerCase() || ""
  const name = invitee.name || ""
  const startTime = event.start_time || payload.scheduled_event?.start_time || ""
  const eventName = payload.event_type?.name || event.name || ""

  console.log(`Booking: ${name} (${email}) — ${eventName} at ${startTime}`)

  if (!email) return json({ error: "No email in payload" }, 400)

  // Determine which type of meeting was booked
  const isFitCall = eventName.toLowerCase().includes("fit") || 
                    eventName.toLowerCase().includes("cfo circle")
  const isSponsor = eventName.toLowerCase().includes("sponsor")

  // Find person by email (people, not legacy contacts)
  let contact = null
  let matchedBy = null
  if (email) {
    const { data: byEmail } = await sb.from("people")
      .select("id, first_name, last_name, full_name, roles, cfo_state, sponsor_state, email")
      .ilike("email", email)
      .maybeSingle()
    if (byEmail) { contact = byEmail; matchedBy = "email" }
  }

  if (!contact) {
    // Fall back to name match
    const parts = name.trim().split(" ")
    const firstName = parts[0] || ""
    const lastName = parts.slice(1).join(" ") || ""
    if (firstName) {
      const { data: byName } = await sb.from("people")
        .select("id, first_name, last_name, full_name, roles, cfo_state, sponsor_state, email")
        .ilike("first_name", firstName)
        .ilike("last_name", `%${lastName}%`)
        .maybeSingle()
      if (byName) { contact = byName; matchedBy = "name" }
    }
  }

  if (!contact) {
    console.log(`Unmatched Calendly booking: ${name} (${email})`)
    await sb.from("webhook_unmatched").insert({
      event_type: "calendly_booking",
      lead_name: name,
      lead_linkedin_url: null,
      lead_company: null,
      lead_position: null,
      message_body: `Booked: ${eventName} at ${startTime}`,
      raw_payload: body
    })
    return json({ ok: true, matched: false, message: "Logged to unmatched" })
  }

  // If matched by name and the person had no email stored, backfill it so
  // future Calendly events match by email directly.
  if (matchedBy === "name" && email && !contact.email) {
    await sb.from("people").update({ email }).eq("id", contact.id)
  }

  // Advance the appropriate per-role state via the centralized function.
  // Fit call → CFO prospect; sponsor discovery → sponsor discovery.
  // Booking a call is an explicit, unambiguous forward signal, so advancing
  // here is consistent with the no-auto-promote-on-vague-intent rule.
  if (isFitCall && (contact.roles || []).includes("cfo")) {
    if (["pool", "audience"].includes(contact.cfo_state)) {
      await sb.rpc("set_role_state", { p_person_id: contact.id, p_role: "cfo", p_new_state: "prospect", p_set_by: "calendly_webhook" })
    }
    await sb.rpc("set_action_tag", { p_person_id: contact.id, p_action_type: "fit_call_scheduled", p_set_by: "calendly_webhook", p_notes: `${eventName} @ ${startTime}` })
  } else if (isSponsor && (contact.roles || []).includes("sponsor_contact")) {
    if (["pool", "audience"].includes(contact.sponsor_state)) {
      await sb.rpc("set_role_state", { p_person_id: contact.id, p_role: "sponsor_contact", p_new_state: "discovery", p_set_by: "calendly_webhook" })
    }
    await sb.rpc("set_action_tag", { p_person_id: contact.id, p_action_type: "sponsor_discovery_scheduled", p_set_by: "calendly_webhook", p_notes: `${eventName} @ ${startTime}` })
  }

  // Keep legacy contacts.pipeline_stage in sync for any migrated row (no-op for people-only)
  let newStage = null
  if (isFitCall) newStage = "Fit Call Scheduled"
  else if (isSponsor) newStage = "Discovery Sched."
  if (newStage) {
    await sb.from("contacts").update({ pipeline_stage: newStage, last_activity_date: new Date().toISOString() }).eq("id", contact.id)
  }
  await sb.from("people").update({ last_meaningful_touch: new Date().toISOString() }).eq("id", contact.id)

  // Log the booking — dual-write person_id + contact_id
  await sb.from("communications").insert({
    person_id: contact.id,
    contact_id: contact.id,
    direction: "IN",
    channel: "Calendly",
    body: `${eventName} booked for ${startTime ? new Date(startTime).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) : "TBD"}`,
    occurred_at: new Date().toISOString(),
    step_label: isFitCall ? "Fit Call Scheduled" : isSponsor ? "Sponsor Discovery Scheduled" : "Meeting Scheduled",
    source: "Calendly"
  })

  console.log(`${contact.full_name || contact.first_name} booking logged (matched by ${matchedBy})`)

  return json({
    ok: true,
    matched: true,
    matched_by: matchedBy,
    contact_id: contact.id,
    name: contact.full_name || `${contact.first_name} ${contact.last_name}`,
    event: eventName,
    scheduled_for: startTime
  })
}
