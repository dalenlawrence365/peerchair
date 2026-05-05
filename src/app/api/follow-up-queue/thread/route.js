// GET /api/follow-up-queue/thread?conversationId=xxx&linkedInAccountId=185228&contactId=uuid
// Database is the source of truth.
// Reads from conversation_messages + communications merged.
// Falls back to HeyReach ONLY if database has zero messages for this contact.

import { createClient } from '@supabase/supabase-js'

const HR_KEY  = process.env.HEYREACH_API_KEY || "UTXt46dJni1Wul3y3Ea5AVPLSOcYKRNKKsbUawBlUI4="
const HR_BASE = "https://api.heyreach.io/api/public"

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const conversationId    = searchParams.get("conversationId")
  const linkedInAccountId = parseInt(searchParams.get("linkedInAccountId") || "185228")
  const contactId         = searchParams.get("contactId")

  if (!conversationId) return Response.json({ messages: [], error: "No conversationId" })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // ── 1. Get DB conversation record ─────────────────────────────────────────
  // Look up by contact_id first — stored IDs may be synthetic "sb-" prefixed
  let convRecord = null
  if (contactId) {
    const { data: byContact } = await supabase
      .from("conversations")
      .select("id, conversation_id, last_message_at, messages_synced_at")
      .eq("contact_id", contactId)
      .order("last_message_at", { ascending: false })
      .limit(1)
    convRecord = byContact && byContact[0] ? byContact[0] : null
  }
  if (!convRecord && conversationId) {
    const { data: byConvId } = await supabase
      .from("conversations")
      .select("id, conversation_id, last_message_at, messages_synced_at")
      .eq("conversation_id", conversationId)
      .limit(1)
    convRecord = byConvId && byConvId[0] ? byConvId[0] : null
  }

  // ── 2. Load conversation_messages from DB ─────────────────────────────────
  let dbMessages = []
  if (convRecord) {
    const { data: msgs } = await supabase
      .from("conversation_messages")
      .select("id, message_id, direction, body, sent_at, channel, sequence_key, sender_name")
      .eq("conversation_id", convRecord.id)
      .order("sent_at", { ascending: true })
      .limit(200)
    dbMessages = msgs || []
  }

  // ── 3. Load communications (app-level logs) for this contact ──────────────
  let commMessages = []
  if (contactId) {
    const { data: comms } = await supabase
      .from("communications")
      .select("id, direction, channel, step_label, body, occurred_at, sequence_key, source")
      .eq("contact_id", contactId)
      .in("channel", ["linkedin", "LinkedIn"])
      .order("occurred_at", { ascending: true })
      .limit(200)
    commMessages = comms || []
  }

  // ── 4. If DB has data, merge and return ───────────────────────────────────
  if (dbMessages.length > 0 || commMessages.length > 0) {
    const merged = []

    // Add conversation_messages
    dbMessages.forEach(m => {
      merged.push({
        id:        m.id,
        text:      m.body || "",
        sender:    m.direction === "OUT" ? "ME" : "CORRESPONDENT",
        sentAt:    m.sent_at,
        type:      m.channel || "linkedin",
        seqKey:    m.sequence_key || null,
        source:    "db_messages"
      })
    })

    // Add communications, deduplicating by approximate timestamp (within 60s)
    commMessages.forEach(c => {
      if (!c.body) return
      const cTime = new Date(c.occurred_at).getTime()
      // Skip if already covered by a db_message within 60 seconds
      const isDuplicate = merged.some(m =>
        m.source === "db_messages" &&
        Math.abs(new Date(m.sentAt).getTime() - cTime) < 60000
      )
      if (!isDuplicate) {
        merged.push({
          id:     c.id,
          text:   c.body,
          sender: c.direction === "outbound" || c.direction === "OUT" ? "ME" : "CORRESPONDENT",
          sentAt: c.occurred_at,
          type:   c.channel || "linkedin",
          seqKey: c.sequence_key || c.step_label || null,
          source: "communications"
        })
      }
    })

    // Sort chronologically
    merged.sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))

    // Trigger background sync if messages_synced_at is stale (>1 hour)
    if (convRecord) {
      const lastSync = convRecord.messages_synced_at
        ? new Date(convRecord.messages_synced_at)
        : new Date(0)
      const ageHours = (Date.now() - lastSync.getTime()) / 3600000
      if (ageHours > 1) {
        // Fire-and-forget background sync for this conversation
        fetch(`${process.env.NEXT_PUBLIC_APP_URL || ""}/api/sync-single-conversation?conversationId=${encodeURIComponent(conversationId)}&linkedInAccountId=${linkedInAccountId}&contactId=${contactId || ""}`)
          .catch(() => {})
      }
    }

    return Response.json({
      messages: merged,
      source: "database",
      db_count: dbMessages.length,
      comm_count: commMessages.length,
      count: merged.length
    })
  }

  // ── 5. DB empty — fall back to HeyReach and write to DB ──────────────────
  console.log(`DB empty for conversation ${conversationId} — fetching from HeyReach and syncing`)
  let heyMessages = []
  try {
    const res = await fetch(`${HR_BASE}/inbox/GetChatroom`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY },
      body: JSON.stringify({ linkedInAccountId, conversationId })
    })
    if (res.ok) {
      const data = await res.json()
      const raw = data.messages || data.items || data.data || []
      heyMessages = raw.map(m => ({
        id:     String(m.id || m.messageId || Math.random()),
        text:   m.text || m.message || m.content || m.body || "",
        sender: m.sender === "ME" || m.senderType === "SENDER" ? "ME" : "CORRESPONDENT",
        sentAt: m.sentAt || m.createdAt || m.timestamp || "",
        type:   m.type === "INMAIL" ? "inmail" : "linkedin",
        seqKey: null,
        source: "heyreach_live"
      }))

      // Write to DB immediately so next load comes from DB
      if (heyMessages.length > 0 && convRecord) {
        const rows = heyMessages.map(m => ({
          conversation_id: convRecord.id,
          message_id: m.id,
          direction: m.sender === "ME" ? "OUT" : "IN",
          body: m.text,
          sent_at: m.sentAt || new Date().toISOString(),
          channel: m.type || "linkedin",
          created_at: new Date().toISOString()
        }))
        await supabase
          .from("conversation_messages")
          .upsert(rows, { onConflict: "conversation_id,message_id", ignoreDuplicates: true })
        await supabase
          .from("conversations")
          .update({ messages_synced_at: new Date().toISOString() })
          .eq("id", convRecord.id)
      }
    }
  } catch(e) {
    console.warn("HeyReach fallback failed:", e.message)
  }

  return Response.json({
    messages: heyMessages,
    source: heyMessages.length > 0 ? "heyreach_live" : "none",
    count: heyMessages.length
  })
}
