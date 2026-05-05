// GET /api/meetings
// Fetches all Calendly meetings (upcoming + recent past), enriches with invitee + Supabase contact data

import { createClient } from '@supabase/supabase-js'

const CALENDLY_USER = "https://api.calendly.com/users/6e6c3a6f-335a-4520-a3f7-53b42e7d834c"

export async function GET() {
  const TOKEN = process.env.CALENDLY_TOKEN
  if (!TOKEN) return Response.json({ error: 'No CALENDLY_TOKEN' }, { status: 500 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const headers = { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }
  const now = new Date()
  const past60 = new Date(now.getTime() - 60 * 24 * 3600000).toISOString()
  const future90 = new Date(now.getTime() + 90 * 24 * 3600000).toISOString()

  // Fetch upcoming + recent past in parallel
  const [upcomingRes, pastRes] = await Promise.all([
    fetch(`https://api.calendly.com/scheduled_events?user=${encodeURIComponent(CALENDLY_USER)}&status=active&min_start_time=${now.toISOString()}&max_start_time=${future90}&sort=start_time:asc&count=50`, { headers }),
    fetch(`https://api.calendly.com/scheduled_events?user=${encodeURIComponent(CALENDLY_USER)}&min_start_time=${past60}&max_start_time=${now.toISOString()}&sort=start_time:desc&count=50`, { headers })
  ])

  const [upcomingData, pastData] = await Promise.all([
    upcomingRes.json(),
    pastRes.json()
  ])

  const upcoming = upcomingData.collection || []
  const past     = pastData.collection || []
  const allEvents = [...upcoming, ...past]

  if (allEvents.length === 0) {
    return Response.json({ upcoming: [], past: [], total: 0 })
  }

  // Load all contacts for matching
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, company_name, email, pipeline_stage, fit_call_date, linkedin_url, title')
    .limit(2000)

  const contactByEmail = {}
  const contactByName = {}
  ;(contacts || []).forEach(c => {
    if (c.email) contactByEmail[c.email.toLowerCase()] = c
    const nameKey = `${c.first_name} ${c.last_name}`.toLowerCase().trim()
    contactByName[nameKey] = c
  })

  // Enrich each event with invitee data
  async function enrichEvent(event) {
    const eventUuid = event.uri.split('/scheduled_events/').pop()
    const loc = event.location?.actual_instance || {}
    const slug = (event.event_type || '').split('/event_types/').pop()

    // Classify by event name — slug extracted from event_type is a UUID, not readable
    const eName = (event.name || '').toLowerCase()
    let eventType = 'other'
    if (eName.includes('sponsor') || eName.includes('discovery')) eventType = 'sponsor_discovery'
    else if (eName.includes('fit') || eName.includes('15') || eName.includes('30')) eventType = eName.includes('30') ? 'fit_call_30' : 'fit_call'

    let invitee = null
    let contact = null

    try {
      const invRes = await fetch(
        `https://api.calendly.com/scheduled_events/${eventUuid}/invitees?count=1`,
        { headers }
      )
      if (invRes.ok) {
        const invData = await invRes.json()
        invitee = invData.collection?.[0] || null
      }
    } catch(e) {}

    if (invitee) {
      const email = (invitee.email || '').toLowerCase()
      const name = (invitee.name || '').toLowerCase().trim()
      contact = contactByEmail[email] || contactByName[name] || null
    }

    const start = new Date(event.start_time)
    const isUpcoming = start > now
    const minsUntil = isUpcoming ? Math.round((start - now) / 60000) : null
    let countdown = null
    if (minsUntil !== null) {
      if (minsUntil < 60)       countdown = `In ${minsUntil}m`
      else if (minsUntil < 1440) countdown = `In ${Math.round(minsUntil/60)}h`
      else                       countdown = `In ${Math.round(minsUntil/1440)}d`
    }

    return {
      id: eventUuid,
      name: event.name,
      event_type: eventType,
      status: event.status,
      start_time: event.start_time,
      end_time: event.end_time,
      zoom_url: loc.join_url || null,
      is_upcoming: isUpcoming,
      countdown,
      invitee: invitee ? {
        name: invitee.name,
        email: invitee.email,
        timezone: invitee.timezone,
        notes: invitee.questions_and_answers?.[0]?.answer || null,
        cancel_url: invitee.cancel_url,
        reschedule_url: invitee.reschedule_url,
      } : null,
      contact: contact ? {
        id: contact.id,
        name: `${contact.first_name} ${contact.last_name}`,
        company: contact.company_name,
        title: contact.title,
        stage: contact.pipeline_stage,
        linkedin_url: contact.linkedin_url,
      } : null,
      peerchair_matched: !!contact,
      peerchair_stage_correct: contact?.pipeline_stage === 'Fit Call Scheduled' ||
                               contact?.pipeline_stage === 'Discovery Scheduled',
    }
  }

  // Enrich in batches of 5 to avoid rate limiting
  const enriched = []
  const allToEnrich = [...upcoming, ...past]
  for (let i = 0; i < allToEnrich.length; i += 5) {
    const batch = allToEnrich.slice(i, i + 5)
    const results = await Promise.all(batch.map(enrichEvent))
    enriched.push(...results)
  }

  return Response.json({
    upcoming: enriched.filter(e => e.is_upcoming),
    past:     enriched.filter(e => !e.is_upcoming),
    total:    enriched.length,
    generated_at: now.toISOString()
  })
}
