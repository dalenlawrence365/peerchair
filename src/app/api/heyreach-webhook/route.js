import { createClient } from '@supabase/supabase-js'
import { alertNewConnection } from '@/lib/notify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function extractSlug(url) {
  if (!url) return ''
  return url.replace(/\/$/, '').split('/in/').pop().toLowerCase()
}

function extractProfile(body) {
  // HeyReach sends different shapes depending on event type and version
  // Log the full body so we can see exactly what arrives
  console.log('HeyReach webhook body:', JSON.stringify(body, null, 2))

  // Try every known payload path
  return (
    body.lead?.linkedInUserProfile ||
    body.lead?.profile ||
    body.correspondentProfile ||
    body.leadProfile ||
    body.profile ||
    body.lead ||
    body.contact ||
    body.data?.profile ||
    body.data?.lead?.linkedInUserProfile ||
    {}
  )
}

export async function POST(request) {
  var rawBody = null
  try {
    const body = await request.json()
    rawBody = body
    const eventType = body.eventType || body.event_type || body.type || 'unknown'
    console.log('HeyReach webhook received — event:', eventType)
    // Log raw payload to audit_log for debugging unrecognized shapes
    supabase.from('audit_log').insert({
      run_at: new Date().toISOString(),
      audit_type: 'webhook_received',
      summary: 'HeyReach webhook: ' + eventType,
      errors: [JSON.stringify(body).slice(0, 2000)]
    }).catch(() => {})

    const profile = extractProfile(body)

    const firstName   = profile.firstName   || profile.first_name  || ''
    const lastName    = profile.lastName    || profile.last_name   || ''
    const title       = profile.position    || profile.headline    || profile.title || ''
    const company     = profile.companyName || profile.company_name || profile.company || ''
    const email       = profile.emailAddress || profile.email_address || profile.enrichedEmailAddress || profile.enriched_email || profile.custom_email || profile.email || ''
    const linkedinUrl = profile.profileUrl  || profile.profile_url || profile.linkedin_url || profile.url || ''
    const location    = profile.location    || ''

    console.log('Extracted profile:', { firstName, lastName, title, company, linkedinUrl })

    // Skip if we have nothing to work with
    if (!linkedinUrl && !firstName) {
      console.log('Webhook skipped — no profile data found in payload')
      return Response.json({ status: 'skipped', reason: 'no profile data', received: Object.keys(body) })
    }

    // MESSAGE_SENT = HeyReach sent outbound message (Step 2, Hail Mary, etc)
    if (eventType === 'message_sent' || eventType === 'MESSAGE_SENT') {
      // Confirm any pending outbound communication for this contact
      // Match: contact + direction=OUT + send_status=pending + sent within last 10 minutes
      if (linkedinUrl || firstName) {
        try {
          var matchSlug = linkedinUrl ? linkedinUrl.replace(/\/+$/, '').split('/in/').pop().toLowerCase() : null
          var matchContact = null
          if (matchSlug) {
            var { data: mc } = await supabase.from('contacts').select('id')
              .ilike('linkedin_url', '%' + matchSlug + '%').limit(1)
            if (mc && mc[0]) matchContact = mc[0]
          }
          if (!matchContact && firstName) {
            var { data: mc2 } = await supabase.from('contacts').select('id')
              .ilike('first_name', firstName).limit(1)
            if (mc2 && mc2[0]) matchContact = mc2[0]
          }
          if (matchContact) {
            var tenMinsAgo = new Date(Date.now() - 10 * 60000).toISOString()
            await supabase.from('communications')
              .update({ send_status: 'confirmed' })
              .eq('contact_id', matchContact.id)
              .eq('direction', 'OUT')
              .eq('send_status', 'pending')
              .gte('occurred_at', tenMinsAgo)
            console.log('Confirmed pending message for contact:', matchContact.id)
          }
        } catch(e) { console.warn('Confirm pending error:', e.message) }
      }
      const msgBody = (
        body.message ||
        body.messageText || body.message_text ||
        body.messageBody || body.message_body ||
        body.messageContent || body.message_content ||
        body.content || body.text ||
        body.data?.message || body.data?.text ||
        ''
      )
      const msgTimestamp = body.timestamp || new Date().toISOString()
      const slug = extractSlug(linkedinUrl)
      if (slug) {
        const { data: existing } = await supabase
          .from('contacts').select('id,first_name,last_name,pipeline_stage')
          .ilike('linkedin_url', '%' + slug + '%').limit(1)
        if (existing && existing.length > 0) {
          const ct = existing[0]

          // Phrase-based sequence key lookup — match message body against known webhook phrases
          let sequenceKey = null
          let stepLabel = 'HeyReach Message Sent'
          if (msgBody) {
            const { data: tmpl } = await supabase
              .from('template_variants')
              .select('sequence_key, webhook_phrase')
              .not('webhook_phrase', 'is', null)
              .limit(50)
            if (tmpl) {
              const match = tmpl.find(t => t.webhook_phrase && msgBody.includes(t.webhook_phrase))
              if (match && match.sequence_key) {
                sequenceKey = match.sequence_key
                stepLabel = match.sequence_key
              }
            }
          }
          // Fallback to stage inference if no phrase matched
          if (!sequenceKey) {
            sequenceKey = ct.pipeline_stage === 'Connected' ? 'LI-ENG-2' : 'LI-ENG-3'
            stepLabel = sequenceKey
          }

          if (ct.pipeline_stage === 'Connected') {
            await supabase.from('contacts').update({
              pipeline_stage: 'Engaged',
              last_activity_date: new Date().toISOString()
            }).eq('id', ct.id)
            console.log('Advanced to Engaged:', ct.first_name, ct.last_name)
          } else {
            await supabase.from('contacts').update({
              last_activity_date: new Date().toISOString()
            }).eq('id', ct.id)
          }
          await supabase.from('communications').insert({
            contact_id: ct.id,
            occurred_at: msgTimestamp,
            channel: 'LinkedIn',
            direction: 'OUT',
            step_label: stepLabel,
            body: msgBody || stepLabel,
            source: 'HeyReach',
            logged_by: 'system',
            sequence_key: sequenceKey,
          })
          // Log to sequence_performance for tracking
          if (sequenceKey) {
            await supabase.from('sequence_performance').insert({
              sequence_key: sequenceKey,
              contact_id: ct.id,
              sent_at: msgTimestamp,
              channel: sequenceKey.split('-')[0],
            }).catch(e => console.warn('seq perf log failed:', e.message))
          }
          console.log(stepLabel + ':', ct.first_name, ct.last_name)
          return Response.json({ status: 'logged', step: stepLabel, contact: ct.id })
        }
      }
      return Response.json({ status: 'message_sent_no_match' })
    }

    // MESSAGE_REPLY_RECEIVED / INMAIL_REPLY_RECEIVED = prospect replied to us
    if (eventType === 'message_reply_received' || eventType === 'MESSAGE_REPLY_RECEIVED' ||
        eventType === 'inmail_reply_received'  || eventType === 'INMAIL_REPLY_RECEIVED'  ||
        eventType === 'every_message_reply_received' || eventType === 'EVERY_MESSAGE_REPLY_RECEIVED') {
      // Extract reply body — HeyReach uses different field names per event type
      const replyBody = (
        body.message ||
        body.messageText || body.message_text ||
        body.messageBody || body.message_body ||
        body.messageContent || body.message_content ||
        body.content ||
        body.text ||
        body.replyText || body.reply_text ||
        body.reply ||
        body.data?.message || body.data?.text || body.data?.content ||
        body.lead?.lastMessage || body.lead?.message ||
        body.chatMessage || body.chat_message ||
        ''
      )
      const replyTimestamp = body.timestamp || body.sentAt || body.created_at || new Date().toISOString()
      const convId = body.conversationId || body.conversation_id || null
      const slug = extractSlug(linkedinUrl)

      if (slug || firstName) {
        let contact = null
        if (slug) {
          const { data } = await supabase.from('contacts').select('id,first_name,last_name,pipeline_stage')
            .ilike('linkedin_url', '%' + slug + '%').limit(1)
          if (data && data.length > 0) contact = data[0]
        }
        if (!contact && firstName) {
          const { data } = await supabase.from('contacts').select('id,first_name,last_name,pipeline_stage')
            .ilike('first_name', firstName).limit(1)
          if (data && data.length > 0) contact = data[0]
        }

        if (contact) {
          // Log to communications
          await supabase.from('communications').insert({
            contact_id: contact.id,
            occurred_at: replyTimestamp,
            channel: eventType.includes('INMAIL') || eventType.includes('inmail') ? 'inmail' : 'linkedin',
            direction: 'inbound',
            step_label: 'Reply Received',
            body: replyBody || '(reply received)',
            source: 'HeyReach',
            logged_by: 'system',
          })

          // Log to conversation_messages if we have a conversation record
          if (convId || contact.id) {
            const { data: convRecord } = await supabase
              .from('conversations')
              .select('id')
              .eq('contact_id', contact.id)
              .limit(1)
            if (convRecord && convRecord[0]) {
              const messageId = body.messageId || body.message_id || ('reply-' + replyTimestamp)
              await supabase.from('conversation_messages').upsert({
                conversation_id: convRecord[0].id,
                message_id: String(messageId),
                direction: 'IN',
                body: replyBody || '(reply received)',
                sent_at: replyTimestamp,
                channel: eventType.includes('INMAIL') || eventType.includes('inmail') ? 'inmail' : 'linkedin',
                sender_name: firstName + ' ' + lastName,
                created_at: new Date().toISOString()
              }, { onConflict: 'conversation_id,message_id', ignoreDuplicates: true })
            }
          }

          // Update last activity
          await supabase.from('contacts').update({
            last_activity_date: new Date().toISOString()
          }).eq('id', contact.id)

          console.log('Reply logged for:', contact.first_name, contact.last_name, '|', replyBody.slice(0,60))
          return Response.json({ status: 'reply_logged', contact: contact.id })
        }
      }
      return Response.json({ status: 'reply_no_match', eventType })
    }

    // Check if already in Supabase
    const slug = extractSlug(linkedinUrl)
    if (slug) {
      const { data: existing } = await supabase
        .from('contacts').select('id,first_name,last_name')
        .ilike('linkedin_url', '%' + slug + '%').limit(1)
      if (existing && existing.length > 0) {
        console.log('Contact already exists:', existing[0].first_name, existing[0].last_name)
        return Response.json({ status: 'exists', contact: existing[0] })
      }
    }

    // Create contact
    const iso = new Date().toISOString()
    const { data: newContact, error } = await supabase.from('contacts').upsert({
      first_name: firstName,
      last_name: lastName,
      title,
      company_name: company,
      email: email || null,
      email_type: email ? 'Company' : null,
      linkedin_url: linkedinUrl,
      linkedin_location: location,
      chapter_interest: 'Los Angeles',
      lead_source: 'LinkedIn / HeyReach',
      heyreach_campaign: body.campaignName || body.campaign_name || 'CFO Circle - CFO',
      pipeline_stage: 'Connected',
      member_status: 'Prospect',
      linkedin_connected_date: iso,
      created_at: iso,
      updated_at: iso,
    }, { onConflict: 'linkedin_url', ignoreDuplicates: false }).select().single()

    if (error) {
      console.error('Supabase insert error:', error)
      throw error
    }

    console.log('Created contact:', newContact.id, firstName, lastName)

    // Log communication
    await supabase.from('communications').insert({
      contact_id: newContact.id,
      occurred_at: iso,
      channel: 'LinkedIn',
      direction: 'IN',
      step_label: 'Connection Accepted',
      body: firstName + ' ' + lastName + ' accepted your connection request on LinkedIn.',
      source: 'HeyReach',
      logged_by: 'system',
    })

    // Send email alert
    await alertNewConnection(firstName, lastName, company)

    // Trigger background conversation sync
    fetch(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.peerchair.com' + '/api/sync-conversations', {
      headers: { 'Authorization': 'Bearer ' + (process.env.CRON_SECRET || 'peerchair2026') }
    }).catch(function(){});
    return Response.json({ status: 'created', contact: { id: newContact.id, name: firstName + ' ' + lastName } })
  } catch (err) {
    console.error('Webhook error:', err.message, err.stack)
    // Write to dead letter table so we can replay
    try {
      await supabase.from('webhook_failures').insert({
        event_type: 'unknown',
        payload: rawBody || {},
        error_message: err.message,
        retry_count: 0,
        resolved: false,
      })
    } catch(dlErr) { console.error('Dead letter write failed:', dlErr.message) }
    return Response.json({ status: 'error', message: err.message }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({ status: 'PeerChair HeyReach webhook active', timestamp: new Date().toISOString() })
}
