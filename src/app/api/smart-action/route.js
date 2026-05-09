// Smart Action API — parses voice/text commands into send + schedule + task
// Uses Claude Haiku for intent detection (cheap + fast)
// Example: "Send: glad you have a great trip. Follow up June 1"
// → sends message, creates June 1 task

import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const body = await request.json()
  const { command, contact, conversationId, linkedInAccountId } = body

  if (!command) return Response.json({ error: 'No command' }, { status: 400 })

  // Pre-check: detect draft intent directly without Haiku
  const cmdLower = command.toLowerCase()
  const isDraftCmd = cmdLower.includes('draft') || (cmdLower.includes('write') && cmdLower.includes('email')) || (cmdLower.includes('compose') && cmdLower.includes('email'))
  const attachMatches = []
  if (cmdLower.includes('one pager') || cmdLower.includes('1 page') || cmdLower.includes('sponsor 1')) attachMatches.push({name:'CFO Sponsor 1 Page'})
  if (cmdLower.includes('sponsorship deck') || cmdLower.includes('sponsor deck')) attachMatches.push({name:'Sponsorship Deck'})
  if (cmdLower.includes('membership')) attachMatches.push({name:'CFO Circle One Pager'})

  // Parse intent with Haiku
  let parsed = null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `You parse follow-up commands into structured actions. Today is ${new Date().toISOString().split('T')[0]}.
Return ONLY valid JSON with this shape:
{
  "send_now": "message to send immediately, or null",
  "draft_email": "true if they want to draft/compose/write an email, false otherwise",
  "attach_files": ["list of file names to attach, e.g. one pager, sponsorship deck, membership benefits"] or [],
  "schedule_message": { "body": "message text", "send_at": "ISO date", "mode": "auto_send or resurface" } or null,
  "create_task": { "note": "what to do", "due_at": "ISO date or null", "priority": "high/normal/low" } or null
}
Rules:
- If they say "draft", "compose", "write an email", "send an email" set draft_email to true
- If they mention attaching a file, one pager, deck, document, or PDF extract the name into attach_files
- If they say "send:" or "reply:" extract that as send_now
- If they say "remind me on X" or "follow up X" or "resurface X date" create a task
- If they say "schedule a message for X" create a schedule_message
- Dates like "June 1" = ${new Date().getFullYear()}-06-01, "next Monday" = calculate from today
- Be conservative — only create what's explicitly requested`,
        messages: [{ role: 'user', content: command }]
      })
    })
    const d = await res.json()
    const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
    parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch(e) {
    console.error('Haiku parse error:', e.message)
    parsed = { send_now: null, schedule_message: null, create_task: null }
  }

  // Apply pre-check overrides
  if (isDraftCmd) {
    parsed.draft_email = true
    if (!parsed.attach_files || parsed.attach_files.length === 0) parsed.attach_files = attachMatches.map(a => a.name)
  }

  const results = { sent: false, scheduled: false, task_created: false, summary: [] }

  // Execute send_now
  if (parsed.send_now && conversationId && contact) {
    try {
      const sendRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.peerchair.com'}/api/follow-up-queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId, linkedInAccountId: linkedInAccountId || 185228,
          message: parsed.send_now,
          contactId: contact.id, firstName: contact.firstName, lastName: contact.lastName,
          fullName: `${contact.firstName} ${contact.lastName}`,
          title: contact.title || '', company: contact.company || '',
          profileUrl: contact.profileUrl || ''
        })
      })
      const sd = await sendRes.json()
      if (sd.success) { results.sent = true; results.summary.push(`Message sent to ${contact.firstName}`) }
    } catch(e) { console.error('Send error:', e.message) }
  }

  // Execute schedule_message
  if (parsed.schedule_message && contact) {
    const { data: sa } = await supabase.from('scheduled_actions').insert({
      contact_id: contact.id || null,
      conversation_id: conversationId || null,
      channel: 'linkedin',
      send_at: parsed.schedule_message.send_at,
      message_body: parsed.schedule_message.body,
      mode: parsed.schedule_message.mode || 'resurface',
      contact_first_name: contact.firstName, contact_last_name: contact.lastName,
      contact_company: contact.company || '', contact_linkedin_url: contact.profileUrl || '',
      status: 'pending'
    }).select().single()
    if (sa) { results.scheduled = true; results.summary.push(`Message scheduled for ${new Date(parsed.schedule_message.send_at).toLocaleDateString('en-US', { month:'short', day:'numeric' })}`) }
  }

  // Execute create_task
  if (parsed.create_task) {
    const { data: task } = await supabase.from('follow_up_tasks').insert({
      contact_id: contact?.id || null,
      contact_first_name: contact?.firstName || '', contact_last_name: contact?.lastName || '',
      contact_company: contact?.company || '', contact_type: contact?.type || 'CFO_PROSPECT',
      note: parsed.create_task.note, priority: parsed.create_task.priority || 'normal',
      due_at: parsed.create_task.due_at || null,
      source: 'smart_action', source_message: parsed.send_now || command,
      status: 'open', task_type: 'post_send'
    }).select().single()
    if (task) { 
      results.task_created = true
      const dateStr = parsed.create_task.due_at ? new Date(parsed.create_task.due_at).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : 'no date'
      results.summary.push(`Follow-up task created (${dateStr})`)
    }
  }

  results.parsed = parsed
  // Handle draft_email intent — compose with Sonnet using full contact context
  if (parsed.draft_email && contact) {
    try {
      const sysCtx = body.systemContext || ""
      const contactDesc = contact ? `Contact: ${contact.firstName} ${contact.lastName} | Company: ${contact.company||"?"} | ${sysCtx}` : ""
      const composeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type":"application/json", "x-api-key":process.env.ANTHROPIC_API_KEY, "anthropic-version":"2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are writing a professional email for Dalen Lawrence, Chapter Director of CFO Circle Los Angeles. CFO Circle is a confidential monthly peer advisory group for CFOs of privately held companies ($20M-$500M revenue). Dalen's email is dalen.lawrence@cfo-circle.com.

Contact context: ${contactDesc}

Write a concise, direct, peer-to-peer email. No fluff. Return ONLY valid JSON: {"subject":"...","body":"...","to":"${contact.email||""}"}`,
          messages: [{ role:"user", content: command }]
        })
      })
      const composeData = await composeRes.json()
      const composeText = (composeData.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("")
      const composed = JSON.parse(composeText.replace(/```json|```/g,"").trim())
      composed.attachments = (parsed.attach_files || []).map(function(name){ return { name } })
      results.draft_email = composed
      results.summary.push("Email drafted — review and save to Outlook Drafts")
    } catch(e) {
      results.errors = results.errors || []
      results.errors.push("Draft compose error: " + e.message)
    }
  }

  results.confirmation = results.summary.join(' · ') || 'Done'

  // Log result back to voice_commands if this came from a voice input
  const commandId = body.command_id || null
  if (commandId) {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    await sb.from('voice_commands').update({
      action_taken: command,
      status:       results.errors && results.errors.length ? 'failed' : 'executed',
      result:       results.confirmation,
    }).eq('id', commandId)
  }

  return Response.json(results)
}
