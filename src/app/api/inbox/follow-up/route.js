export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"

// GET /api/inbox/follow-up — people with active reply_received action tag.
// These are LinkedIn replies (and other inbound signals) Dalen hasn't actioned.

export async function GET() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const { data: tags } = await sb.from("person_action_tags")
    .select("person_id, set_at, notes")
    .eq("action_type", "reply_received")
    .order("set_at", { ascending: false })
    .limit(60)

  const ids = (tags || []).map(t => t.person_id)
  if (ids.length === 0) return Response.json({ count: 0, people: [] })

  const { data: people } = await sb.from("people")
    .select("id, full_name, first_name, last_name, title, company, email, linkedin_url, roles, cfo_state, sponsor_state, referral_state, linkedin_has_unread, linkedin_last_message_incoming")
    .in("id", ids)

  // Most recent inbound LinkedIn body per person, for preview
  const { data: comms } = await sb.from("communications")
    .select("person_id, contact_id, body, occurred_at, channel, direction")
    .in("person_id", ids)
    .order("occurred_at", { ascending: false })

  const latestInbound = {}
  ;(comms || []).forEach(function(c){
    const id = c.person_id || c.contact_id
    if (!id) return
    if ((c.direction === "IN" || c.direction === "inbound") && !latestInbound[id]) latestInbound[id] = c
  })

  const tagByPerson = {}
  ;(tags || []).forEach(function(t){ if (!tagByPerson[t.person_id]) tagByPerson[t.person_id] = t })

  const out = (people || []).map(function(p){
    const t = tagByPerson[p.id] || {}
    const c = latestInbound[p.id]
    return {
      id: p.id, name: p.full_name || `${p.first_name||""} ${p.last_name||""}`.trim(),
      title: p.title, company: p.company, email: p.email, linkedin_url: p.linkedin_url,
      roles: p.roles || [],
      stage: p.cfo_state || p.sponsor_state || p.referral_state,
      has_unread: p.linkedin_has_unread === true,
      last_incoming: p.linkedin_last_message_incoming === true,
      replied_at: t.set_at,
      tag_notes: t.notes,
      latest_body: c ? c.body : null,
      latest_channel: c ? c.channel : null,
      latest_at: c ? c.occurred_at : null,
    }
  }).sort(function(a, b){ return (b.replied_at || "").localeCompare(a.replied_at || "") })

  return Response.json({ count: out.length, people: out })
}
