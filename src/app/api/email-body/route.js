export const dynamic = "force-dynamic"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { corsResponse, handleOptions } from "@/lib/cors"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"
import { getAccessToken } from "@/lib/microsoft-auth"

// Strip HTML and decode the most common entities, then collapse whitespace.
function htmlToText(html) {
  if (!html) return ""
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export async function OPTIONS() { return handleOptions() }

export async function GET(request) {
  if (!verifyGptActionKey(request)) {
    return corsResponse({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const messageId = searchParams.get("message_id")
  if (!messageId) {
    return corsResponse({ error: "message_id is required" }, { status: 400 })
  }

  const sb = serverClient()

  // 1) Try local cache first — fastest, already cleaned, and works for any
  //    message that has been synced into email_messages.
  const { data: cached } = await sb
    .from("email_messages")
    .select("id, person_id, message_id, direction, subject, body, body_preview, sent_at, from_address, to_address, thread_id, is_read")
    .eq("message_id", messageId)
    .maybeSingle()

  if (cached && cached.body && cached.body.length > 0) {
    // Optionally attach contact context
    let contact = null
    if (cached.person_id) {
      const { data: c } = await sb
        .from("people")
        .select("id, first_name, last_name, company, roles, cfo_state, sponsor_state, referral_state")
        .eq("id", cached.person_id)
        .maybeSingle()
      if (c) contact = c
    }
    return corsResponse({
      source: "cache",
      message_id: cached.message_id,
      subject: cached.subject,
      body: cached.body,
      body_preview: cached.body_preview,
      direction: cached.direction,
      from: cached.from_address,
      to: cached.to_address,
      sent_at: cached.sent_at,
      thread_id: cached.thread_id,
      is_read: cached.is_read,
      contact
    })
  }

  // 2) Fallback: pull live from Microsoft Graph. This covers messages from
  //    unknown senders (not yet in PeerChair) and anything the sync hasn't
  //    picked up yet.
  let accessToken
  try {
    accessToken = await getAccessToken()
  } catch (e) {
    return corsResponse({ error: e.message }, { status: 401 })
  }

  const graphUrl = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}?$select=id,subject,body,bodyPreview,from,toRecipients,receivedDateTime,sentDateTime,isRead,conversationId`
  const res = await fetch(graphUrl, { headers: { Authorization: "Bearer " + accessToken } })

  if (!res.ok) {
    const errText = await res.text()
    const status = res.status === 404 ? 404 : 500
    return corsResponse({ error: "Outlook fetch failed: " + errText }, { status })
  }

  const msg = await res.json()
  const bodyHtml = msg.body?.content || ""
  const bodyText = msg.body?.contentType === "text" ? bodyHtml : htmlToText(bodyHtml)

  return corsResponse({
    source: "graph",
    message_id: msg.id,
    subject: msg.subject || "",
    body: bodyText.slice(0, 10000),
    body_preview: msg.bodyPreview || "",
    direction: null,
    from: msg.from?.emailAddress?.address || null,
    from_name: msg.from?.emailAddress?.name || null,
    to: (msg.toRecipients || []).map(r => r.emailAddress?.address).filter(Boolean).join(", "),
    sent_at: msg.receivedDateTime || msg.sentDateTime,
    thread_id: msg.conversationId || null,
    is_read: msg.isRead ?? null,
    contact: null
  })
}
