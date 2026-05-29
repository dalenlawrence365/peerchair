import { createClient } from '@supabase/supabase-js'
import { serverClient } from "@/lib/supabaseServer"

const supabase = serverClient()

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = { moved_to_reserve: [], errors: [] }

  try {
    const cutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

    // Find Engaged contacts with no activity in 10+ days
    const { data: stale, error } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company_name, last_activity_date, created_at')
      .eq('pipeline_stage', 'Engaged')

    if (error) throw error

    const toMove = (stale || []).filter(c => {
      const anchor = c.last_activity_date || c.created_at
      return anchor < cutoff
    })

    for (const contact of toMove) {
      try {
        await supabase.from('contacts').update({
          pipeline_stage: 'No Reply / Reserve',
          last_activity_date: new Date().toISOString()
        }).eq('id', contact.id)

        await supabase.from('communications').insert({
          contact_id: contact.id,
          occurred_at: new Date().toISOString(),
          channel: 'System',
          direction: 'INTERNAL',
          step_label: 'Moved to Reserve',
          body: 'No reply after full HeyReach sequence. Auto-moved to No Reply / Reserve after 10 days.',
          source: 'PeerChair',
          logged_by: 'system'
        })

        results.moved_to_reserve.push(contact.first_name + ' ' + contact.last_name)
      } catch (e) {
        results.errors.push(contact.first_name + ' ' + contact.last_name + ': ' + e.message)
      }
    }

    return Response.json({
      status: 'ok',
      run_at: new Date().toISOString(),
      cutoff,
      checked: (stale || []).length,
      moved_count: results.moved_to_reserve.length,
      moved: results.moved_to_reserve,
      errors: results.errors
    })
  } catch (e) {
    console.error('Pipeline maintenance error:', e.message)
    return Response.json({ status: 'error', message: e.message }, { status: 500 })
  }
}
