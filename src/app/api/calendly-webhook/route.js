import { createClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/notify'

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
    if (!contact) return Response.json({ status: 'no_match', name, email })

    const iso = new Date().toISOString()

    if (event === 'invitee.created') {
      await supabase.from('contacts').update({ pipeline_stage: 'Fit Call Scheduled', fit_call_date: startTime || iso }).eq('id', contact.id)
      await supabase.from('communications').insert({
        contact_id: contact.id, occurred_at: iso, channel: 'Calendly', direction: 'IN',
        step_label: 'Fit Call Booked',
        body: name + ' booked a ' + eventName + (startTime ? ' for ' + new Date(startTime).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '') + ' via Calendly.',
        source: 'Calendly', logged_by: 'system',
      })
      await sendSMS('PeerChair: Fit call booked — ' + name + (startTime ? ' · ' + new Date(startTime).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '') + '. Check calendar.')
      return Response.json({ status: 'updated', stage: 'Fit Call Scheduled' })
    }

    if (event === 'invitee.canceled') {
      await supabase.from('contacts').update({ pipeline_stage: 'Engaged' }).eq('id', contact.id)
      await supabase.from('communications').insert({
        contact_id: contact.id, occurred_at: iso, channel: 'Calendly', direction: 'IN',
        step_label: 'Fit Call Canceled', body: name + ' canceled their ' + eventName + ' via Calendly.',
        source: 'Calendly', logged_by: 'system',
      })
      await sendSMS('PeerChair: ⚠️ Fit call CANCELED — ' + name + '. Reschedule needed.')
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
