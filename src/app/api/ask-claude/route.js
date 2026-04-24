import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST(request) {
  try {
    const { question } = await request.json()
    if (!question) return Response.json({ error: 'No question provided' }, { status: 400 })

    // Pull live pipeline data
    const { data: contacts } = await supabase
      .from('contacts')
      .select('first_name, last_name, company_name, title, pipeline_stage, member_status, fit_call_date, fit_call_outcome, primary_challenge, pressure_categories, high_fit_cues, red_flags, email, lead_source, industry, annual_revenue, linkedin_location, created_at')
      .order('created_at', { ascending: false })

    // Pull recent communications
    const { data: comms } = await supabase
      .from('communications')
      .select('contact_id, occurred_at, channel, direction, step_label, body')
      .order('occurred_at', { ascending: false })
      .limit(100)

    // Build pipeline summary
    const stageCounts = {}
    ;(contacts || []).forEach(c => {
      const s = c.pipeline_stage || 'Unknown'
      stageCounts[s] = (stageCounts[s] || 0) + 1
    })

    const pipelineSummary = Object.entries(stageCounts)
      .map(([stage, count]) => stage + ': ' + count)
      .join(', ')

    const contactList = (contacts || []).map(c => {
      const name = c.first_name + ' ' + c.last_name
      const commsForContact = (comms || []).filter(m => {
        // Match by name in body since we don't have contact_id easily
        return m.body && m.body.includes(c.first_name)
      })
      const lastComm = commsForContact[0]
      const lastActivity = lastComm
        ? new Date(lastComm.occurred_at).toLocaleDateString('en-US', {month:'short',day:'numeric'})
        : 'No activity logged'

      return [
        name + ' | ' + (c.company_name || 'Unknown Company') + ' | ' + (c.title || ''),
        'Stage: ' + c.pipeline_stage,
        c.fit_call_outcome ? 'Fit Outcome: ' + c.fit_call_outcome : '',
        c.primary_challenge ? 'Challenge: ' + c.primary_challenge : '',
        'Last Activity: ' + lastActivity,
        c.email ? 'Email: ' + c.email : '',
      ].filter(Boolean).join(' | ')
    }).join('\n')

    const systemPrompt = `You are Dalen Lawrence's personal chapter director assistant for CFO Circle Los Angeles. You have deep knowledge of his pipeline and help him decide exactly what to do each day.

PIPELINE OVERVIEW (${(contacts||[]).length} total contacts):
${pipelineSummary}

FULL CONTACT LIST:
${contactList}

CONTEXT ABOUT DALEN:
- He is the Chapter Director for CFO Circle Los Angeles
- He is building a peer group of CFO members for privately held LA companies
- He has ADHD and needs clear, direct, actionable answers — not vague advice
- The goal is to fill the chapter with qualified CFO members
- Key milestones: Fit Call → Experience Event → Membership Conversation → Active Member
- His Calendly fit call link: https://calendly.com/dalen-lawrence/cfo-circle-fit-chat
- His target: 12-16 active members in the LA chapter

YOUR JOB:
- Answer questions about his pipeline directly and specifically
- When asked who to call, give him names, reasons, and what to say
- When asked for follow-up messages, draft them specifically for that person
- Be direct, confident, and brief — he doesn't need lengthy explanations
- Always use real names from his pipeline, never generic advice
- If he asks "who should I call today" give him a ranked list of 3-5 with one sentence why each
- Today's date is ${new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'})}`

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }]
      })
    })

    const data = await response.json()
    const answer = data.content?.[0]?.text || 'No response generated'

    return Response.json({ answer, contactCount: (contacts||[]).length })

  } catch (err) {
    console.error('Ask Claude error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
