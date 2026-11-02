export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* Public, READ-ONLY sponsor view of ONE event's roster, gated by that event's
   sponsor_view_key (set per event). Returns only sponsor-safe fields — name,
   company, email, LinkedIn, pipeline timestamps + status — and only the engaged
   pipeline (confirmed / attended / registered). Never declined, unavailable,
   no-shows, silent invitees, internal notes/tiers, or anything else in the CRM.
   A correct key for this one event is the only thing it exposes. */

function json(b, s = 200) { return Response.json(b, { status: s }) }

export async function POST(req) {
  let body = {}
  try { body = await req.json() } catch { return json({ error: "bad_request" }, 400) }
  const slug = String(body.slug || "").trim()
  const key = String(body.key || "").trim()
  if (!slug || !key) return json({ error: "missing" }, 400)

  const sb = serverClient()
  const { data: event } = await sb.from("events")
    .select("id, slug, name, event_date, ends_at, venue_name, location, host_name, target_capacity, min_to_run, sponsor_view_key")
    .eq("slug", slug).maybeSingle()
  if (!event || !event.sponsor_view_key || key !== event.sponsor_view_key) {
    return json({ error: "unauthorized" }, 401)
  }

  const { data: rows } = await sb.from("event_attendees")
    .select("status, invited_at, registered_at, approved_at, responded_at, confirmation_sent_at, people:person_id ( full_name, first_name, last_name, company, email, linkedin_url )")
    .eq("event_id", event.id)
    .order("invited_at", { ascending: true })

  const all = rows || []
  const COMMITTED = new Set(["Confirmed", "Attended", "No-show"])
  // Marsh sees the room coming together: confirmed + still-registered. Silent
  // invitees and anyone who declined / can't make it are left off.
  const SHOW = new Set(["Confirmed", "Attended", "Registered", "Requested"])
  const rank = { Confirmed: 0, Attended: 0, Registered: 1, Requested: 1 }

  const attendees = all
    .filter(r => SHOW.has(r.status))
    .map(r => ({
      name: (r.people && r.people.full_name) || [r.people && r.people.first_name, r.people && r.people.last_name].filter(Boolean).join(" ") || "—",
      company: (r.people && r.people.company) || null,
      email: (r.people && r.people.email) || null,
      linkedin_url: (r.people && r.people.linkedin_url) || null,
      status: r.status === "Requested" ? "Registered" : r.status,
      invited_at: r.invited_at || null,
      registered_at: r.registered_at || null,
      approved_at: r.approved_at || null,
      confirmed_at: (r.status === "Confirmed" || r.status === "Attended") ? (r.responded_at || r.approved_at || null) : null,
    }))
    .sort((a, b) => {
      const ra = rank[a.status] != null ? rank[a.status] : 2
      const rb = rank[b.status] != null ? rank[b.status] : 2
      if (ra !== rb) return ra - rb
      return (a.name || "").localeCompare(b.name || "")
    })

  const stats = {
    confirmed: all.filter(r => COMMITTED.has(r.status)).length,
    registered: all.filter(r => r.status === "Registered" || r.status === "Requested").length,
    invited: all.filter(r => r.status !== "Queued").length,
    target_capacity: event.target_capacity || null,
  }

  return json({
    event: {
      name: event.name, event_date: event.event_date, ends_at: event.ends_at,
      venue_name: event.venue_name, location: event.location, host_name: event.host_name,
    },
    stats,
    attendees,
    generated_at: new Date().toISOString(),
  })
}
