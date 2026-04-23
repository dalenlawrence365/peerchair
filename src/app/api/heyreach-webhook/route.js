import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function extractSlug(url) {
  if (!url) return ''
  const cleaned = url.replace(/\/$/, '')
  const parts = cleaned.split('/in/')
  return parts.length > 1 ? parts[1].toLowerCase() : ''
}

export async function POST(request) {
  try {
    const body = await request.json()
    const profile = body.lead?.linkedInUserProfile || body.correspondentProfile || body.leadProfile || {}
    const firstName   = profile.firstName || ''
    const lastName    = profile.lastName  || ''
    const title       = profile.position  || profile.headline || ''
    const company     = profile.companyName || ''
    const email       = profile.emailAddress || profile.enrichedEmailAddress || ''
    const linkedinUrl = profile.profileUrl || ''
    const location    = profile.location || ''

    if (!linkedinUrl && !firstName) {
      return Response.json({ status: 'skipped', reason: 'no profile data' })
    }

    // Check if contact already exists
    const slug = extractSlug(linkedinUrl)
    const { data: existing } = await supabase
      .from('contacts')
      .select('id, first_name, last_name')
      .ilike('linkedin_url', '%' + slug + '%')
      .limit(1)

    if (existing && existing.length > 0) {
      return Response.json({ status: 'exists', contact: existing[0] })
    }

    // Insert new contact
    const { data: newContact, error } = await supabase
      .from('contacts')
      .insert({
        first_name:             firstName,
        last_name:              lastName,
        title:                  title,
        company_name:           company,
        email:                  email || null,
        email_type:             email ? 'Company' : null,
        linkedin_url:           linkedinUrl,
        linkedin_location:      location,
        chapter_interest:       'Los Angeles',
        lead_source:            'LinkedIn / HeyReach',
        heyreach_campaign:      'CFO Circle - CFO',
        pipeline_stage:         'Connected',
        member_status:          'Prospect',
        linkedin_connected_date: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    // Log connection to communications
    await supabase.from('communications').insert({
      contact_id:  newContact.id,
      occurred_at: new Date().toISOString(),
      channel:     'LinkedIn',
      direction:   'IN',
      step_label:  'Connection Accepted',
      body:        firstName + ' ' + lastName + ' accepted your connection request on LinkedIn.',
      source:      'HeyReach',
      logged_by:   'system',
    })

    return Response.json({ status: 'created', contact: newContact })
  } catch (err) {
    console.error('Webhook error:', err)
    return Response.json({ status: 'error', message: err.message }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({ status: 'PeerChair HeyReach webhook active' })
}
