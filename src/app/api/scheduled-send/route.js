// Scheduled Send Worker
// Runs via Vercel cron at 9am PT (4pm UTC) and 1pm PT (8pm UTC) daily
// Fires pending scheduled_actions, verifies delivery, alerts on failure

import { createClient } from '@supabase/supabase-js'
import { serverClient } from "@/lib/supabaseServer"

const HR_KEY  = process.env.HEYREACH_API_KEY
const HR_BASE = "https://api.heyreach.io/api/public"
const SITE    = "https://www.peerchair.com"

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = serverClient()

  const now = new Date().toISOString()
  const results = { fired: [], resurfaced: [], failed: [], verified: [] }

  // Find all pending actions due now or overdue
  const { data: due, error } = await supabase
    .from('scheduled_actions')
    .select('*')
    .eq('status', 'pending')
    .lte('send_at', now)
    .order('send_at', { ascending: true })
    .limit(20)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  for (const action of (due || [])) {
    // ── RESURFACE mode — move to queue top ───────────────────────────────
    if (action.mode === 'resurface') {
      await supabase.from('scheduled_actions')
        .update({ status: 'resurfaced', status_updated_at: now })
        .eq('id', action.id)

      // Log to communications so it appears in the thread
      await supabase.from('communications').insert({
        contact_id:  action.contact_id,
        occurred_at: now,
        channel:     action.channel === 'linkedin' ? 'LinkedIn' : 'Email',
        direction:   'INTERNAL',
        step_label:  'Scheduled Action Resurfaced',
        body:        `Draft ready to send: "${action.message_body.slice(0, 100)}..."`,
        source:      'PeerChair',
        logged_by:   'system',
      })

      results.resurfaced.push(action.contact_first_name + ' ' + action.contact_last_name)
      continue
    }

    // ── AUTO-SEND mode ────────────────────────────────────────────────────
    if (action.mode === 'auto_send') {
      await supabase.from('scheduled_actions')
        .update({ status: 'sending', send_attempted_at: now, status_updated_at: now })
        .eq('id', action.id)

      try {
        if (action.channel === 'linkedin') {
          // Send via HeyReach MCP proxy
          const sendRes = await fetch(`${SITE}/api/follow-up-queue/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId:    action.conversation_id,
              linkedInAccountId: action.linkedin_account_id || 185228,
              message:           action.message_body,
            })
          })
          const sendData = await sendRes.json()

          if (sendData.success || sendData.status === 'sent') {
            await supabase.from('scheduled_actions').update({
              status: 'sent',
              message_id: sendData.messageId || null,
              status_updated_at: new Date().toISOString()
            }).eq('id', action.id)

            // Log communication
            await supabase.from('communications').insert({
              contact_id:   action.contact_id,
              occurred_at:  new Date().toISOString(),
              channel:      'LinkedIn',
              direction:    'OUT',
              step_label:   'Scheduled Send',
              body:         action.message_body,
              source:       'PeerChair Scheduled',
              logged_by:    'system',
            })

            results.fired.push(action.contact_first_name + ' ' + action.contact_last_name)

            // Schedule verification check in 5 minutes (next cron will confirm)
            await supabase.from('scheduled_actions').update({
              status: 'sent',
              status_updated_at: new Date().toISOString()
            }).eq('id', action.id)

            // Send confirmation email to Dalen
            await sendAlert(
              '✓ Scheduled message sent',
              `Your scheduled LinkedIn message to ${action.contact_first_name} ${action.contact_last_name} at ${action.contact_company} was sent successfully.\n\nMessage:\n"${action.message_body}"`
            )
          } else {
            throw new Error(sendData.error || 'Send returned non-success')
          }
        }

        if (action.channel === 'email') {
          // Outlook send will go here when Microsoft 365 is connected
          // For now, resurface as draft
          await supabase.from('scheduled_actions').update({
            status: 'resurfaced',
            failure_reason: 'Outlook not yet connected — resurfaced for manual send',
            status_updated_at: new Date().toISOString()
          }).eq('id', action.id)
          results.resurfaced.push(action.contact_first_name + ' ' + action.contact_last_name + ' (email — needs Outlook)')
        }

      } catch(e) {
        // Mark failed and alert
        await supabase.from('scheduled_actions').update({
          status: 'failed',
          failure_reason: e.message,
          retry_count: (action.retry_count || 0) + 1,
          status_updated_at: new Date().toISOString()
        }).eq('id', action.id)

        results.failed.push(action.contact_first_name + ' ' + action.contact_last_name + ': ' + e.message)

        await sendAlert(
          '⚠️ Scheduled message FAILED',
          `Your scheduled message to ${action.contact_first_name} ${action.contact_last_name} at ${action.contact_company} FAILED to send.\n\nError: ${e.message}\n\nOpen PeerChair to send manually. The draft is saved.`
        )
      }
    }
  }

  // ── Verify recently sent messages (sent > 5 min ago, not yet confirmed) ──
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: toVerify } = await supabase
    .from('scheduled_actions')
    .select('*')
    .eq('status', 'sent')
    .eq('channel', 'linkedin')
    .lt('send_attempted_at', fiveMinAgo)
    .limit(10)

  for (const action of (toVerify || [])) {
    try {
      const threadRes = await fetch(
        `${SITE}/api/follow-up-queue/thread?conversationId=${encodeURIComponent(action.conversation_id)}&linkedInAccountId=${action.linkedin_account_id || 185228}&contactId=${action.contact_id}`
      )
      const threadData = await threadRes.json()
      const messages = threadData.messages || []

      // Check if our message appears in the thread
      const sendTime = new Date(action.send_attempted_at).getTime()
      const confirmed = messages.some(function(m) {
        return m.sender === 'ME' && Math.abs(new Date(m.sentAt).getTime() - sendTime) < 600000
      })

      if (confirmed) {
        await supabase.from('scheduled_actions').update({
          status: 'confirmed',
          send_confirmed_at: new Date().toISOString(),
          status_updated_at: new Date().toISOString()
        }).eq('id', action.id)
        results.verified.push(action.contact_first_name + ' ' + action.contact_last_name)
      } else {
        await supabase.from('scheduled_actions').update({
          status: 'unconfirmed',
          failure_reason: 'Message not found in LinkedIn thread after 5 minutes',
          status_updated_at: new Date().toISOString()
        }).eq('id', action.id)

        await sendAlert(
          '⚠️ Delivery unconfirmed',
          `Your scheduled message to ${action.contact_first_name} ${action.contact_last_name} was sent but could not be verified in LinkedIn.\n\nPlease check their LinkedIn conversation manually.`
        )
      }
    } catch(e) { console.warn('Verification failed:', e.message) }
  }

  return Response.json({
    run_at: now,
    fired: results.fired,
    resurfaced: results.resurfaced,
    failed: results.failed,
    verified: results.verified,
    total: results.fired.length + results.resurfaced.length
  })
}

async function sendAlert(subject, body) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY
      },
      body: JSON.stringify({
        from: 'PeerChair <onboarding@resend.dev>',
        to: [process.env.ALERT_EMAIL || 'dalenlawrence365@gmail.com'],
        subject: 'PeerChair: ' + subject,
        text: body
      })
    })
  } catch(e) { console.warn('Alert email failed:', e.message) }
}
