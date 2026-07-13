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
    .select("id, status, invited_at, responded_at, invite_token, person_id, notes, source, registered_at, approved_at, people:person_id ( first_name, last_name, full_name, email, title, company, cfo_state )")
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
    source: r.source || null,
    registered_at: r.registered_at || null,
    approved_at: r.approved_at || null,
    invited_at: r.invited_at,
    responded_at: r.responded_at,
    invite_url: inviteUrl(event.slug, r.invite_token),
  }))

  const count = s => attendees.filter(a => a.status === s).length
  const confirmed = count("Confirmed")
  const registered = count("Registered") + count("Requested")

  return Response.json({
    event,
    attendees,
    counts: {
      invited: attendees.length,
      registered,
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
    .upsert(ids.map(pid => ({ event_id: event.id, person_id: pid, status: "Invited", source: "invited", approved_at: new Date().toISOString() })),
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
    const payload = JSON.stringify({
      subject: "You're in — August 11 CFO Circle workshop",
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to } }],
    })
    function post(tok) {
      return fetch("https://graph.microsoft.com/v1.0/me/messages", {
        method: "POST",
        headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
        body: payload,
      })
    }
    let token = await getAccessToken()
    let res = await post(token)
    if (res.status === 401) {
      // Cached token was rejected as expired — force a fresh one and retry once.
      token = await getAccessToken({ force: true })
      res = await post(token)
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      console.error("invite draft: Graph " + res.status + " " + errText.slice(0, 500))
      return { ok: false, webLink: null, error: "Graph " + res.status + (errText ? (": " + errText.slice(0, 160)) : "") }
    }
    const data = await res.json().catch(() => ({}))
    return { ok: true, webLink: data.webLink || null }
  } catch (e) { console.error("invite draft failed:", e); return { ok: false, webLink: null, error: (e && e.message) || "exception" } }
}

export async function PATCH(req) {
  let body = {}
  try { body = await req.json() } catch { return Response.json({ error: "bad_request" }, { status: 400 }) }

  const id = (body.id || "").toString().trim()
  const status = (body.status || "").toString().trim()
  const ALLOWED = new Set(["Registered", "Invited", "Confirmed", "Declined", "Requested"])
  if (!id || !ALLOWED.has(status)) return Response.json({ error: "bad_request" }, { status: 400 })

  const sb = serverClient()
  const { data: cur } = await sb
    .from("event_attendees")
    .select("id, status, invite_token, event_id, people:person_id ( first_name, email ), events:event_id ( slug )")
    .eq("id", id)
    .maybeSingle()
  if (!cur) return Response.json({ error: "not_found" }, { status: 404 })

  const patch = { status }
  if (status === "Invited" && (cur.status === "Registered" || cur.status === "Requested")) patch.approved_at = new Date().toISOString()
  const { error } = await sb.from("event_attendees").update(patch).eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const slug = cur.events?.slug
  const invite_url = slug ? inviteUrl(slug, cur.invite_token) : null

  // On approval (Requested -> Invited), draft the invite email for review.
  let drafted = false
  let draft_url = null
  let draft_error = null
  if (status === "Invited" && (cur.status === "Registered" || cur.status === "Requested") && cur.people?.email && invite_url) {
    const d = await createInviteDraft({ to: cur.people.email, first_name: cur.people?.first_name, invite_url })
    drafted = d.ok
    draft_url = d.webLink
    draft_error = d.error || null
  }

  return Response.json({ ok: true, status, invite_url, drafted, draft_url, draft_error })
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
