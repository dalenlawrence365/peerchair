import { createClient } from '@supabase/supabase-js'
import { alertFitCallBooked, alertFitCallCanceled } from '@/lib/notify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST(request) {
  try {
    const body = await request.json()
    const event    = body.event
    const invitee  = body.payload?.invitee || {}
    const eventDet = body.payload?.event || {}
    const name      = invitee.name || ''
    const email     = invitee.email || ''
    const startTime = eventDet.start_time || ''
    const eventName = body.payload?.event_type?.name || 'Fit Call'

    if (!email && !name) return Response.json({ status: 'skipped' })

    let contact = null
    if (email) {
      const { data } = await supabase.from('contacts').select('id,first_name,last_name,pipeline_stage').ilike('email', email).limit(1)
      if (data && data.length > 0) contact = data[0]
    }
    if (!contact && name) {
      const parts = name.trim().split(' ')
      const { data } = await supabase.from('contacts').select('id,first_name,last_name,pipeline_stage').ilike('first_name', parts[0]).ilike('last_name', parts.slice(1).join(' ')).limit(1)
      if (data && data.length > 0) contact = data[0]
    }
    // If still no match, try first name only as last resort
    if (!contact && name) {
      const parts = name.trim().split(' ')
      const { data } = await supabase.from('contacts').select('id,first_name,last_name,pipeline_stage,email')
        .ilike('first_name', parts[0]).limit(5)
      if (data && data.length === 1) contact = data[0]
    }
    if (!contact) {
      // Log unmatched booking so it can be manually assigned
      await supabase.from('communications').insert({
        contact_id: null,
        occurred_at: iso,
        channel: 'Calendly',
        direction: 'IN',
        step_label: 'UNMATCHED Calendly Booking',
        body: 'Could not match Calendly booking to a contact. Name: ' + name + ' | Email: ' + email + ' | Event: ' + eventName + (startTime ? ' | Date: ' + new Date(startTime).toLocaleString() : '') + ' | NOTE: May be booked by an EA on behalf of a prospect.',
        source: 'Calendly',
        logged_by: 'system',
      }).catch(() => {})
      return Response.json({ status: 'no_match', name, email, logged: true })
    }

    // If matched by name and contact has no email, update it now
    if (email && !contact.email) {
      await supabase.from('contacts').update({ email, email_type: 'Personal' }).eq('id', contact.id)
    }

    const iso = new Date().toISOString()
    const dateStr = startTime ? new Date(startTime).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''

    if (event === 'invitee.created') {
      // Route to correct stage based on event type slug
      const eventSlug = body.payload?.event_type?.slug || ''
      let newStage = 'Fit Call Scheduled'
      let stepLabel = 'Fit Call Booked'
      if (eventSlug.includes('sponsor') || eventSlug.includes('discovery')) {
        newStage = 'Discovery Scheduled'
        stepLabel = 'Sponsor Discovery Call Booked'
      }

      await supabase.from('contacts').update({
        pipeline_stage: newStage,
        fit_call_date: eventSlug.includes('sponsor') ? null : (startTime || iso),
        last_activity_date: iso,
        updated_at: iso
      }).eq('id', contact.id)

      await supabase.from('communications').insert({
        contact_id: contact.id, occurred_at: iso, channel: 'Calendly', direction: 'IN',
        step_label: stepLabel,
        body: name + ' booked a ' + eventName + (dateStr ? ' for ' + dateStr : '') + ' via Calendly. Event type: ' + (eventSlug || 'unknown'),
        source: 'Calendly', logged_by: 'system',
      })
      await alertFitCallBooked(name, dateStr)
      return Response.json({ status: 'updated', stage: newStage, eventSlug })
    }

    if (event === 'invitee.canceled') {
      await supabase.from('contacts').update({ pipeline_stage: 'Engaged' }).eq('id', contact.id)
      await supabase.from('communications').insert({
        contact_id: contact.id, occurred_at: iso, channel: 'Calendly', direction: 'IN',
        step_label: 'Fit Call Canceled', body: name + ' canceled their ' + eventName + ' via Calendly.',
        source: 'Calendly', logged_by: 'system',
      })
      await alertFitCallCanceled(name)
      return Response.json({ status: 'updated', stage: 'Engaged' })
    }

    return Response.json({ status: 'ignored', event })
  } catch (err) {
    console.error('Calendly webhook error:', err)
    return Response.json({ status: 'error', message: err.message }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({ status: 'PeerChair Calendly webhook active' })
}
