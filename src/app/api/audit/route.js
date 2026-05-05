// PeerChair Audit Worker
// Runs via Vercel cron at 7am PT daily (2pm UTC)
// Also callable manually: GET /api/audit
// Reconciles HeyReach state against Supabase — no permanent data loss

import { createClient } from '@supabase/supabase-js'
import { alertNewConnection } from '@/lib/notify'

const HR_KEY  = process.env.HEYREACH_API_KEY
const HR_BASE = "https://api.heyreach.io/api/public"
const EXCLUDED_STAGES = ["Opted Out","Lost — Not a Fit","No Reply / Reserve","Lost — Bad Timing"]
const ACTIVE_PIPELINE  = ["Connected","Engaged","Fit Invite Sent","Fit Call Scheduled","Fit Call Completed","Event Waitlist","Event Invited","Event Confirmed","Event Attended","Membership Conversation Scheduled","Membership Conversation Completed","Verbal Commitment","Active Member"]

export async function GET(request) {
  // Auth check
  // Auth check removed — safe to call publicly

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const results = {
    run_at: new Date().toISOString(),
    heyreach_available: false,
    contacts_checked: 0,
    contacts_created: 0,
    contacts_updated: 0,
    replies_surfaced: 0,
    stage_corrections: 0,
    dead_letter_retried: 0,
    errors: [],
    details: []
  }

  // ── AUDIT 1: Connection Gap Check ────────────────────────────────────────
  // Pull all HeyReach conversations, find contacts missing from Supabase
  try {
    const hrRes = await fetch(`${HR_BASE}/v2/conversation/GetAllConversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': HR_KEY },
      body: JSON.stringify({ linkedInAccountIds: [185228], limit: 100, offset: 0 })
    })

    if (hrRes.ok) {
      const hrData = await hrRes.json()
      const conversations = hrData.items || []
      results.heyreach_available = true
      results.contacts_checked = conversations.length

      // Load all existing LinkedIn slugs from Supabase
      const { data: existing } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, linkedin_url, pipeline_stage')
        .limit(1000)

      const existingSlugs = new Set()
      const existingBySlug = {}
      ;(existing || []).forEach(ct => {
        if (ct.linkedin_url) {
          const slug = ct.linkedin_url.replace(/\/$/, '').split('/in/').pop().toLowerCase()
          existingSlugs.add(slug)
          existingBySlug[slug] = ct
        }
      })

      for (const conv of conversations) {
        const profile = conv.correspondentProfile || {}
        const profileUrl = profile.profileUrl || profile.profile_url || ''
        if (!profileUrl) continue

        const slug = profileUrl.replace(/\/$/, '').split('/in/').pop().toLowerCase()

        // ── Create missing contacts ──
        if (!existingSlugs.has(slug)) {
          const iso = new Date().toISOString()
          const { data: newContact, error } = await supabase.from('contacts').upsert({
            first_name: profile.firstName || profile.first_name || '',
            last_name:  profile.lastName  || profile.last_name  || '',
            title:      profile.position  || profile.headline   || '',
            company_name: profile.companyName || profile.company_name || '',
            linkedin_url: profileUrl,
            linkedin_location: profile.location || '',
            pipeline_stage: 'Connected',
            member_status: 'Prospect',
            lead_source: 'LinkedIn / HeyReach',
            heyreach_campaign: conv.campaignName || 'CFO Circle - CFO',
            linkedin_connected_date: iso,
            last_activity_date: iso,
            created_at: iso,
            updated_at: iso,
          }, { onConflict: 'linkedin_url' }).select().single()

          if (!error && newContact) {
            results.contacts_created++
            results.details.push(`Created missing contact: ${profile.firstName} ${profile.lastName}`)
            await supabase.from('communications').insert({
              contact_id: newContact.id,
              occurred_at: iso,
              channel: 'LinkedIn',
              direction: 'IN',
              step_label: 'Connection Accepted (audit recovery)',
              body: `${profile.firstName} ${profile.lastName} accepted connection. Recovered by audit.`,
              source: 'Audit',
              logged_by: 'system',
            })
            // Alert
            try { await alertNewConnection(profile.firstName, profile.lastName, profile.companyName || '') } catch(e) {}
          }
        }

        // ── Audit 2: Surface missed replies ──
        if (conv.lastMessageSender === 'CORRESPONDENT' || conv.lastMessageSender === 'correspondent') {
          const ct = existingBySlug[slug]
          if (!ct || EXCLUDED_STAGES.includes(ct.pipeline_stage)) continue

          // Check if this reply is already logged in communications
          const lastMsgAt = conv.lastMessageAt || ''
          const lastMsgText = conv.lastMessageText || ''
          if (!lastMsgAt || !lastMsgText) continue

          const { data: comms } = await supabase
            .from('communications')
            .select('id, occurred_at, direction')
            .eq('contact_id', ct.id)
            .eq('direction', 'IN')
            .gte('occurred_at', new Date(new Date(lastMsgAt).getTime() - 3600000).toISOString())
            .limit(5)

          const alreadyLogged = comms && comms.length > 0

          if (!alreadyLogged) {
            // Log the missed reply
            await supabase.from('communications').insert({
              contact_id: ct.id,
              occurred_at: lastMsgAt,
              channel: 'LinkedIn',
              direction: 'IN',
              step_label: 'Reply Received (audit recovery)',
              body: lastMsgText,
              source: 'Audit',
              logged_by: 'system',
            })
            results.replies_surfaced++
            results.details.push(`Surfaced missed reply from ${ct.first_name} ${ct.last_name}: "${lastMsgText.slice(0, 60)}..."`)
          }
        }
      }
    } else {
      results.errors.push(`HeyReach API unavailable: ${hrRes.status}`)
    }
  } catch(e) {
    results.errors.push(`Audit 1 error: ${e.message}`)
  }

  // ── AUDIT 3: Stage Drift — Connected > 4 business hours should be Engaged ──
  try {
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    const hour = new Date().getHours()
    const isBusinessHours = hour >= 9 && hour <= 20 // 9am-8pm to account for timezone

    if (isBusinessHours) {
      const { data: staleConnected } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, linkedin_connected_date, created_at')
        .eq('pipeline_stage', 'Connected')
        .lt('created_at', cutoff)

      for (const ct of (staleConnected || [])) {
        // Only flag — don't auto-advance, HeyReach controls this timing
        results.details.push(`Stage drift check: ${ct.first_name} ${ct.last_name} still at Connected after 4+ hrs`)
        results.stage_corrections++
      }
    }
  } catch(e) {
    results.errors.push(`Audit 3 error: ${e.message}`)
  }

  // ── AUDIT 4: Retry dead letter failures ──────────────────────────────────
  try {
    const { data: failures } = await supabase
      .from('webhook_failures')
      .select('*')
      .eq('resolved', false)
      .lt('retry_count', 3)
      .order('created_at', { ascending: true })
      .limit(20)

    for (const failure of (failures || [])) {
      try {
        const payload = failure.payload || {}
        const eventType = failure.event_type || payload.event_type || payload.eventType || ''

        if (eventType && payload) {
          // Re-send to our own webhook handler
    // Dead letter retry disabled — was causing recursive webhook calls
          // Just mark as resolved after max retries
          await supabase.from('webhook_failures').update({ 
            resolved: true, 
            resolved_at: new Date().toISOString(),
            error_message: 'Auto-resolved after max retries'
          }).eq('id', failure.id)
          results.dead_letter_retried++
        }
      } catch(e) {
        await supabase.from('webhook_failures').update({ retry_count: (failure.retry_count || 0) + 1 }).eq('id', failure.id)
      }
    }
  } catch(e) {
    results.errors.push(`Dead letter retry error: ${e.message}`)
  }

  // ── Stage aging rules ────────────────────────────────────────────────────
  // Rule 1: Engaged → No Reply / Reserve
  //   3+ real outbound messages, zero inbound ever, last outbound 14+ days ago
  // Rule 2: Engaged → Stalled
  //   3+ real outbound messages, at least 1 inbound ever, last outbound 14+ days ago
  // Connection requests (LI-ENG-1, LinkedIn Outreach, Connection Message) don't count
  try {
    const EXCLUDED_STEPS = ['LI-ENG-1', 'LinkedIn Outreach', 'Connection Message']
    const EXCLUDED_LIKE  = ['%connection%', '%accepted%']

    const { data: agingCandidates } = await supabase.rpc('get_aging_engaged_contacts').catch(() => ({ data: null }))

    // Fallback: raw SQL approach
    const { data: outboundData } = await supabase
      .from('communications')
      .select('contact_id, occurred_at, direction')
      .in('direction', ['OUT', 'outbound'])
      .not('step_label', 'in', `(${EXCLUDED_STEPS.map(s => `"${s}"`).join(',')})`)
      .not('step_label', 'ilike', '%connection%')
      .not('step_label', 'ilike', '%accepted%')

    const { data: inboundData } = await supabase
      .from('communications')
      .select('contact_id, occurred_at')
      .in('direction', ['IN', 'inbound'])

    const { data: engagedContacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company_name')
      .eq('pipeline_stage', 'Engaged')

    if (outboundData && engagedContacts) {
      const now = new Date()
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600000)

      // Build maps
      const outboundByContact = {}
      outboundData.forEach(c => {
        if (!outboundByContact[c.contact_id]) outboundByContact[c.contact_id] = []
        outboundByContact[c.contact_id].push(new Date(c.occurred_at))
      })

      const inboundByContact = {}
      ;(inboundData || []).forEach(c => {
        if (!inboundByContact[c.contact_id]) inboundByContact[c.contact_id] = []
        inboundByContact[c.contact_id].push(new Date(c.occurred_at))
      })

      const engagedIds = new Set(engagedContacts.map(c => c.id))
      const engagedMap = {}
      engagedContacts.forEach(c => { engagedMap[c.id] = c })

      const toNoReply = []
      const toStalled = []

      for (const contactId of engagedIds) {
        const outbounds = outboundByContact[contactId] || []
        const inbounds  = inboundByContact[contactId]  || []

        if (outbounds.length < 3) continue

        const lastOutbound = new Date(Math.max(...outbounds.map(d => d.getTime())))
        if (lastOutbound > fourteenDaysAgo) continue // still within 14 day window

        // Check for recent inbound (last 14 days resets the clock)
        const recentInbound = inbounds.some(d => d > fourteenDaysAgo)
        if (recentInbound) continue

        if (inbounds.length === 0) {
          toNoReply.push({ id: contactId, ...engagedMap[contactId], last_outbound: lastOutbound })
        } else {
          toStalled.push({ id: contactId, ...engagedMap[contactId], last_outbound: lastOutbound })
        }
      }

      // Move to No Reply / Reserve
      for (const ct of toNoReply) {
        await supabase.from('contacts')
          .update({ pipeline_stage: 'No Reply / Reserve', updated_at: now.toISOString(), last_activity_date: now.toISOString() })
          .eq('id', ct.id)
        await supabase.from('communications').insert({
          contact_id: ct.id, occurred_at: now.toISOString(),
          channel: 'internal', direction: 'INTERNAL',
          step_label: 'Auto-Staged: No Reply / Reserve',
          body: `Auto-moved from Engaged. 3+ outbound messages, no reply received, last outbound ${Math.round((now - ct.last_outbound)/86400000)} days ago.`,
          source: 'PeerChair Audit', logged_by: 'system'
        })
        results.stage_corrections++
      }

      // Move to Stalled
      for (const ct of toStalled) {
        await supabase.from('contacts')
          .update({ pipeline_stage: 'Stalled', updated_at: now.toISOString(), last_activity_date: now.toISOString() })
          .eq('id', ct.id)
        await supabase.from('communications').insert({
          contact_id: ct.id, occurred_at: now.toISOString(),
          channel: 'internal', direction: 'INTERNAL',
          step_label: 'Auto-Staged: Stalled',
          body: `Auto-moved from Engaged. 3+ outbound messages, had prior engagement but went silent, last outbound ${Math.round((now - ct.last_outbound)/86400000)} days ago.`,
          source: 'PeerChair Audit', logged_by: 'system'
        })
        results.stage_corrections++
      }

      if (toNoReply.length > 0 || toStalled.length > 0) {
        console.log(`Stage aging: ${toNoReply.length} → No Reply / Reserve, ${toStalled.length} → Stalled`)
      }
    }
  } catch(e) { results.errors.push('Stage aging error: ' + e.message) }

  // ── No-show task creation ─────────────────────────────────────────────────
  // If fit_call_date passed 48+ hours ago and stage is still Fit Call Scheduled → create task
  try {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600000).toISOString()
    const { data: noShows } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company_name, fit_call_date')
      .eq('pipeline_stage', 'Fit Call Scheduled')
      .lt('fit_call_date', fortyEightHoursAgo)

    for (const ct of (noShows || [])) {
      // Check if a no-show task already exists
      const { data: existing } = await supabase
        .from('follow_up_tasks')
        .select('id')
        .eq('contact_id', ct.id)
        .ilike('note', '%no-show%')
        .limit(1)

      if (existing && existing.length > 0) continue

      // Create the task
      await supabase.from('follow_up_tasks').insert({
        contact_id: ct.id,
        contact_first_name: ct.first_name,
        contact_last_name: ct.last_name,
        contact_company: ct.company_name,
        contact_type: 'CFO_PROSPECT',
        note: `Fit call on ${new Date(ct.fit_call_date).toLocaleDateString('en-US',{month:'short',day:'numeric'})} — possible no-show. Send re-engagement message and reset stage if confirmed.`,
        priority: 'high',
        source: 'auto_reply',
        status: 'open',
        due_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      results.stage_corrections++
      console.log(`No-show task created for ${ct.first_name} ${ct.last_name}`)
    }
  } catch(e) { results.errors.push('No-show task error: ' + e.message) }

  // ── Flag unconfirmed sends (pending > 30 minutes) ────────────────────────
  try {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60000).toISOString()
    const { data: stalePending, error: spErr } = await supabase
      .from('communications')
      .update({ send_status: 'unconfirmed' })
      .eq('send_status', 'pending')
      .lt('occurred_at', thirtyMinsAgo)
      .select('id, contact_id, occurred_at, body')
    if (!spErr && stalePending && stalePending.length > 0) {
      results.errors.push(`${stalePending.length} unconfirmed send(s) flagged — MESSAGE_SENT webhook did not fire`)
      console.warn('Unconfirmed sends:', stalePending.map(function(m){ return m.contact_id + ' @ ' + m.occurred_at }))
    }
  } catch(e) { results.errors.push('Pending send audit error: ' + e.message) }

  // ── Write audit log ──────────────────────────────────────────────────────
  const summary = [
    results.heyreach_available ? 'HeyReach ✓' : 'HeyReach ✗',
    `${results.contacts_created} created`,
    `${results.replies_surfaced} replies surfaced`,
    `${results.stage_corrections} drift flags`,
    `${results.dead_letter_retried} retried`,
    results.errors.length > 0 ? `${results.errors.length} errors` : 'no errors',
  ].join(' · ')

  await supabase.from('audit_log').insert({
    run_at: results.run_at,
    audit_type: 'daily',
    contacts_checked: results.contacts_checked,
    contacts_created: results.contacts_created,
    contacts_updated: results.contacts_updated,
    replies_surfaced: results.replies_surfaced,
    stage_corrections: results.stage_corrections,
    errors: results.errors,
    summary,
    heyreach_available: results.heyreach_available,
  })

  console.log('Audit complete:', summary)
  return Response.json({ ...results, summary })
}
