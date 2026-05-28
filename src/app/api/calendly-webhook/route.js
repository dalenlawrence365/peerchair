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

  // Calendly's invitee.created payload puts invitee fields directly on payload
  // in newer versions, but older/variant shapes nest under payload.invitee.
  // Read defensively from both.
  const invitee = payload.invitee || payload || {}
  const event = payload.event || {}
  const email = (payload.email || invitee.email || "").toLowerCase()
  const name = payload.name || invitee.name || ""
  const startTime = payload.scheduled_event?.start_time || event.start_time || payload.event?.start_time || ""
  const eventName = payload.scheduled_event?.name || payload.event_type?.name || event.name || ""

  // Company now comes from the required custom question. Pull it out of the
  // questions_and_answers array (match any question mentioning "company").
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
    // Fall back to name match. With company now required on the booking form,
    // use it to disambiguate / rescue name mismatches.
    const parts = name.trim().split(" ")
    const firstName = parts[0] || ""
    const lastName = parts.slice(1).join(" ") || ""
    if (firstName) {
      const { data: nameMatches } = await sb.from("people")
        .select("id, first_name, last_name, full_name, company, roles, cfo_state, sponsor_state, email")
        .ilike("first_name", firstName)
        .ilike("last_name", `%${lastName}%`)
        .limit(5)
      if (nameMatches && nameMatches.length === 1) {
        contact = nameMatches[0]; matchedBy = "name"
      } else if (nameMatches && nameMatches.length > 1) {
        // Disambiguate by company
        const byCompany = company
          ? nameMatches.find(m => (m.company || "").toLowerCase() === company.toLowerCase())
          : null
        if (byCompany) { contact = byCompany; matchedBy = "name+company" }
      }
    }
    // Last resort: company-only exact match when name failed entirely (e.g. name
    // typed very differently). Only accept if it resolves to exactly one person.
    if (!contact && company) {
      const { data: coMatches } = await sb.from("people")
        .select("id, first_name, last_name, full_name, company, roles, cfo_state, sponsor_state, email")
        .ilike("company", company)
        .limit(3)
      if (coMatches && coMatches.length === 1) { contact = coMatches[0]; matchedBy = "company" }
    }
  }

  // OPTION C: no existing record → auto-create from the booking, infer role
  // from the event type, but flag needs_role_review so Dalen can confirm.
  if (!contact) {
    const parts = name.trim().split(" ")
    const firstName = parts[0] || ""
    const lastName = parts.slice(1).join(" ") || ""

    const role = isSponsor ? "sponsor_contact" : "cfo"   // fit-chat / default → cfo
    const stateField = isSponsor ? "sponsor_state" : "cfo_state"
    const stateValue = isSponsor ? "discovery" : "prospect"

    const insertRow = {
      first_name: firstName || null,
      last_name: lastName || null,
      full_name: name || null,
      email: email || null,
      company: company || null,
      roles: [role],
      [stateField]: stateValue,
      source: "calendly-inbound-unmatched",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    const { data: created, error: cErr } = await sb.from("people").insert(insertRow).select("id, full_name, roles, cfo_state, sponsor_state").single()
    if (cErr) {
      // If create fails, fall back to the old unmatched log so nothing is lost
      await sb.from("webhook_unmatched").insert({
        event_type: "calendly_booking",
        lead_name: name, lead_company: company || null,
        message_body: `Booked: ${eventName} at ${startTime} (auto-create failed: ${cErr.message})`,
        raw_payload: body
      })
      return json({ ok: true, matched: false, created: false, error: cErr.message })
    }

    contact = created
    matchedBy = "auto-created"

    // Flag for review (role is a guess) + likely not LinkedIn-connected (came from
    // outside the outreach funnel — shared link, etc.)
    await sb.rpc("set_status_tag", { p_person_id: created.id, p_tag: "needs_role_review", p_set_by: "calendly_webhook" })
    await sb.rpc("set_status_tag", { p_person_id: created.id, p_tag: "not_on_linkedin", p_set_by: "calendly_webhook" })

    // Action tag + communication + return handled by the shared block below
    const tagType = isSponsor ? "sponsor_discovery_scheduled" : "fit_call_scheduled"
    await sb.rpc("set_action_tag", { p_person_id: created.id, p_action_type: tagType, p_set_by: "calendly_webhook", p_notes: `${eventName} @ ${startTime} (auto-created from booking)` })
    await sb.from("communications").insert({
      person_id: created.id, contact_id: created.id,
      direction: "IN", channel: "Calendly",
      body: `${eventName} booked for ${startTime ? new Date(startTime).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) : "TBD"}. Auto-created from booking (company: ${company || "—"}). Role guessed as ${role} — confirm.`,
      occurred_at: new Date().toISOString(),
      step_label: isSponsor ? "Sponsor Discovery Scheduled" : "Fit Call Scheduled",
      source: "Calendly"
    })

    return json({
      ok: true, matched: false, created: true,
      contact_id: created.id, name: created.full_name,
      inferred_role: role, inferred_state: stateValue,
      note: "Auto-created and flagged needs_role_review"
    })
  }

  // Backfill from the booking onto the matched record so future events match
  // directly and the profile is more complete. Calendly is often the first
  // place we get a CFO's email (they come from LinkedIn name-first).
  if (matchedBy && matchedBy !== "email") {
    const patch = {}
    if (email && !contact.email) patch.email = email
    if (company && !contact.company) patch.company = company
    if (Object.keys(patch).length > 0) {
      await sb.from("people").update(patch).eq("id", contact.id)
    }
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
