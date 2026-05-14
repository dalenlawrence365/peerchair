export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  })
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
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

  const eventType = body.event_type || "unknown"
  const lead = body.lead || {}
  const sender = body.sender || {}
  const recentMessages = body.recent_messages || []

  console.log(`HeyReach webhook: ${eventType} — ${lead.full_name || "unknown"} (${lead.profile_url || "no url"})`)

  try {
    if (eventType === "connection_request_accepted") {
      await handleConnection(sb, lead, body)
    } else if (eventType === "message_reply_received" || eventType === "inmail_reply_received") {
      await handleReply(sb, lead, recentMessages, eventType, body)
    } else if (eventType === "message_sent") {
      await handleMessageSent(sb, lead, recentMessages, body)
    } else {
      console.log(`Unhandled event type: ${eventType}`)
    }
    return json({ ok: true, event: eventType })
  } catch(e) {
    console.error(`Webhook handler error: ${e.message}`)
    return json({ error: e.message }, 500)
  }
}

async function findContact(sb, lead) {
  const profileUrl = (lead.profile_url || "").replace(/\/$/, "")
  if (!profileUrl) return null

  // Try exact URL match first
  const { data: byUrl } = await sb.from("contacts")
    .select("id, first_name, last_name, pipeline_stage")
    .eq("linkedin_url", profileUrl)
    .maybeSingle()
  if (byUrl) return byUrl

  // Try name match
  const firstName = (lead.first_name || "").trim()
  const lastName = (lead.last_name || "").trim()
  if (!firstName) return null

  const { data: byName } = await sb.from("contacts")
    .select("id, first_name, last_name, pipeline_stage")
    .ilike("first_name", firstName)
    .ilike("last_name", `%${lastName}%`)
    .maybeSingle()
  return byName || null
}

async function logUnmatched(sb, eventType, lead, messageBody, rawPayload) {
  const replyText = (lead.first_name || "") + " " + (lead.last_name || "") + " — no match in PeerChair"
  console.log(`Unmatched: ${replyText}`)
  await sb.from("webhook_unmatched").insert({
    event_type: eventType,
    lead_name: lead.full_name || `${lead.first_name} ${lead.last_name}`,
    lead_linkedin_url: lead.profile_url || null,
    lead_company: lead.company_name || null,
    lead_position: lead.position || null,
    message_body: messageBody || null,
    raw_payload: rawPayload
  })
}

async function handleConnection(sb, lead, rawPayload) {
  const profileUrl = (lead.profile_url || "").replace(/\/$/, "")

  // Check if already exists
  const { data: existing } = await sb.from("contacts")
    .select("id").eq("linkedin_url", profileUrl).maybeSingle()

  let contactId
  if (existing) {
    contactId = existing.id
    await sb.from("contacts").update({
      pipeline_stage: "Connected",
      last_activity_date: new Date().toISOString()
    }).eq("id", contactId)
  } else {
    // Create new contact
    const { data: newContact, error } = await sb.from("contacts").insert({
      first_name: lead.first_name || "",
      last_name: lead.last_name || "",
      company_name: lead.company_name || null,
      title: lead.position || null,
      linkedin_url: profileUrl || null,
      contact_type: "CFO_PROSPECT",
      lead_source: "LinkedIn / HeyReach",
      pipeline_stage: "Connected",
      last_activity_date: new Date().toISOString()
    }).select("id").single()

    if (error) { console.error("Contact insert error:", error.message); return }
    contactId = newContact.id
  }

  // Log the connection event
  await sb.from("communications").insert({
    contact_id: contactId,
    direction: "IN",
    channel: "LinkedIn",
    body: "Connection request accepted.",
    occurred_at: body?.timestamp || new Date().toISOString(),
    step_label: "Connection Accepted",
    source: "HeyReach"
  })

  console.log(`Connection logged: ${lead.full_name} — contact ${contactId}`)
}

async function handleReply(sb, lead, recentMessages, eventType, rawPayload) {
  const contact = await findContact(sb, lead)

  // Find the reply message (is_reply: true)
  const replyMsg = recentMessages.filter(m => m.is_reply).pop()
  const messageBody = replyMsg?.message || recentMessages[recentMessages.length - 1]?.message || ""
  const occurredAt = replyMsg?.creation_time || new Date().toISOString()

  if (!contact) {
    await logUnmatched(sb, eventType, lead, messageBody, rawPayload)
    return
  }

  // Check for duplicate
  const { data: existing } = await sb.from("communications")
    .select("id")
    .eq("contact_id", contact.id)
    .eq("direction", "IN")
    .eq("channel", "LinkedIn")
    .ilike("body", `%${messageBody.slice(0, 50)}%`)
    .maybeSingle()

  if (existing) {
    console.log(`Duplicate reply skipped for ${lead.full_name}`)
    return
  }

  await sb.from("communications").insert({
    contact_id: contact.id,
    direction: "IN",
    channel: "LinkedIn",
    body: messageBody,
    occurred_at: occurredAt,
    step_label: "Reply Received",
    source: "HeyReach"
  })

  // Update stage to Engaged if still at Connected
  if (contact.pipeline_stage === "Connected") {
    await sb.from("contacts").update({
      pipeline_stage: "Engaged",
      last_activity_date: new Date().toISOString()
    }).eq("id", contact.id)
  } else {
    await sb.from("contacts").update({
      last_activity_date: new Date().toISOString()
    }).eq("id", contact.id)
  }

  console.log(`Reply logged for ${lead.full_name}`)
}

async function handleMessageSent(sb, lead, recentMessages, rawPayload) {
  const contact = await findContact(sb, lead)
  const lastMsg = recentMessages.filter(m => !m.is_reply).pop()
  const messageBody = lastMsg?.message || ""
  const occurredAt = lastMsg?.creation_time || new Date().toISOString()

  if (!contact) {
    await logUnmatched(sb, "message_sent", lead, messageBody, rawPayload)
    return
  }

  // Check for duplicate
  const { data: existing } = await sb.from("communications")
    .select("id")
    .eq("contact_id", contact.id)
    .eq("direction", "OUT")
    .ilike("body", `%${messageBody.slice(0, 50)}%`)
    .maybeSingle()

  if (existing) return

  await sb.from("communications").insert({
    contact_id: contact.id,
    direction: "OUT",
    channel: "LinkedIn",
    body: messageBody,
    occurred_at: occurredAt,
    step_label: "Outreach Sent",
    source: "HeyReach"
  })

  console.log(`Outbound message logged for ${lead.full_name}`)
}
