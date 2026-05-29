import { createClient } from '@supabase/supabase-js'
import { serverClient } from "@/lib/supabaseServer"

export async function GET() {
  const supabase = serverClient()

  // Step 1: Get all inbound comms
  const { data: inbound, error: e1 } = await supabase
    .from('communications')
    .select('contact_id, body, occurred_at, direction')
    .eq('direction', 'IN')
    .order('occurred_at', { ascending: false })
    .limit(50)

  // Step 2: Get all outbound comms
  const { data: outbound, error: e2 } = await supabase
    .from('communications')
    .select('contact_id, occurred_at')
    .eq('direction', 'OUT')
    .limit(200)

  // Step 3: Build lastOutbound map
  const lastOutbound = {}
  ;(outbound || []).forEach(o => {
    if (!lastOutbound[o.contact_id] || o.occurred_at > lastOutbound[o.contact_id]) {
      lastOutbound[o.contact_id] = o.occurred_at
    }
  })

  // Step 4: Build latestInbound map
  const latestInbound = {}
  ;(inbound || []).forEach(m => {
    if (!latestInbound[m.contact_id] || m.occurred_at > latestInbound[m.contact_id].occurred_at) {
      latestInbound[m.contact_id] = m
    }
  })

  // Step 5: Find unanswered
  const needReplyIds = Object.keys(latestInbound).filter(cid => {
    const inAt  = latestInbound[cid].occurred_at
    const outAt = lastOutbound[cid]
    return !outAt || inAt > outAt
  })

  // Step 6: Load contacts
  let contacts = []
  if (needReplyIds.length > 0) {
    const { data: ctData } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, pipeline_stage, linkedin_url')
      .in('id', needReplyIds)
    contacts = ctData || []
  }

  return Response.json({
    inboundCount: (inbound || []).length,
    outboundCount: (outbound || []).length,
    inboundError: e1?.message,
    outboundError: e2?.message,
    needReplyIds,
    contacts,
    latestInbound: Object.entries(latestInbound).map(([k,v]) => ({
      contactId: k,
      occurredAt: v.occurred_at,
      body: (v.body||'').slice(0,60)
    }))
  })
}
