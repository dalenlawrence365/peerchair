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

  // Find contact by email
  let contact = null
  const { data: byEmail } = await sb.from("contacts")
    .select("id, first_name, last_name, contact_type, pipeline_stage")
    .eq("email", email)
    .maybeSingle()

  if (byEmail) {
    contact = byEmail
  } else {
    // Try name match
    const parts = name.trim().split(" ")
    const firstName = parts[0] || ""
    const lastName = parts.slice(1).join(" ") || ""
    if (firstName) {
      const { data: byName } = await sb.from("contacts")
        .select("id, first_name, last_name, contact_type, pipeline_stage")
        .ilike("first_name", firstName)
        .ilike("last_name", `%${lastName}%`)
        .maybeSingle()
      if (byName) contact = byName
    }
  }

  if (!contact) {
    // Log unmatched booking
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

  // Determine new stage
  let newStage = contact.pipeline_stage
  if (isFitCall) newStage = "Fit Call Scheduled"
  else if (isSponsor) newStage = "Discovery Sched."

  // Update contact stage and activity
  await sb.from("contacts").update({
    pipeline_stage: newStage,
    last_activity_date: new Date().toISOString()
  }).eq("id", contact.id)

  // Log the booking
  await sb.from("communications").insert({
    contact_id: contact.id,
    direction: "IN",
    channel: "Calendly",
    body: `${eventName} booked for ${startTime ? new Date(startTime).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) : "TBD"}`,
    occurred_at: new Date().toISOString(),
    step_label: isFitCall ? "Fit Call Scheduled" : isSponsor ? "Sponsor Discovery Scheduled" : "Meeting Scheduled",
    source: "Calendly"
  })

  console.log(`${contact.first_name} ${contact.last_name} moved to ${newStage}`)

  return json({
    ok: true,
    matched: true,
    contact_id: contact.id,
    name: `${contact.first_name} ${contact.last_name}`,
    new_stage: newStage,
    event: eventName,
    scheduled_for: startTime
  })
}
