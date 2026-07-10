export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* Public, cross-origin endpoint for la-cfo.com event pages.

   GET  /api/events/invite?slug=august-11-workshop&t=inv_xxx
        → always returns the PUBLIC event payload (200), plus the private
          block (address, parking, first name, current RSVP) only when the
          token resolves to an attendee row for that event.

   POST /api/events/invite  { slug, t, response: "Confirmed" | "Declined" }
        → records the RSVP. Requires a valid token. Never creates attendees.

   Design notes:
   - An unknown / malformed / foreign token is NOT an error. It falls back to
     the public payload silently. A CFO who mangled a URL should see a good
     page, not a failure state.
   - invite_token is per-event and distinct from people.track_token. A
     forwarded invite compromises one event, not the attribution graph.
   - The token identifies; it does not authenticate. Address + parking are the
     only gated fields, and neither is a secret worth a login screen.
*/

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

const VALID_RESPONSES = new Set(["Confirmed", "Declined"])

function json(body, status = 200) {
  return Response.json(body, { status, headers: CORS })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

function publicEvent(e) {
  return {
    slug: e.slug,
    name: e.name,
    summary: e.summary,
    starts_at: e.event_date,
    ends_at: e.ends_at,
    location: e.location,          // "Century City, Los Angeles" — no street
    host_name: e.host_name,
    host_logo_url: e.host_logo_url,
    agenda: e.agenda || [],
    capacity_label: "12–20 CFOs and senior finance leaders",
  }
}

async function loadEvent(sb, slug) {
  if (!slug || !/^[\w-]{1,64}$/.test(slug)) return null
  const { data } = await sb
    .from("events")
    .select("id, slug, name, summary, event_date, ends_at, location, venue_name, address_line, parking_instructions, host_name, host_logo_url, agenda, published")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle()
  return data || null
}

async function loadAttendee(sb, eventId, token) {
  if (!token || !/^inv_[\w+/=_-]{4,64}$/.test(token)) return null
  const { data } = await sb
    .from("event_attendees")
    .select("id, status, responded_at, person_id, people:person_id ( first_name, full_name )")
    .eq("event_id", eventId)
    .eq("invite_token", token)
    .maybeSingle()
  return data || null
}

export async function GET(req) {
  const url = new URL(req.url)
  const slug = (url.searchParams.get("slug") || "").trim()
  const token = (url.searchParams.get("t") || "").trim()

  const sb = serverClient()
  const event = await loadEvent(sb, slug)
  if (!event) return json({ error: "not_found" }, 404)

  const payload = { event: publicEvent(event), invited: false }

  const attendee = token ? await loadAttendee(sb, event.id, token) : null
  if (attendee) {
    payload.invited = true
    payload.status = attendee.status
    payload.responded_at = attendee.responded_at
    payload.first_name = attendee.people?.first_name || null
    payload.private = {
      venue_name: event.venue_name,
      address_line: event.address_line,
      parking_instructions: event.parking_instructions,
    }
  }

  return json(payload)
}

export async function POST(req) {
  let body = {}
  try { body = await req.json() } catch { return json({ error: "bad_request" }, 400) }

  const slug = (body.slug || "").toString().trim()
  const token = (body.t || body.token || "").toString().trim()
  const response = (body.response || "").toString().trim()

  if (!VALID_RESPONSES.has(response)) return json({ error: "bad_response" }, 400)

  const sb = serverClient()
  const event = await loadEvent(sb, slug)
  if (!event) return json({ error: "not_found" }, 404)

  const attendee = await loadAttendee(sb, event.id, token)
  // No token → no RSVP. The public page never surfaces these buttons anyway.
  if (!attendee) return json({ error: "not_invited" }, 403)

  // Terminal states set by Dalen on the day are never overwritten by a click.
  if (attendee.status === "Attended" || attendee.status === "No-show") {
    return json({ ok: true, status: attendee.status })
  }

  const { error } = await sb
    .from("event_attendees")
    .update({ status: response, responded_at: new Date().toISOString() })
    .eq("id", attendee.id)

  if (error) return json({ error: "update_failed" }, 500)

  // Attribution: RSVPs land in the same stream as every other page event so
  // /traffic can answer "which source produced confirmations", not just views.
  await sb.from("page_events").insert({
    person_id: attendee.person_id,
    token: null,
    event: response === "Confirmed" ? "rsvp_confirmed" : "rsvp_declined",
    page: `event:${event.slug}`,
    src: (body.src || "").toString().slice(0, 64) || null,
    is_bot: false,
    user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
  })

  return json({ ok: true, status: response })
}
