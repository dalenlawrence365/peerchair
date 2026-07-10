export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* Admin-side attendee management. Same-origin (PeerChair UI) only — no CORS.

   GET  /api/events/attendees?slug=august-11-workshop
        → event + attendee rows with ready-to-paste tokenized invite URLs,
          plus counts. This is the only place the confirmed count is visible.

   POST /api/events/attendees  { slug, person_ids: [uuid, ...] }
        → idempotently creates Invited rows. Re-posting an existing person is
          a no-op, so a fat-fingered double-click never re-tokenizes someone
          and invalidates an invitation already sitting in their inbox.

   DELETE /api/events/attendees?id=<attendee_id>
        → removes an invitation before it goes out.
*/

const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"

function inviteUrl(slug, token) {
  return `${SITE}/events/${slug}?t=${encodeURIComponent(token)}`
}

export async function GET(req) {
  const url = new URL(req.url)
  const slug = (url.searchParams.get("slug") || "").trim()
  const sb = serverClient()

  const { data: event } = await sb
    .from("events")
    .select("id, slug, name, event_date, ends_at, target_capacity, min_to_run, status")
    .eq("slug", slug)
    .maybeSingle()

  if (!event) return Response.json({ error: "not_found" }, { status: 404 })

  const { data: rows } = await sb
    .from("event_attendees")
    .select("id, status, invited_at, responded_at, invite_token, person_id, people:person_id ( first_name, last_name, full_name, email, title, cfo_state )")
    .eq("event_id", event.id)
    .order("invited_at", { ascending: true })

  const attendees = (rows || []).map(r => ({
    id: r.id,
    person_id: r.person_id,
    name: r.people?.full_name || [r.people?.first_name, r.people?.last_name].filter(Boolean).join(" "),
    email: r.people?.email || null,
    title: r.people?.title || null,
    cfo_state: r.people?.cfo_state || null,
    status: r.status,
    invited_at: r.invited_at,
    responded_at: r.responded_at,
    invite_url: inviteUrl(event.slug, r.invite_token),
  }))

  const count = s => attendees.filter(a => a.status === s).length
  const confirmed = count("Confirmed")

  return Response.json({
    event,
    attendees,
    counts: {
      invited: attendees.length,
      confirmed,
      declined: count("Declined"),
      no_response: count("Invited"),
      // The go/no-go number. Manual: do not run under 8 confirmed CFOs.
      short_of_minimum: Math.max(0, (event.min_to_run || 8) - confirmed),
    },
  })
}

export async function POST(req) {
  let body = {}
  try { body = await req.json() } catch { return Response.json({ error: "bad_request" }, { status: 400 }) }

  const slug = (body.slug || "").toString().trim()
  const ids = Array.isArray(body.person_ids) ? body.person_ids.filter(Boolean) : []
  if (!ids.length) return Response.json({ error: "no_people" }, { status: 400 })

  const sb = serverClient()
  const { data: event } = await sb.from("events").select("id, slug").eq("slug", slug).maybeSingle()
  if (!event) return Response.json({ error: "not_found" }, { status: 404 })

  // ignoreDuplicates → the (event_id, person_id) unique index makes this safe
  // to call repeatedly. Existing tokens are preserved.
  const { error } = await sb
    .from("event_attendees")
    .upsert(ids.map(pid => ({ event_id: event.id, person_id: pid, status: "Invited" })),
            { onConflict: "event_id,person_id", ignoreDuplicates: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const { data: rows } = await sb
    .from("event_attendees")
    .select("person_id, invite_token")
    .eq("event_id", event.id)
    .in("person_id", ids)

  return Response.json({
    ok: true,
    added: (rows || []).map(r => ({ person_id: r.person_id, invite_url: inviteUrl(event.slug, r.invite_token) })),
  })
}

export async function DELETE(req) {
  const url = new URL(req.url)
  const id = (url.searchParams.get("id") || "").trim()
  if (!id) return Response.json({ error: "bad_request" }, { status: 400 })

  const sb = serverClient()
  const { error } = await sb.from("event_attendees").delete().eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
