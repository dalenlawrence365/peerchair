// GET /api/audit-conversations
// Compares HeyReach message counts vs database per conversation
// Flags drift and triggers re-sync for mismatched conversations
// Designed to run as a daily cron

import { createClient } from '@supabase/supabase-js'

const HR_KEY  = process.env.HEYREACH_API_KEY || "UTXt46dJni1Wul3y3Ea5AVPLSOcYKRNKKsbUawBlUI4="
const HR_BASE = "https://api.heyreach.io/api/public"

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const fix = searchParams.get("fix") === "true" // ?fix=true to auto-resync drifted convos

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const results = {
    run_at: new Date().toISOString(),
    conversations_audited: 0,
    in_sync: 0,
    drifted: 0,
    missing_from_db: 0,
    resynced: 0,
    drift_details: [],
    errors: []
  }

  // ── Pull all HeyReach conversations ────────────────────────────────────────
  let hrConversations = []
  try {
    for (let offset = 0; offset < 300; offset += 100) {
      const res = await fetch(`${HR_BASE}/v2/conversation/GetAllConversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY },
        body: JSON.stringify({ linkedInAccountIds: [185228], limit: 100, offset })
      })
      if (!res.ok) break
      const data = await res.json()
      const items = data.items || []
      hrConversations = hrConversations.concat(items)
      if (items.length < 100) break
    }
  } catch(e) {
    results.errors.push("HeyReach unavailable: " + e.message)
    return Response.json({ ...results, summary: "HeyReach unavailable — audit skipped" })
  }

  // ── Load DB conversation records with message counts ──────────────────────
  const { data: dbConvs } = await supabase
    .from("conversations")
    .select("id, conversation_id, last_message_at, messages_synced_at")
    .limit(2000)

  const dbConvMap = {}
  ;(dbConvs || []).forEach(c => { dbConvMap[c.conversation_id] = c })

  // Get message counts per conversation from DB
  const { data: msgCounts } = await supabase
    .from("conversation_messages")
    .select("conversation_id")
    .limit(10000)

  const dbMsgCountMap = {}
  ;(msgCounts || []).forEach(m => {
    dbMsgCountMap[m.conversation_id] = (dbMsgCountMap[m.conversation_id] || 0) + 1
  })

  // ── Audit each conversation ───────────────────────────────────────────────
  // Sample up to 50 conversations for chatroom count comparison (API rate limit)
  const sampleSize = Math.min(hrConversations.length, 50)
  const sample = hrConversations.slice(0, sampleSize)

  for (const conv of sample) {
    results.conversations_audited++
    const dbConv = dbConvMap[conv.id]

    if (!dbConv) {
      results.missing_from_db++
      results.drift_details.push({
        conversation_id: conv.id,
        issue: "missing_from_db",
        hr_last_message: conv.lastMessageAt,
        profile: (conv.correspondentProfile?.firstName || "") + " " + (conv.correspondentProfile?.lastName || "")
      })
      continue
    }

    const dbCount = dbMsgCountMap[dbConv.id] || 0
    const hrMsgCount = conv.totalMessages || conv.messages?.length || 0

    // If HeyReach reports a count and it doesn't match DB
    if (hrMsgCount > 0 && dbCount !== hrMsgCount) {
      const driftAmount = hrMsgCount - dbCount
      const detail = {
        conversation_id: conv.id,
        db_conv_id: dbConv.id,
        issue: driftAmount > 0 ? "db_missing_messages" : "db_has_extra",
        hr_count: hrMsgCount,
        db_count: dbCount,
        drift: driftAmount,
        profile: (conv.correspondentProfile?.firstName || "") + " " + (conv.correspondentProfile?.lastName || ""),
        last_message_at: conv.lastMessageAt
      }
      results.drift_details.push(detail)
      results.drifted++

      // Auto-resync if ?fix=true and DB is missing messages
      if (fix && driftAmount > 0) {
        try {
          const chatRes = await fetch(`${HR_BASE}/inbox/GetChatroom`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY },
            body: JSON.stringify({ linkedInAccountId: 185228, conversationId: conv.id })
          })
          if (chatRes.ok) {
            const chatData = await chatRes.json()
            const msgs = chatData.messages || chatData.items || []
            if (msgs.length > 0) {
              const rows = msgs.map(m => ({
                conversation_id: dbConv.id,
                message_id: String(m.id || m.messageId || `${conv.id}-${m.sentAt}`),
                direction: (m.sender === "ME" || m.senderType === "SENDER") ? "OUT" : "IN",
                body: m.text || m.message || m.content || "",
                sent_at: m.sentAt || m.createdAt || new Date().toISOString(),
                channel: m.type === "INMAIL" ? "inmail" : "linkedin",
                created_at: new Date().toISOString()
              }))
              await supabase
                .from("conversation_messages")
                .upsert(rows, { onConflict: "conversation_id,message_id", ignoreDuplicates: true })
              await supabase
                .from("conversations")
                .update({ messages_synced_at: new Date().toISOString() })
                .eq("id", dbConv.id)
              results.resynced++
              detail.resynced = true
            }
          }
        } catch(e) {
          results.errors.push(`Re-sync failed for ${conv.id}: ${e.message}`)
        }
      }
    } else {
      results.in_sync++
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = `Audited ${results.conversations_audited} · ` +
    `${results.in_sync} in sync · ` +
    `${results.drifted} drifted · ` +
    `${results.missing_from_db} missing · ` +
    `${results.resynced} resynced`

  // Write to audit log
  await supabase.from("audit_log").insert({
    run_at: results.run_at,
    audit_type: "conversation_audit",
    contacts_checked: results.conversations_audited,
    contacts_created: 0,
    heyreach_available: true,
    summary,
    errors: results.errors
  }).catch(() => {})

  console.log(summary)
  return Response.json({ ...results, summary })
}
