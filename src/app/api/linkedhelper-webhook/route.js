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

// LinkedHelper sends payloads with inconsistent key casing depending on context.
// pick() tries multiple aliases and returns the first non-empty string value.
function pick(obj, keys) {
  if (!obj) return ""
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim()
  }
  return ""
}

function normalizeProfileUrl(u) {
  if (!u) return ""
  return u.trim().replace(/\/$/, "").replace(/^https:\/\/linkedin\.com/, "https://www.linkedin.com")
}

// Extract the lead snapshot from common LinkedHelper field aliases
function extractLead(payload) {
  return {
    profileUrl: normalizeProfileUrl(pick(payload, ["Profile URL", "profileUrl", "profileLink", "Profile link", "profile_url"])),
    firstName: pick(payload, ["First Name", "firstName", "first_name"]),
    lastName: pick(payload, ["Last Name", "lastName", "last_name"]),
    fullName: pick(payload, ["Full Name", "fullName", "Name", "full_name"]),
    company: pick(payload, ["Company name", "Company Name", "companyName", "Current company", "company", "Company"]),
    position: pick(payload, ["Position", "Current position", "position", "Title", "Job Title"]),
    location: pick(payload, ["Location", "location"]),
    email: pick(payload, ["Email", "email", "Email Address", "emailAddress"]),
    campaign: pick(payload, ["Campaign name", "Campaign", "campaignName", "campaign"]),
    // Tags may arrive as array, comma-separated string, or single string
    tagsRaw: payload.Tags || payload.tags || payload.tag || null,
    // For reply events
    lastReply: pick(payload, ["Last reply", "lastReply", "Last message body", "last_reply", "Reply", "reply"]),
    lastMessage: pick(payload, ["Last message", "lastMessage", "last_message"]),
    messagingHistory: payload["Messaging history"] || payload.messagingHistory || payload.messaging_history || null
  }
}

function tagsToArray(tagsRaw) {
  if (!tagsRaw) return []
  if (Array.isArray(tagsRaw)) return tagsRaw.map(t => String(t).trim()).filter(Boolean)
  return String(tagsRaw).split(/[,;|]/).map(t => t.trim()).filter(Boolean)
}

// Find the seed batch tag (matches pattern "seed-YYYYMMDD-bN")
function findSeedBatchTag(tags) {
  for (const t of tags) {
    if (/^seed-\d{8}-b\d+$/i.test(t)) return t.toLowerCase()
  }
  return null
}

export async function POST(request) {
  const url = new URL(request.url)
  const event = (url.searchParams.get("event") || "").toLowerCase()
  const secret = url.searchParams.get("secret") || ""
  const expectedSecret = process.env.LINKEDHELPER_WEBHOOK_SECRET || ""

  if (!expectedSecret || secret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401)
  }
  if (!["sent", "connected", "replied"].includes(event)) {
    return json({ error: "Invalid event. Use ?event=sent|connected|replied" }, 400)
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  let payload
  try { payload = await request.json() } catch(e) {
    return json({ error: "Invalid JSON" }, 400)
  }

  // LinkedHelper can wrap data in {data:{...}} or send fields at the root; try both
  const root = (payload && typeof payload === "object" && payload.data && typeof payload.data === "object") ? payload.data : payload
  const lead = extractLead(root)
  const tags = tagsToArray(lead.tagsRaw)
  const seedBatchTag = findSeedBatchTag(tags)

  console.log(`LinkedHelper webhook [${event}]: ${lead.fullName || (lead.firstName + " " + lead.lastName)} | ${lead.profileUrl} | tags=${tags.join(",")}`)
  // Diagnostic: log full payload keys + their values (truncated) so we can see what LH is sending
  try {
    const keysDump = Object.entries(root).map(([k,v]) => `${k}=${String(v).slice(0,40).replace(/\n/g," ")}`).join(" || ")
    console.log(`LH-RAW-KEYS [${event}]: ${keysDump.slice(0, 2500)}`)
  } catch(e) {}

  try {
    if (event === "sent") {
      await handleSent(sb, lead, tags, seedBatchTag, payload)
    } else if (event === "connected") {
      await handleConnected(sb, lead, tags, seedBatchTag, payload)
    } else if (event === "replied") {
      await handleReplied(sb, lead, tags, seedBatchTag, payload)
    }
    return json({ ok: true, event, lead: { name: lead.fullName, url: lead.profileUrl }, seed_batch: seedBatchTag })
  } catch(e) {
    console.error(`LinkedHelper handler error [${event}]: ${e.message}`)
    return json({ error: e.message }, 500)
  }
}

async function findOrCreateContact(sb, lead, seedBatchTag, eventLabel) {
  if (!lead.profileUrl && !lead.firstName) return null

  // Find existing by URL
  if (lead.profileUrl) {
    const { data: existing } = await sb.from("contacts")
      .select("id, first_name, last_name, pipeline_stage, contact_type")
      .eq("linkedin_url", lead.profileUrl)
      .maybeSingle()
    if (existing) return existing
  }

  // Find by name as fallback (less reliable but useful when URL formatting drifts)
  if (lead.firstName && lead.lastName) {
    const { data: byName } = await sb.from("contacts")
      .select("id, first_name, last_name, pipeline_stage, contact_type")
      .ilike("first_name", lead.firstName)
      .ilike("last_name", lead.lastName)
      .maybeSingle()
    if (byName) return byName
  }

  // Create new
  const { data: newContact, error } = await sb.from("contacts").insert({
    first_name: lead.firstName || (lead.fullName.split(" ")[0] || ""),
    last_name: lead.lastName || lead.fullName.split(" ").slice(1).join(" ") || "",
    company_name: lead.company || null,
    title: lead.position || null,
    linkedin_url: lead.profileUrl || null,
    email: lead.email || null,
    linkedin_location: lead.location || null,
    contact_type: "CFO_PROSPECT",
    lead_source: "LinkedIn / LinkedHelper",
    pipeline_stage: eventLabel,
    last_activity_date: new Date().toISOString()
  }).select("id, pipeline_stage").single()

  if (error) {
    console.error("Contact insert error:", error.message)
    return null
  }

  // Mark pool record as touched (if we can match by linkedin_url)
  if (lead.profileUrl) {
    try {
      await sb.from("pool").update({
        updated_at: new Date().toISOString()
      }).eq("linkedin_url", lead.profileUrl)
    } catch(e) { /* pool update best-effort */ }
  }

  return newContact
}

async function logUnmatched(sb, eventType, lead, messageBody, rawPayload) {
  await sb.from("webhook_unmatched").insert({
    event_type: "linkedhelper_" + eventType,
    lead_name: lead.fullName || `${lead.firstName} ${lead.lastName}`.trim(),
    lead_linkedin_url: lead.profileUrl || null,
    lead_company: lead.company || null,
    lead_position: lead.position || null,
    message_body: messageBody || null,
    raw_payload: rawPayload
  })
}

async function handleSent(sb, lead, tags, seedBatchTag, raw) {
  const contact = await findOrCreateContact(sb, lead, seedBatchTag, "Requested")
  if (!contact) {
    await logUnmatched(sb, "sent", lead, null, raw)
    return
  }

  // Move to Requested only if currently at Target or empty stage
  if (!contact.pipeline_stage || contact.pipeline_stage === "Target") {
    await sb.from("contacts").update({
      pipeline_stage: "Requested",
      last_activity_date: new Date().toISOString()
    }).eq("id", contact.id)
  } else {
    await sb.from("contacts").update({
      last_activity_date: new Date().toISOString()
    }).eq("id", contact.id)
  }

  // Log the outbound connection request
  await sb.from("communications").insert({
    contact_id: contact.id,
    direction: "OUT",
    channel: "LinkedIn",
    body: "Connection request sent" + (seedBatchTag ? ` (${seedBatchTag})` : ""),
    occurred_at: new Date().toISOString(),
    step_label: "Connection Request Sent",
    source: "LinkedHelper"
  })
}

async function handleConnected(sb, lead, tags, seedBatchTag, raw) {
  const contact = await findOrCreateContact(sb, lead, seedBatchTag, "Connected")
  if (!contact) {
    await logUnmatched(sb, "connected", lead, null, raw)
    return
  }

  // Always advance to Connected on accept (unless already past)
  const advancedStages = ["Engaged","Fit Invite Sent","Fit Call Scheduled","Fit Call Completed","Strong Fit","Possible Fit","Active Member","Event Waitlist","Event Invited","Event Confirmed","Event Attended","Membership Conversation Scheduled","Membership Conversation Completed","Verbal Commitment"]
  const stayPut = advancedStages.indexOf(contact.pipeline_stage) > -1

  await sb.from("contacts").update({
    pipeline_stage: stayPut ? contact.pipeline_stage : "Connected",
    linkedin_connected_date: new Date().toISOString(),
    last_activity_date: new Date().toISOString()
  }).eq("id", contact.id)

  await sb.from("communications").insert({
    contact_id: contact.id,
    direction: "IN",
    channel: "LinkedIn",
    body: "Connection accepted" + (seedBatchTag ? ` (${seedBatchTag})` : ""),
    occurred_at: new Date().toISOString(),
    step_label: "Connection Accepted",
    source: "LinkedHelper"
  })
}

async function handleReplied(sb, lead, tags, seedBatchTag, raw) {
  const replyText = lead.lastReply || lead.lastMessage || ""
  const contact = await findOrCreateContact(sb, lead, seedBatchTag, "Engaged")
  if (!contact) {
    await logUnmatched(sb, "replied", lead, replyText, raw)
    return
  }

  // Dedupe: don't insert if a matching reply already exists in last 7 days
  if (replyText) {
    const cutoff = new Date(Date.now() - 7*24*60*60*1000).toISOString()
    const { data: existing } = await sb.from("communications")
      .select("id")
      .eq("contact_id", contact.id)
      .eq("direction", "IN")
      .eq("channel", "LinkedIn")
      .ilike("body", `%${replyText.slice(0, 60).replace(/[%_]/g, "")}%`)
      .gte("occurred_at", cutoff)
      .maybeSingle()
    if (existing) {
      console.log(`Duplicate reply skipped for ${lead.fullName}`)
      return
    }
  }

  // Advance to Engaged if at Connected or earlier
  const preEngagedStages = ["", "Target", "Requested", "Connected"]
  const shouldAdvance = preEngagedStages.indexOf(contact.pipeline_stage || "") > -1

  await sb.from("contacts").update({
    pipeline_stage: shouldAdvance ? "Engaged" : contact.pipeline_stage,
    last_activity_date: new Date().toISOString()
  }).eq("id", contact.id)

  await sb.from("communications").insert({
    contact_id: contact.id,
    direction: "IN",
    channel: "LinkedIn",
    body: replyText || "(LinkedHelper reported a reply but no body was included)",
    occurred_at: new Date().toISOString(),
    step_label: "Reply Received",
    source: "LinkedHelper"
  })
}
