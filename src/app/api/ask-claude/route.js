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
      .select('id, first_name, last_name, company_name, title, pipeline_stage, member_status, fit_call_date, fit_call_outcome, primary_challenge, pressure_categories, high_fit_cues, red_flags, email, lead_source, industry, annual_revenue, linkedin_location, linkedin_connected_date, last_activity_date, created_at')
      .order('created_at', { ascending: false })

    // Pull recent communications
    const { data: comms } = await supabase
      .from('communications')
      .select('contact_id, occurred_at, channel, direction, step_label, body')
      .order('occurred_at', { ascending: false })
      .limit(500)

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
      const commsForContact = (comms || []).filter(m => m.contact_id === c.id)
      const lastComm = commsForContact[0]
      const connectedDate = c.linkedin_connected_date
        ? new Date(c.linkedin_connected_date).toLocaleDateString('en-US', {month:'short',day:'numeric'})
        : null
      const lastActivityDate = c.last_activity_date
        ? new Date(c.last_activity_date).toLocaleDateString('en-US', {month:'short',day:'numeric'})
        : lastComm
          ? new Date(lastComm.occurred_at).toLocaleDateString('en-US', {month:'short',day:'numeric'})
          : null
      const createdDate = new Date(c.created_at).toLocaleDateString('en-US', {month:'short',day:'numeric'})
      const lastActivity = lastActivityDate || connectedDate || ('Added '+createdDate)

      return [
        name + ' | ' + (c.company_name || 'Unknown Company') + ' | ' + (c.title || ''),
        'Stage: ' + c.pipeline_stage,
        connectedDate ? 'Connected: ' + connectedDate : '',
        c.fit_call_outcome ? 'Fit Outcome: ' + c.fit_call_outcome : '',
        c.primary_challenge ? 'Challenge: ' + c.primary_challenge : '',
        'Last Activity: ' + lastActivity,
        c.email ? 'Email: ' + c.email : '',
      ].filter(Boolean).join(' | ')
    }).join('\n')

    const systemPrompt = `You are Dalen Lawrence's personal operating assistant for CFO Circle Los Angeles. You know his full pipeline, his process, and his goals. Give direct, specific, actionable answers using real names from his data.

PIPELINE OVERVIEW (${(contacts||[]).length} total contacts):
${pipelineSummary}

FULL CONTACT LIST:
${contactList}

TODAY: ${new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'})}

WHO DALEN IS:
- Chapter Director, CFO Circle Los Angeles (West LA + Valley)
- Also a financial advisor at Stalliant — do not mention this unless he asks
- Building the first LA chapter — a curated monthly peer group for CFOs of privately held companies $20M-$500M revenue
- Target: 12-16 active CFO members. He is in launch mode — every week counts.

THE PIPELINE JOURNEY (in order):
Connected → Engaged → Fit Invite Sent → Fit Call Scheduled → Fit Call Completed → Strong Fit / Possible Fit → Event Invited → Event Confirmed → Event Attended → Membership Conversation → Verbal Commitment → Active Member

THE OUTREACH PROCESS:
- LinkedIn outreach runs through HeyReach (campaign: CFO Circle - CFO)
- Accepted connections auto-create in pipeline at Connected via webhook
- Dalen personally follows up via the PeerChair Follow-Up Queue
- Follow-up message introduces CFO Circle and shares Calendly link
- Calendly fit call: https://calendly.com/cfocirclela/cfo-circle-fit-chat
- Calendly sponsor discovery: https://calendly.com/cfocirclela/cfo-circle-sponsor-discovery-call
- Touch 2 auto-sends 5 business days after first reply if no booking

THE FIT CALL (15 min):
- Assess fit, find primary challenge, invite to Experience Event
- Strong Fit → invite to Event same day
- Possible Fit → one more touch
- Bad Timing → warm close, nurture
- Not a Fit → gracious close

THE EXPERIENCE EVENT:
- Live sample CFO Circle meeting — primary conversion tool
- Target 12-20 CFO guests. Has not happened yet — Dalen is building toward it.

SPONSORS:
- 6 seats per group, one per category, $5,000/year
- Separate pipeline from CFO members

DATA NOTES:
- Ignore any "John Doe" contacts — test data from webhook setup
- Connected stage = accepted LinkedIn, not yet replied
- Fit Invite Sent = Calendly link was shared, awaiting booking

HOW TO ANSWER:
- Use real names from the pipeline — never generic
- Give ranked lists when asked who to contact, with one sentence why each
- Draft actual messages when asked — not template descriptions
- Give the number first, then the names, for any count question
- Say exactly what to do — not "consider reaching out"
- Flag if data seems incomplete rather than guessing
- NEVER offer to prioritize who to message after a connection — HeyReach handles follow-up automatically via the outreach sequence. All new connections get the follow-up message automatically. Dalen only needs to act when someone REPLIES (which appears in his Follow-Up Queue).
- NEVER offer to draft a follow-up for Connected-stage contacts — that is automated. Only draft messages for people who have already replied or are in a later stage.`

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
