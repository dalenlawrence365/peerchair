// Email Sync Worker
// Pulls emails from Microsoft Graph for all contacts with email addresses
// Uses watermark pattern — only fetches emails newer than last successful sync
// Runs: hourly cron + manual Sync button

import { createClient } from '@supabase/supabase-js'

const BUFFER_HOURS = 2
const CFO_CIRCLE_EMAIL = 'dalen.lawrence@cfo-circle.com'

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
    graph_available: false,
    emails_stored: 0,
    contacts_matched: 0,
    errors: []
  }

  // ── Get watermark ─────────────────────────────────────────────────────────
  const { data: wmData } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'email_last_sync')
    .single()

  const watermark = wmData?.value
    ? new Date(new Date(wmData.value).getTime() - BUFFER_HOURS * 3600000)
    : new Date(Date.now() - 7 * 24 * 3600000)

  const watermarkISO = watermark.toISOString()
  console.log('Email sync from watermark:', watermarkISO)

  // ── Load contact email addresses for matching ─────────────────────────────
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, email2')
    .not('email', 'is', null)
    .limit(500)

  const contactByEmail = {}
  ;(contacts || []).forEach(ct => {
    if (ct.email) contactByEmail[ct.email.toLowerCase()] = ct
    if (ct.email2) contactByEmail[ct.email2.toLowerCase()] = ct
  })

  const contactEmails = Object.keys(contactByEmail)
  if (contactEmails.length === 0) {
    return Response.json({ ...results, summary: 'No contacts with email addresses' })
  }

  // ── Fetch from Microsoft Graph via MCP ───────────────────────────────────
  // We use the Anthropic API to call Graph via MCP since we don't have
  // direct Graph credentials yet — this routes through the M365 connector
  try {
    const graphRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-beta': 'mcp-client-2025-04-04'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: `You are an email sync agent. Search Microsoft 365 for emails from/to the given email addresses since the given date. Return a JSON array of email objects with fields: message_id, subject, body_preview, from_address, to_address, sent_at, direction (IN if received by Dalen, OUT if sent by Dalen), thread_id. Dalen's email is ${CFO_CIRCLE_EMAIL}. Return ONLY valid JSON array, no other text.`,
        messages: [{
          role: 'user',
          content: `Search emails since ${watermarkISO} involving these addresses: ${contactEmails.slice(0, 50).join(', ')}. Return JSON array.`
        }],
        mcp_servers: [{
          type: 'url',
          url: 'https://microsoft365.mcp.claude.com/mcp',
          name: 'microsoft365'
        }]
      })
    })

    if (graphRes.ok) {
      const graphData = await graphRes.json()
      results.graph_available = true

      // Extract JSON from response
      const textContent = (graphData.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('')

      let emails = []
      try {
        const clean = textContent.replace(/```json|```/g, '').trim()
        emails = JSON.parse(clean)
      } catch(e) {
        results.errors.push('JSON parse error: ' + e.message)
      }

      // Store each email matched to a contact
      for (const email of (Array.isArray(emails) ? emails : [])) {
        const fromLower = (email.from_address || '').toLowerCase()
        const toLower   = (email.to_address   || '').toLowerCase()

        // Match to contact
        const contact = contactByEmail[fromLower] || contactByEmail[toLower]
        if (!contact) continue

        // Determine direction
        const direction = fromLower === CFO_CIRCLE_EMAIL.toLowerCase() ? 'OUT' : 'IN'

        await supabase.from('email_messages').upsert({
          contact_id:   contact.id,
          message_id:   email.message_id,
          direction,
          subject:      email.subject || '',
          body:         email.body || '',
          body_preview: email.body_preview || '',
          sent_at:      email.sent_at,
          from_address: email.from_address,
          to_address:   email.to_address,
          thread_id:    email.thread_id || null,
          is_read:      true
        }, { onConflict: 'message_id' })

        results.emails_stored++
        results.contacts_matched++
      }
    }
  } catch(e) {
    results.errors.push('Graph sync error: ' + e.message)
    console.warn('Email sync failed:', e.message)
  }

  // ── Advance watermark only on success ─────────────────────────────────────
  if (results.graph_available) {
    await supabase.from('system_settings')
      .upsert({ key: 'email_last_sync', value: new Date().toISOString(), updated_at: new Date().toISOString() })
  }

  const summary = results.graph_available
    ? `Graph ✓ · ${results.emails_stored} emails stored · ${results.contacts_matched} contacts matched`
    : `Graph unavailable · watermark preserved`

  await supabase.from('audit_log').insert({
    run_at: results.run_at,
    audit_type: 'email_sync',
    contacts_checked: contactEmails.length,
    summary,
    errors: results.errors
  })

  return Response.json({ ...results, summary })
}
