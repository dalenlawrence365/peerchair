export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/inbox/linkedin — people with a LinkedIn thread snapshot.
// Sorted by has_unread (true first), then by linkedin_thread_updated_at (desc).
// Returns light row data for the list. Full thread is fetched per-person via
// /api/people/[id] when a row is opened.

export async function GET() {
  const sb = serverClient()

  const { data: people } = await sb.from("people")
    .select("id, full_name, first_name, last_name, title, company, linkedin_url, roles, cfo_state, sponsor_state, referral_state, linkedin_has_unread, linkedin_last_message_incoming, linkedin_thread_updated_at, linkedin_thread_snapshot")
    .not("linkedin_thread_snapshot", "is", null)
    .order("linkedin_thread_updated_at", { ascending: false })
    .limit(100)

  const out = (people || []).map(function(p){
    // Preview: last 200 chars of the snapshot
    const snap = p.linkedin_thread_snapshot || ""
    const preview = snap.length > 240 ? snap.slice(-240) : snap   // last segment (most recent message tends to be last)
    return {
      id: p.id,
      name: p.full_name || `${p.first_name||""} ${p.last_name||""}`.trim(),
      title: p.title, company: p.company, linkedin_url: p.linkedin_url,
      roles: p.roles || [],
      stage: p.cfo_state || p.sponsor_state || p.referral_state,
      has_unread: p.linkedin_has_unread === true,
      last_incoming: p.linkedin_last_message_incoming === true,
      updated_at: p.linkedin_thread_updated_at,
      preview: preview,
    }
  }).sort(function(a, b){
    if (a.has_unread !== b.has_unread) return a.has_unread ? -1 : 1
    return (b.updated_at || "").localeCompare(a.updated_at || "")
  })

  return Response.json({ count: out.length, people: out, unread_count: out.filter(p => p.has_unread).length })
}
