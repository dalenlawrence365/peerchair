export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* GET /api/m/pending -> { items[] }
   People who registered/requested a seat but aren't approved yet — the same
   definition as the "events_pending" badge in /api/notifications
   (approved_at null, registered_at set, status not terminal). Scoped to
   upcoming/recent events so stale past registrations don't clutter the phone.
   Mobile Admit screen reads this; Approve/Decline write via /api/events/attendees. */

export async function GET() {
  const sb = serverClient()
  const { data, error } = await sb
    .from("event_attendees")
    .select("id, status, registered_at, notes, source, people:person_id ( id, full_name, first_name, company, title, email, linkedin_url, roles, cfo_state, cfo_circle_member, event_tier ), events:event_id ( id, name, kind, event_date, slug )")
    .is("approved_at", null)
    .not("registered_at", "is", null)
    .not("status", "in", "(Declined,No-show,Attended)")
    .order("registered_at", { ascending: true })

  if (error) return Response.json({ items: [], error: error.message }, { status: 500 })

  const cutoff = Date.now() - 36 * 3600 * 1000 // tolerate events up to ~1.5 days past
  const items = (data || [])
    .filter(function (r) {
      const d = r.events && r.events.event_date ? new Date(r.events.event_date).getTime() : null
      return d == null || d >= cutoff
    })
    .map(function (r) {
      const p = r.people || {}
      return {
        attendee_id: r.id,
        status: r.status,
        registered_at: r.registered_at,
        notes: r.notes || null,
        person: {
          id: p.id || null,
          name: p.full_name || p.first_name || "—",
          first_name: p.first_name || null,
          company: p.company || null,
          title: p.title || null,
          email: p.email || null,
          linkedin_url: p.linkedin_url || null,
          roles: p.roles || [],
          is_cfo: Array.isArray(p.roles) && p.roles.includes("cfo"),
          cfo_circle_member: !!p.cfo_circle_member,
          event_tier: p.event_tier || null,
        },
        event: r.events ? { id: r.events.id, name: r.events.name, kind: r.events.kind, event_date: r.events.event_date, slug: r.events.slug } : null,
      }
    })

  return Response.json({ items })
}
