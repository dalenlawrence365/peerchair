// Scheduled Send Worker
// Runs via Vercel cron at 9am PT (4pm UTC) and 1pm PT (8pm UTC) daily
// Fires pending scheduled_actions, verifies delivery, alerts on failure

import { createClient } from '@supabase/supabase-js'
import { serverClient } from "@/lib/supabaseServer"
import { logCronRun } from "@/lib/cron-audit"


export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || "cfocircle2026"
  if (authHeader !== 'Bearer ' + cronSecret) {
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
        person_id:   action.person_id,
        occurred_at: now,
        channel:     action.channel === 'linkedin' ? 'LinkedIn' : 'Email',
        direction:   'INTERNAL',
        step_label:  'Scheduled Action Resurfaced',
        body:        `Draft ready to send: "${action.message_body}"`,
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
          // LinkedIn auto-send retired (sending is manual via LinkedHelper) — resurface the draft
          await supabase.from('scheduled_actions').update({
            status: 'resurfaced',
            failure_reason: 'LinkedIn auto-send retired — resurfaced for manual send',
            status_updated_at: new Date().toISOString()
          }).eq('id', action.id)
          results.resurfaced.push(action.contact_first_name + ' ' + action.contact_last_name + ' (LinkedIn — send manually)')
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


  const total = results.fired.length + results.resurfaced.length
  await logCronRun(
    "scheduled-send",
    `fired=${results.fired.length} resurfaced=${results.resurfaced.length} failed=${results.failed.length} verified=${results.verified.length}`,
    results.failed.length ? results.failed.map(f => typeof f === "string" ? f : JSON.stringify(f)) : null
  )

  return Response.json({
    run_at: now,
    fired: results.fired,
    resurfaced: results.resurfaced,
    failed: results.failed,
    verified: results.verified,
    total
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
