// LinkedIn Conversation Sync Worker
// Pulls HeyReach conversations using watermark pattern
// Stores full message history in conversations + conversation_messages tables
// Runs: on every webhook, manual Sync button, hourly cron

import { createClient } from '@supabase/supabase-js'

const HR_KEY  = process.env.HEYREACH_API_KEY
const HR_BASE = "https://api.heyreach.io/api/public"
const BUFFER_HOURS = 2 // overlap buffer to catch partial syncs

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const results = {
    run_at: new Date().toISOString(),
    heyreach_available: false,
    conversations_synced: 0,
    messages_stored: 0,
    contacts_created: 0,
    errors: []
  }

  // ── Get watermark ─────────────────────────────────────────────────────────
  const { data: wmData } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'linkedin_last_sync')
    .single()

  const watermark = wmData?.value
    ? new Date(new Date(wmData.value).getTime() - BUFFER_HOURS * 3600000)
    : new Date(Date.now() - 7 * 24 * 3600000)

  console.log('Sync from watermark:', watermark.toISOString())

  // ── Pull conversations from HeyReach ─────────────────────────────────────
  let conversations = []
  try {
    const hrRes = await fetch(`${HR_BASE}/v2/conversation/GetAllConversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': HR_KEY },
      body: JSON.stringify({ linkedInAccountIds: [185228], limit: 100, offset: 0 })
    })
    if (hrRes.ok) {
      const data = await hrRes.json()
      conversations = data.items || []
      results.heyreach_available = true
      console.log('HeyReach returned', conversations.length, 'conversations')
    } else {
      results.errors.push('HeyReach API error: ' + hrRes.status)
    }
  } catch(e) {
    results.errors.push('HeyReach fetch failed: ' + e.message)
  }

  if (!results.heyreach_available) {
    return Response.json({ ...results, summary: 'HeyReach unavailable — no sync performed' })
  }

  // ── Load existing contact slugs for matching ──────────────────────────────
  const { data: existingContacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, linkedin_url, pipeline_stage')
    .limit(1000)

  const contactBySlug = {}
  ;(existingContacts || []).forEach(ct => {
    if (ct.linkedin_url) {
      const slug = ct.linkedin_url.replace(/\/$/, '').split('/in/').pop().toLowerCase()
      contactBySlug[slug] = ct
    }
  })

  // ── Process each conversation ─────────────────────────────────────────────
  for (const conv of conversations) {
    try {
      const profile = conv.correspondentProfile || {}
      const profileUrl = profile.profileUrl || profile.profile_url || ''
      const slug = profileUrl ? profileUrl.replace(/\/$/, '').split('/in/').pop().toLowerCase() : ''

      // ── Match or create contact ──────────────────────────────────────────
      let contactId = null
      if (slug && contactBySlug[slug]) {
        contactId = contactBySlug[slug].id
      } else if (slug) {
        // Create minimal contact
        const iso = new Date().toISOString()
        const { data: newContact } = await supabase.from('contacts').upsert({
          first_name: profile.firstName || profile.first_name || '',
          last_name:  profile.lastName  || profile.last_name  || '',
          title:      profile.position  || profile.headline   || '',
          company_name: profile.companyName || profile.company_name || '',
          linkedin_url: profileUrl,
          linkedin_location: profile.location || '',
          contact_type: 'CFO_PROSPECT',
          pipeline_stage: 'Connected',
          member_status: 'Prospect',
          lead_source: 'LinkedIn / HeyReach',
          linkedin_connected_date: iso,
          created_at: iso,
          updated_at: iso
        }, { onConflict: 'linkedin_url' }).select('id').single()

        if (newContact) {
          contactId = newContact.id
          contactBySlug[slug] = newContact
          results.contacts_created++
        }
      }

      if (!contactId) continue

      // ── Upsert conversation record ────────────────────────────────────────
      const { data: convRecord } = await supabase
        .from('conversations')
        .upsert({
          contact_id: contactId,
          conversation_id: conv.id,
          channel: 'linkedin',
          last_message_at: conv.lastMessageAt || null,
          last_message_direction: conv.lastMessageSender === 'ME' ? 'OUT' : 'IN',
          last_message_body: conv.lastMessageText || '',
          last_sender: conv.lastMessageSender || '',
          unread: conv.lastMessageSender !== 'ME',
          last_synced_at: new Date().toISOString(),
          linkedin_account_id: conv.linkedInAccountId || 185228,
          updated_at: new Date().toISOString()
        }, { onConflict: 'conversation_id' })
        .select('id')
        .single()

      results.conversations_synced++

      // ── Fetch full message thread for this conversation ───────────────────
      if (convRecord) {
        try {
          const threadRes = await fetch(`${HR_BASE}/inbox/GetChatroom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-KEY': HR_KEY },
            body: JSON.stringify({
              linkedInAccountId: conv.linkedInAccountId || 185228,
              conversationId: conv.id
            })
          })

          if (threadRes.ok) {
            const threadData = await threadRes.json()
            const messages = threadData.messages || threadData.items || []

            for (const msg of messages) {
              const sentAt = new Date(msg.sentAt || msg.createdAt || msg.timestamp || Date.now())
              // Only store messages newer than watermark
              if (sentAt < watermark && messages.length > 20) continue

              const msgId = msg.id || msg.messageId || `${conv.id}-${sentAt.getTime()}`

              await supabase.from('conversation_messages').upsert({
                conversation_id: convRecord.id,
                message_id: String(msgId),
                direction: (msg.sender === 'ME' || msg.isFromMe) ? 'OUT' : 'IN',
                body: msg.text || msg.message || msg.content || '',
                sent_at: sentAt.toISOString(),
                channel: msg.type === 'INMAIL' ? 'inmail' : 'linkedin',
                sender_name: msg.sender === 'ME' ? 'Dalen Lawrence' : (profile.firstName || '') + ' ' + (profile.lastName || '')
              }, { onConflict: 'conversation_id,message_id' })

              results.messages_stored++
            }
          }
        } catch(e) {
          // Thread fetch failing is non-fatal — conversation record still updated
          console.warn('Thread fetch failed for', conv.id, e.message)
        }
      }
    } catch(e) {
      results.errors.push('Conversation error: ' + e.message)
    }
  }

  // ── Advance watermark ─────────────────────────────────────────────────────
  await supabase.from('system_settings')
    .upsert({ key: 'linkedin_last_sync', value: new Date().toISOString(), updated_at: new Date().toISOString() })

  // ── Write audit log ───────────────────────────────────────────────────────
  const summary = `HeyReach ✓ · ${results.conversations_synced} convos · ${results.messages_stored} messages · ${results.contacts_created} created`
  await supabase.from('audit_log').insert({
    run_at: results.run_at,
    audit_type: 'linkedin_sync',
    contacts_checked: conversations.length,
    contacts_created: results.contacts_created,
    heyreach_available: true,
    summary,
    errors: results.errors
  })

  console.log(summary)
  return Response.json({ ...results, summary })
}
