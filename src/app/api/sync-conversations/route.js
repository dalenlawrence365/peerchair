export const dynamic = "force-dynamic"

// LinkedIn Conversation Sync
// Writes ALL messages to conversation_messages (source of truth)
// Incremental: only syncs conversations with new messages since last sync
// Backfill: ?backfill=true processes all conversations in batches of 30

import { createClient } from '@supabase/supabase-js'

const HR_KEY  = process.env.HEYREACH_API_KEY || "UTXt46dJni1Wul3y3Ea5AVPLSOcYKRNKKsbUawBlUI4="
const HR_BASE = "https://api.heyreach.io/api/public"
const BATCH_SIZE = 30

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const backfill = searchParams.get("backfill") === "true"
  const offsetParam = parseInt(searchParams.get("offset") || "0")

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const results = {
    run_at: new Date().toISOString(),
    mode: backfill ? "backfill" : "incremental",
    heyreach_available: false,
    conversations_checked: 0,
    conversations_synced: 0,
    messages_written: 0,
    contacts_created: 0,
    errors: []
  }

  // ── Pull ALL conversations from HeyReach ─────────────────────────────────
  let allConversations = []
  try {
    // HeyReach returns max 100 per call — fetch up to 300 total
    for (let offset = 0; offset < 300; offset += 100) {
      const res = await fetch(`${HR_BASE}/v2/conversation/GetAllConversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY },
        body: JSON.stringify({ linkedInAccountIds: [185228], limit: 100, offset })
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => "<unreadable>")
        console.error(`HeyReach ${res.status} at offset=${offset}: ${errBody.slice(0, 400)}`)
        results.errors.push(`HeyReach ${res.status} at offset=${offset}: ${errBody.slice(0, 200)}`)
        break
      }
      const data = await res.json()
      const items = data.items || []
      console.log(`HeyReach offset=${offset}: returned ${items.length} items, totalCount=${data.totalCount}`)
      allConversations = allConversations.concat(items)
      if (items.length < 100) break
    }
    results.heyreach_available = true
    results.conversations_checked = allConversations.length
    const sampleItem = allConversations[0] ? JSON.stringify(allConversations[0]).slice(0,300) : 'NONE'
    console.log(`HeyReach: ${allConversations.length} conversations, sample: ${sampleItem}`)
  } catch(e) {
    results.errors.push("HeyReach fetch failed: " + e.message)
    return Response.json({ ...results, summary: "HeyReach unavailable" })
  }

  // ── Load existing contacts for matching ──────────────────────────────────
  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, linkedin_url")
    .limit(2000)

  const contactBySlug = {}
  ;(existingContacts || []).forEach(ct => {
    if (ct.linkedin_url) {
      const slug = ct.linkedin_url.replace(/\/$/, "").split("/in/").pop().toLowerCase()
      contactBySlug[slug] = ct
    }
  })

  // ── Load existing conversation records ────────────────────────────────────
  const { data: existingConvs } = await supabase
    .from("conversations")
    .select("id, conversation_id, last_message_at, messages_synced_at")
    .limit(2000)

  const convByHRId = {}
  ;(existingConvs || []).forEach(c => { convByHRId[c.conversation_id] = c })

  // ── Determine which conversations need message sync ───────────────────────
  let toSync = []
  if (backfill) {
    // Backfill: process batch starting at offset
    toSync = allConversations.slice(offsetParam, offsetParam + BATCH_SIZE)
  } else {
    // Incremental: only conversations with new messages since last sync
    toSync = allConversations.filter(conv => {
      const existing = convByHRId[conv.id]
      if (!existing) return true // never synced
      if (!existing.messages_synced_at) return true // metadata only, no messages
      const lastSync = new Date(existing.messages_synced_at)
      const lastMsg  = conv.lastMessageAt ? new Date(conv.lastMessageAt) : null
      return lastMsg && lastMsg > lastSync
    })
  }

  console.log(`Syncing messages for ${toSync.length} conversations (${results.mode})`)

  // ── Sync messages for each conversation ──────────────────────────────────
  for (const conv of toSync) {
    try {
      const profile = conv.correspondentProfile || {}
      const profileUrl = profile.profileUrl || profile.profile_url || ""
      const slug = profileUrl
        ? profileUrl.replace(/\/$/, "").split("/in/").pop().toLowerCase()
        : ""

      // Match or create contact
      let contactId = null
      if (slug && contactBySlug[slug]) {
        contactId = contactBySlug[slug].id
      } else if (slug) {
        const iso = new Date().toISOString()
        const { data: newCt } = await supabase
          .from("contacts")
          .upsert({
            first_name: profile.firstName || profile.first_name || "",
            last_name:  profile.lastName  || profile.last_name  || "",
            title:      profile.position  || profile.headline   || "",
            company_name: profile.companyName || profile.company_name || "",
            linkedin_url: profileUrl,
            linkedin_location: profile.location || "",
            contact_type: "CFO_PROSPECT",
            pipeline_stage: "Connected",
            member_status: "Prospect",
            lead_source: "LinkedIn / HeyReach",
            heyreach_campaign: "CFO Circle - CFO",
            linkedin_connected_date: iso,
            created_at: iso, updated_at: iso
          }, { onConflict: "linkedin_url" })
          .select("id").single()
        if (newCt) {
          contactId = newCt.id
          contactBySlug[slug] = newCt
          results.contacts_created++
        }
      }

      if (!contactId) continue

      // Check if this contact already has a conversation record (possibly with sb- ID)
      const { data: existingByContact } = await supabase
        .from("conversations")
        .select("id, conversation_id")
        .eq("contact_id", contactId)
        .limit(1)
      const existingConv = existingByContact && existingByContact[0]

      let convRecord = null
      if (existingConv && existingConv.conversation_id !== conv.id) {
        // Update the existing record with the real HeyReach conversation ID
        const { data: updated } = await supabase
          .from("conversations")
          .update({
            conversation_id: conv.id,
            last_message_at: conv.lastMessageAt || null,
            last_message_direction: conv.lastMessageSender === "ME" ? "OUT" : "IN",
            last_message_body: (conv.lastMessageText || "").slice(0, 500),
            last_sender: conv.lastMessageSender || "",
            unread: conv.lastMessageSender !== "ME",
            linkedin_account_id: conv.linkedInAccountId || 185228,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingConv.id)
          .select("id").single()
        convRecord = updated
      } else {
        // Upsert conversation record
        const { data: upserted } = await supabase
          .from("conversations")
          .upsert({
            contact_id: contactId,
            conversation_id: conv.id,
            channel: "linkedin",
            last_message_at: conv.lastMessageAt || null,
            last_message_direction: conv.lastMessageSender === "ME" ? "OUT" : "IN",
            last_message_body: (conv.lastMessageText || "").slice(0, 500),
            last_sender: conv.lastMessageSender || "",
            unread: conv.lastMessageSender !== "ME",
            linkedin_account_id: conv.linkedInAccountId || 185228,
            updated_at: new Date().toISOString()
          }, { onConflict: "conversation_id" })
          .select("id").single()
        convRecord = upserted
      }

      if (!convRecord) continue
      const dbConvId = convRecord.id

      // ── Fetch full chatroom messages ────────────────────────────────────
      let chatMessages = []
      try {
        const chatRes = await fetch(`${HR_BASE}/inbox/GetChatroom`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY },
          body: JSON.stringify({ linkedInAccountId: conv.linkedInAccountId || 185228, conversationId: conv.id })
        })
        if (chatRes.ok) {
          const chatData = await chatRes.json()
          chatMessages = chatData.messages || chatData.items || chatData.data || []
        }
      } catch(e) {
        results.errors.push(`Chatroom fetch failed for ${conv.id}: ${e.message}`)
        continue
      }

      if (chatMessages.length === 0) continue

      // ── Upsert each message into conversation_messages ──────────────────
      const messageRows = chatMessages.map(m => ({
        conversation_id: dbConvId,
        message_id: String(m.id || m.messageId || `${conv.id}-${m.sentAt || m.createdAt}`),
        direction: (m.sender === "ME" || m.senderType === "SENDER") ? "OUT" : "IN",
        body: m.text || m.message || m.content || m.body || "",
        sent_at: m.sentAt || m.createdAt || m.timestamp || new Date().toISOString(),
        channel: m.type === "INMAIL" ? "inmail" : "linkedin",
        sender_name: (m.sender === "ME" || m.senderType === "SENDER")
          ? "Dalen Lawrence"
          : `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
        created_at: new Date().toISOString()
      }))

      // Insert in batches of 50, ignore duplicates
      for (let i = 0; i < messageRows.length; i += 50) {
        const batch = messageRows.slice(i, i + 50)
        const { error } = await supabase
          .from("conversation_messages")
          .upsert(batch, { onConflict: "conversation_id,message_id", ignoreDuplicates: true })
        if (!error) results.messages_written += batch.length
      }

      // Update messages_synced_at on the conversation
      await supabase
        .from("conversations")
        .update({ messages_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", dbConvId)

      results.conversations_synced++

    } catch(e) {
      results.errors.push(`Conversation error: ${e.message}`)
    }
  }

  // ── Backfill pagination info ──────────────────────────────────────────────
  const nextOffset = backfill ? offsetParam + BATCH_SIZE : null
  const hasMore = backfill && nextOffset < allConversations.length

  // ── Update watermark ──────────────────────────────────────────────────────
  if (!backfill) {
    await supabase.from("system_settings").upsert({
      key: "linkedin_last_sync",
      value: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  }

  // ── Write audit log ───────────────────────────────────────────────────────
  const summary = `${results.mode} · ${results.conversations_synced} convos · ${results.messages_written} messages · ${results.contacts_created} created${hasMore ? ` · next offset: ${nextOffset}` : ""}`
  await supabase.from("audit_log").insert({
    run_at: results.run_at,
    audit_type: "linkedin_sync",
    contacts_checked: results.conversations_checked,
    contacts_created: results.contacts_created,
    heyreach_available: true,
    summary,
    errors: results.errors
  }).catch(() => {})

  console.log(summary)
  return Response.json({
    ...results,
    summary,
    has_more: hasMore,
    next_url: hasMore ? `/api/sync-conversations?backfill=true&offset=${nextOffset}` : null
  })
}
