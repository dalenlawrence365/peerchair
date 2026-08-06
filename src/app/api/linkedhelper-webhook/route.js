export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"
import { normalizeLinkedInUrl } from "@/lib/csv"

// Campaign-name whitelist: events with ?campaign=<one of these> route to the
// linkedin_connections table instead of the people table. Add new names here
// as you create more linkedin_connections-targeting campaigns. Names are
// lowercased for matching.
const LINKEDIN_CONNECTIONS_CAMPAIGNS = new Set([
  "provisors-network",
])

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

// Extract the lead snapshot from common LinkedHelper field aliases.
// 2026-05-28: corrected per LinkedHelper's official webhook payload docs —
// we were never reading the right field names for replies, hence every
// reply came in as "(no body included)". The correct primary fields are:
//   replied_message_1_text     — the reply that triggered the webhook
//   last_sent_message_text     — most recent message FROM the profile (incoming)
//   full_messaging_history     — entire conversation history with timestamps
//   campaign_messaging_history — conversation history within the campaign
//   is_last_message_incoming   — boolean, who sent the last message
//   has_unread_messages        — boolean, unread in LinkedHelper inbox
function extractLead(payload) {
  return {
    profileUrl: normalizeProfileUrl(pick(payload, ["Profile URL", "profileUrl", "profileLink", "Profile link", "profile_url"])),
    firstName: pick(payload, ["First Name", "firstName", "first_name"]),
    lastName: pick(payload, ["Last Name", "lastName", "last_name"]),
    fullName: pick(payload, ["Full Name", "fullName", "Name", "full_name"]),
    company: pick(payload, ["Company name", "Company Name", "companyName", "Current company", "current_company", "company", "Company"]),
    position: pick(payload, ["Position", "Current position", "current_company_position", "position", "Title", "Job Title"]),
    location: pick(payload, ["Location", "location", "location_name"]),
    email: pick(payload, ["Email", "email", "Email Address", "emailAddress"]),
    avatar: pick(payload, ["avatar", "avatar_url", "Avatar", "photo", "profile_picture"]),
    headline: pick(payload, ["headline", "Headline", "current_headline", "linkedin_headline"]),
    summary: pick(payload, ["summary", "Summary", "about", "About", "profile_summary"]),
    campaign: pick(payload, ["Campaign name", "Campaign", "campaignName", "campaign", "campaign_name"]),
    tagsRaw: payload.Tags || payload.tags || payload.tag || null,
    // REPLY TEXT — preferred order: the triggering reply, then last incoming, then old/legacy aliases
    lastReply: pick(payload, [
      "replied_message_1_text", "repliedMessageText",
      "last_sent_message_text", "lastSentMessageText",
      "Last reply", "lastReply", "Last message body", "last_reply", "Reply", "reply"
    ]),
    repliedMessageFrom: pick(payload, ["replied_message_1_from", "repliedMessageFrom"]),
    repliedMessageSendAtIso: pick(payload, ["replied_message_1_send_at_iso", "repliedMessageSendAtIso"]),
    repliedMessageSendAt: pick(payload, ["replied_message_1_send_at", "repliedMessageSendAt"]),
    // FULL CONVERSATION HISTORY — full preferred, campaign-scoped as fallback
    threadHistory: pick(payload, ["full_messaging_history", "fullMessagingHistory", "campaign_messaging_history", "campaignMessagingHistory"]),
    // INBOX SIGNALS — for the future "replies to review" queue
    isLastMessageIncoming: parseBool(payload.is_last_message_incoming ?? payload.isLastMessageIncoming),
    hasUnreadMessages: parseBool(payload.has_unread_messages ?? payload.hasUnreadMessages),
    // Legacy alias kept for older callers
    lastMessage: pick(payload, ["Last message", "lastMessage", "last_message"]),
    messagingHistory: payload["Messaging history"] || payload.messagingHistory || payload.messaging_history || null
  }
}

// LinkedHelper sends booleans as actual booleans OR as strings "true"/"false"
function parseBool(v) {
  if (v === true || v === false) return v
  if (typeof v === "string") {
    const s = v.trim().toLowerCase()
    if (s === "true") return true
    if (s === "false") return false
  }
  return null
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
  if (!["sent", "connected", "replied", "company"].includes(event)) {
    return json({ error: "Invalid event. Use ?event=sent|connected|replied" }, 400)
  }

  const sb = serverClient()

  let payload
  try { payload = await request.json() } catch(e) {
    return json({ error: "Invalid JSON" }, 400)
  }

  // LinkedHelper can wrap data in {data:{...}} or send fields at the root; try both
  const root = (payload && typeof payload === "object" && payload.data && typeof payload.data === "object") ? payload.data : payload

  // Company-scrape capture — a different payload shape than the person events.
  // Land it RAW for schema discovery (capture-first), then stop: no person
  // resolution, no pipeline logic. We model the schema once we see the shape.
  if (event === "company") {
    return await handleCompanyCapture(sb, root, request)
  }
  const lead = extractLead(root)
  const tags = tagsToArray(lead.tagsRaw)
  const seedBatchTag = findSeedBatchTag(tags)

  console.log(`LinkedHelper webhook [${event}]: ${lead.fullName || (lead.firstName + " " + lead.lastName)} | ${lead.profileUrl} | tags=${tags.join(",")}`)
  // Diagnostic: log full payload keys + their values (truncated) so we can see what LH is sending
  try {
    const keysDump = Object.entries(root).map(([k,v]) => `${k}=${String(v).slice(0,40).replace(/\n/g," ")}`).join(" || ")
    console.log(`LH-RAW-KEYS [${event}]: ${keysDump.slice(0, 2500)}`)
  } catch(e) {}

  // Persistent raw-payload audit — written to audit_log every event so we can
  // verify field names, debug regressions, and reconstruct events without
  // relying on Vercel log retention.
  try {
    let rawJson = ""
    try { rawJson = JSON.stringify(root) } catch(e) { rawJson = "(non-serializable payload)" }
    await sb.from("audit_log").insert({
      run_at: new Date().toISOString(),
      audit_type: `linkedhelper_${event}`,
      summary: `lead=${lead.fullName || "?"} url=${lead.profileUrl || "?"} | raw=${rawJson.slice(0, 8000)}`,
      errors: []
    })
  } catch(e) { console.error("audit_log write failed:", e.message) }

  try {
    // Campaign-based routing: certain campaigns target linkedin_connections
    // instead of people. Everything else falls through to the people-table path.
    const campaignParam = (url.searchParams.get("campaign") || "").toLowerCase().trim()
    if (campaignParam && LINKEDIN_CONNECTIONS_CAMPAIGNS.has(campaignParam)) {
      await handleLinkedInConnectionsEvent({ sb, event, campaign: campaignParam, lead, tags, payload: root })
      return json({
        ok: true, event, target: "linkedin_connections", campaign: campaignParam,
        lead: { name: lead.fullName, url: lead.profileUrl }
      })
    }

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

// Resolve the lead to a row in the unified people table. people is the sole CRM
// entity table — there is no contacts/pool lookup any more. Match by LinkedIn
// URL (www / non-www variants), then by name, and create a people row directly
// for a genuinely net-new lead. Always returns { id, _peopleOnly:true } or null.
async function findOrCreatePerson(sb, lead, eventLabel) {
  if (!lead.profileUrl && !lead.firstName) return null

  if (lead.profileUrl) {
    const urlVariants = Array.from(new Set([
      lead.profileUrl,
      lead.profileUrl.replace("https://www.linkedin.com", "https://linkedin.com"),
      lead.profileUrl.replace("https://linkedin.com", "https://www.linkedin.com"),
    ]))
    const { data: byUrl } = await sb.from("people")
      .select("id, cfo_state")
      .in("linkedin_url", urlVariants)
      .limit(1)
    if (byUrl && byUrl.length) {
      return { id: byUrl[0].id, pipeline_stage: byUrl[0].cfo_state || null, _alreadyExisted: true, _peopleOnly: true }
    }
  }

  if (lead.firstName && lead.lastName) {
    const { data: byName } = await sb.from("people")
      .select("id, cfo_state")
      .ilike("full_name", `${lead.firstName}%${lead.lastName}`)
      .limit(1)
    if (byName && byName.length) {
      return { id: byName[0].id, pipeline_stage: byName[0].cfo_state || null, _alreadyExisted: true, _peopleOnly: true }
    }
  }

  // Net-new lead → create the people row directly.
  const fullName = lead.fullName || `${lead.firstName || ""} ${lead.lastName || ""}`.trim()
  const insertRow = {
    full_name: fullName || lead.profileUrl || "Unknown",
    linkedin_url: lead.profileUrl || null,
    title: lead.position || null,
    company: lead.company || null,
    roles: ["cfo"],
    source: "LinkedIn / LinkedHelper",
    cfo_state: "pool",
    linkedin_connected: false,
  }
  if (lead.avatar) insertRow.avatar_url = lead.avatar
  const { data: created, error } = await sb.from("people").insert(insertRow).select("id, cfo_state").single()
  if (error) {
    console.error("People insert error:", error.message)
    return null
  }
  return { id: created.id, pipeline_stage: created.cfo_state || null, _alreadyExisted: false, _peopleOnly: true }
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

// Persist people-only enrichment (About / headline) from the LinkedHelper
// payload. We key by the person id returned from findOrCreatePerson. About is
// overwritten when present (LinkedHelper is the
// freshest source); headline only fills a gap so we never clobber the curated
// CSV headlines.
async function enrichPersonFromLead(sb, personId, lead) {
  if (!personId) return
  try {
    if (lead.summary) {
      await sb.from("people").update({ about: lead.summary }).eq("id", personId)
    }
    if (lead.headline) {
      // Overwrite headline whenever LinkedHelper sends a fresh one — a new campaign
      // that re-collects headlines will refresh existing values (incl. curated CSV ones).
      await sb.from("people").update({ headline: lead.headline }).eq("id", personId)
    }
  } catch(e) { console.error("people enrich (about/headline) failed:", e.message) }
}

async function handleSent(sb, lead, tags, seedBatchTag, raw) {
  const contact = await findOrCreatePerson(sb, lead, "Requested")
  if (!contact) {
    await logUnmatched(sb, "sent", lead, null, raw)
    return
  }
  await enrichPersonFromLead(sb, contact.id, lead)

  // Log the outbound connection request, keyed by person_id.
  await sb.from("communications").insert({
    person_id: contact.id,
    direction: "OUT",
    channel: "LinkedIn",
    body: "Connection request sent" + (seedBatchTag ? ` (${seedBatchTag})` : ""),
    occurred_at: new Date().toISOString(),
    step_label: "Connection Request Sent",
    source: "LinkedHelper"
  })

  // Tag the person as connection_sent so cooldown / hygiene logic can find them.
  // cfo_state stays at 'pool' (invite sent is NOT in-network — they have to accept first).
  await sb.rpc("set_action_tag", {
    p_person_id: contact.id,
    p_action_type: "connection_sent",
    p_set_by: "linkedhelper_webhook"
  })

}

async function handleConnected(sb, lead, tags, seedBatchTag, raw) {
  const contact = await findOrCreatePerson(sb, lead, "Connected")
  if (!contact) {
    await logUnmatched(sb, "connected", lead, null, raw)
    return
  }
  await enrichPersonFromLead(sb, contact.id, lead)

  // Mark connected on the people row and tag the acceptance.
  await sb.from("people").update({ linkedin_connected: true, last_meaningful_touch: new Date().toISOString() }).eq("id", contact.id)
  await sb.rpc("set_action_tag", { p_person_id: contact.id, p_action_type: "connection_accepted", p_set_by: "linkedhelper_webhook" })

  await sb.from("communications").insert({
    person_id: contact.id,
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
  const contact = await findOrCreatePerson(sb, lead, "Connected")
  if (!contact) {
    await logUnmatched(sb, "replied", lead, replyText, raw)
    return
  }
  await enrichPersonFromLead(sb, contact.id, lead)

  // Dedupe: don't insert if a matching reply already exists in last 7 days
  if (replyText) {
    const cutoff = new Date(Date.now() - 7*24*60*60*1000).toISOString()
    const { data: existing } = await sb.from("communications")
      .select("id")
      .eq("person_id", contact.id)
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

  // 2026-05-28: capture LinkedIn thread snapshot + inbox signals on the people row.
  // LinkedHelper now sends full_messaging_history (entire thread w/ timestamps),
  // is_last_message_incoming, and has_unread_messages — store them for fast lookup
  // and to drive the future inbox/replies-to-review queue without scraping LinkedIn.
  const peoplePatch = { last_meaningful_touch: new Date().toISOString() }
  if (lead.threadHistory) {
    peoplePatch.linkedin_thread_snapshot = lead.threadHistory
    peoplePatch.linkedin_thread_updated_at = new Date().toISOString()
  }
  if (lead.isLastMessageIncoming !== null) peoplePatch.linkedin_last_message_incoming = lead.isLastMessageIncoming
  if (lead.hasUnreadMessages !== null)    peoplePatch.linkedin_has_unread = lead.hasUnreadMessages
  await sb.from("people").update(peoplePatch).eq("id", contact.id)

  // Log the reply communication, keyed by person_id.
  await sb.from("communications").insert({
    person_id: contact.id,
    direction: "IN",
    channel: "LinkedIn",
    body: replyText || "(LinkedHelper reported a reply but no body was included)",
    occurred_at: lead.repliedMessageSendAtIso || new Date().toISOString(),
    step_label: "Reply Received",
    source: "LinkedHelper"
  })

  // Tag the person as reply_received — drives the "replies to review" queue
  // without changing their funnel position.
  await sb.rpc("set_action_tag", {
    p_person_id: contact.id,
    p_action_type: "reply_received",
    p_set_by: "linkedhelper_webhook",
    p_notes: replyText ? replyText.slice(0, 200) : null
  })

}

// ============================================================================
// linkedin_connections branch
// ============================================================================
//
// Webhook events with ?campaign=<name> where name is in LINKEDIN_CONNECTIONS_CAMPAIGNS
// route here instead of the people-table handlers above. The model is much
// simpler than the CFO pipeline: track the LinkedIn graph state (sent →
// connected → optionally-replied), tag the connection with the campaign source,
// optionally cross-reference an existing people row by linkedin_url, and stop.
// No communications timeline, no pipeline state, no follow-up queue.

async function handleLinkedInConnectionsEvent({ sb, event, campaign, lead, tags, payload }) {
  const normalizedUrl = normalizeLinkedInUrl(lead.profileUrl)
  if (!normalizedUrl) {
    console.warn(`LH→linkedin_connections [${event}]: no profile URL on payload, skipping`)
    return
  }

  // Source label: strip a "-network" suffix so the value stored is the clean
  // cohort name (e.g. "provisors-network" → "provisors").
  const sourceLabel = campaign.replace(/-network$/, "") || campaign
  const campaignTag = sourceLabel
  const mergedIncomingTags = Array.from(new Set([campaignTag, ...((tags || []).map(String))]))

  // Cross-reference into people by linkedin_url. People rows may store either
  // the linkedin.com or www.linkedin.com form, so check both.
  let peopleId = null
  try {
    const variants = Array.from(new Set([
      normalizedUrl,
      normalizedUrl.replace("https://linkedin.com", "https://www.linkedin.com"),
    ]))
    const { data: matches } = await sb.from("people")
      .select("id")
      .in("linkedin_url", variants)
      .limit(1)
    if (matches && matches.length > 0) peopleId = matches[0].id
  } catch (e) { /* nonfatal; cross-ref is best-effort */ }

  // When the connections audit fires and we can match the person, write the
  // profile enrichment (About / headline) into their people row too — same as
  // the sent/connected/replied handlers. This is how the "am I connected to all
  // ProVisors" audit backfills About over time.
  if (peopleId && (lead.summary || lead.headline)) {
    await enrichPersonFromLead(sb, peopleId, lead)
  }

  // Status: 'sent' → pending_invite; 'connected'/'replied' → connected
  const statusByEvent = {
    sent: "pending_invite",
    connected: "connected",
    replied: "connected",
  }
  const newStatus = statusByEvent[event] || "connected"

  // Existing row?
  const { data: existing } = await sb.from("linkedin_connections")
    .select("id, tags, source, relevance, peerchair_person_id, connection_status, connected_at")
    .eq("linkedin_url", normalizedUrl)
    .maybeSingle()

  const now = new Date().toISOString()

  if (existing) {
    // Merge tags, preserve curated fields, only progress status forward.
    // Status progression: pending_invite → connected; never downgrade from
    // connected back to pending_invite if a stray 'sent' arrives late.
    const mergedTags = Array.from(new Set([...(existing.tags || []), ...mergedIncomingTags]))
    const shouldUpdateStatus = !(
      newStatus === "pending_invite" && existing.connection_status === "connected"
    )

    const update = {
      // LinkedIn-side facts: refresh from each event if non-empty
      full_name: lead.fullName || undefined,
      first_name: lead.firstName || undefined,
      last_name: lead.lastName || undefined,
      headline: lead.headline || undefined,
      current_company: lead.company || undefined,
      current_title: lead.position || undefined,
      location: lead.location || undefined,
      // Event tracking
      last_event_type: event,
      last_event_at: now,
      // Merge tags
      tags: mergedTags,
      // Source: only set if not already set (preserve any prior labeling)
      source: existing.source || sourceLabel,
      // Cross-reference: set only if not already linked
      peerchair_person_id: existing.peerchair_person_id || peopleId,
      // Connected timestamp: capture on the first connected/replied event
      connected_at: existing.connected_at ||
        ((event === "connected" || event === "replied") ? now : null),
      updated_at: now,
    }
    if (shouldUpdateStatus) update.connection_status = newStatus

    // Strip undefined so we don't blank fields with null
    for (const k of Object.keys(update)) if (update[k] === undefined) delete update[k]

    const { error } = await sb.from("linkedin_connections").update(update).eq("id", existing.id)
    if (error) throw new Error(`linkedin_connections update failed: ${error.message}`)
    console.log(`LH→linkedin_connections [${event}] UPDATE id=${existing.id} status=${update.connection_status || existing.connection_status} cross_ref=${peopleId ? "yes" : "no"}`)
  } else {
    const insert = {
      linkedin_url: normalizedUrl,
      full_name: lead.fullName || null,
      first_name: lead.firstName || null,
      last_name: lead.lastName || null,
      headline: lead.headline || null,
      current_company: lead.company || null,
      current_title: lead.position || null,
      location: lead.location || null,
      connection_status: newStatus,
      relevance: "network_visibility",
      heat: "cold",
      source: sourceLabel,
      tags: mergedIncomingTags,
      peerchair_person_id: peopleId,
      connected_at: (event === "connected" || event === "replied") ? now : null,
      last_event_type: event,
      last_event_at: now,
      last_seen_at: now,
    }
    const { data: inserted, error } = await sb.from("linkedin_connections")
      .insert(insert)
      .select("id")
      .single()
    if (error) throw new Error(`linkedin_connections insert failed: ${error.message}`)
    console.log(`LH→linkedin_connections [${event}] INSERT id=${inserted.id} cross_ref=${peopleId ? "yes" : "no"}`)
  }
}

// LinkedHelper often nests the scraped company object under a wrapper key.
function companyNode(raw) {
  if (!raw || typeof raw !== "object") return {}
  for (const k of ["company", "organization", "result", "data", "payload"]) {
    if (raw[k] && typeof raw[k] === "object") return raw[k]
  }
  return raw
}

// event=company handler: opportunistically extract common company fields (NOT
// authoritative — trust `raw`) and land the full payload in
// linkedhelper_company_captures. The existing audit_log raw dump above also
// keeps a copy keyed audit_type='linkedhelper_company'.
async function handleCompanyCapture(sb, root, request) {
  const c = companyNode(root)
  const hdrs = {}
  for (const h of ["content-type", "user-agent"]) {
    const v = request.headers.get(h); if (v) hdrs[h] = v
  }
  const row = {
    source: "linkedhelper",
    event_type: "company",
    content_type: request.headers.get("content-type") || null,
    headers: hdrs,
    raw: root,
    company_name: pick(c, ["name", "companyName", "company_name", "company", "organizationName", "title"]) || null,
    company_linkedin_url: pick(c, ["companyUrl", "company_url", "linkedinUrl", "linkedin_url", "profileUrl", "url", "publicUrl"]) || null,
    website: pick(c, ["website", "websiteUrl", "site", "domain", "companyWebsite"]) || null,
    industry: pick(c, ["industry", "industryName", "sector"]) || null,
    company_size: pick(c, ["companySize", "company_size", "size", "employeeCount", "staffCount", "employees", "employeeCountRange"]) || null,
    location: pick(c, ["location", "headquarters", "hq", "city", "addressLine", "geoRegion"]) || null,
  }
  const { data, error } = await sb.from("linkedhelper_company_captures").insert(row).select("id").single()
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, event: "company", id: data.id, captured_keys: Object.keys(root || {}), extracted: {
    company_name: row.company_name, company_linkedin_url: row.company_linkedin_url,
    website: row.website, industry: row.industry, company_size: row.company_size, location: row.location } })
}
