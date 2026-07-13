export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { getAccessToken } from "@/lib/microsoft-auth"

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
    .select("id, status, invited_at, responded_at, invite_token, person_id, notes, people:person_id ( first_name, last_name, full_name, email, title, company, cfo_state )")
    .eq("event_id", event.id)
    .order("invited_at", { ascending: true })

  const attendees = (rows || []).map(r => ({
    id: r.id,
    person_id: r.person_id,
    name: r.people?.full_name || [r.people?.first_name, r.people?.last_name].filter(Boolean).join(" "),
    email: r.people?.email || null,
    title: r.people?.title || null,
    company: r.people?.company || null,
    cfo_state: r.people?.cfo_state || null,
    status: r.status,
    notes: r.notes || null,
    invited_at: r.invited_at,
    responded_at: r.responded_at,
    invite_url: inviteUrl(event.slug, r.invite_token),
  }))

  const count = s => attendees.filter(a => a.status === s).length
  const confirmed = count("Confirmed")
  const requested = count("Requested")

  return Response.json({
    event,
    attendees,
    counts: {
      invited: attendees.length,
      requested,
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

async function createInviteDraft({ to, first_name, invite_url }) {
  try {
    const token = await getAccessToken()
    const hi = first_name ? ("Hi " + first_name + ",") : "Hi,"
    const html =
      '<div style="font-family:Georgia,serif;max-width:520px;color:#20242f">' +
      '<p style="font-size:16px;margin:0 0 14px">' + hi + '</p>' +
      '<p style="font-size:15px;line-height:1.6;margin:0 0 14px">Your seat is confirmed for <strong>The 8 Key Drivers of CFO Success</strong> — CFO Circle Los Angeles.</p>' +
      '<p style="font-size:15px;line-height:1.6;margin:0 0 18px">Tuesday, August 11 &middot; 8:30&ndash;11:30 AM &middot; Century City. Tap below for the venue address, parking, and to let me know you will be there.</p>' +
      '<p style="margin:0 0 22px"><a href="' + invite_url + '" style="background:#c39a4e;color:#121a3c;padding:12px 22px;border-radius:3px;text-decoration:none;font-weight:bold;font-family:Arial,sans-serif;font-size:14px">View details &amp; RSVP &rarr;</a></p>' +
      '<p style="font-size:14px;line-height:1.6;color:#54596b;margin:0">Looking forward to it,<br>Dalen Lawrence<br>Chapter Director, CFO Circle Los Angeles</p>' +
      '</div>'
    // POST /me/messages creates a DRAFT (not sent) so Dalen reviews before sending.
    const res = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: "You're in — August 11 CFO Circle workshop",
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      }),
    })
    if (!res.ok) return { ok: false, webLink: null }
    const data = await res.json().catch(() => ({}))
    return { ok: true, webLink: data.webLink || null }
  } catch (e) { console.error("invite draft failed:", e); return { ok: false, webLink: null } }
}

export async function PATCH(req) {
  let body = {}
  try { body = await req.json() } catch { return Response.json({ error: "bad_request" }, { status: 400 }) }

  const id = (body.id || "").toString().trim()
  const status = (body.status || "").toString().trim()
  const ALLOWED = new Set(["Invited", "Confirmed", "Declined", "Requested"])
  if (!id || !ALLOWED.has(status)) return Response.json({ error: "bad_request" }, { status: 400 })

  const sb = serverClient()
  const { data: cur } = await sb
    .from("event_attendees")
    .select("id, status, invite_token, event_id, people:person_id ( first_name, email ), events:event_id ( slug )")
    .eq("id", id)
    .maybeSingle()
  if (!cur) return Response.json({ error: "not_found" }, { status: 404 })

  const { error } = await sb.from("event_attendees").update({ status }).eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const slug = cur.events?.slug
  const invite_url = slug ? inviteUrl(slug, cur.invite_token) : null

  // On approval (Requested -> Invited), draft the invite email for review.
  let drafted = false
  let draft_url = null
  if (status === "Invited" && cur.status === "Requested" && cur.people?.email && invite_url) {
    const d = await createInviteDraft({ to: cur.people.email, first_name: cur.people?.first_name, invite_url })
    drafted = d.ok
    draft_url = d.webLink
  }

  return Response.json({ ok: true, status, invite_url, drafted, draft_url })
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
