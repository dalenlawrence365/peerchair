export const dynamic = "force-dynamic"
export const maxDuration = 60

import { serverClient } from "@/lib/supabaseServer"
import { graphFetch } from "@/lib/microsoft-auth"
import { renderHappyHourHtml, renderWarmHappyHourHtml, HAPPY_HOUR_SUBJECT, WARM_SUBJECT } from "@/lib/happyHourEmail"

// POST /api/people/[id]/happy-hour-draft
// One click: puts the approved happy-hour HTML email into Dalen's Outlook Drafts
// (never sends), addressed to this person, with THEIR tracked RSVP link and
// tracked invitation-list link. Logs a "draft created" row on their timeline.

const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"
const PC = "https://www.peerchair.com"
const BLOCKING = ["not_a_fit", "do_not_contact", "opted_out", "archived"]

function laLong(iso) { return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Los_Angeles" }) }
function laShort(iso) { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }) }
function laTime(iso) { return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).replace(":00", "") }

export async function POST(request, { params }) {
  const { id } = await params
  let body = {}
  try { body = await request.json() } catch (e) {}
  const warm = body && body.variant === "warm"
  const sb = serverClient()

  const { data: person } = await sb.from("people").select("id, first_name, full_name, email, email2").eq("id", id).maybeSingle()
  if (!person) return Response.json({ error: "person not found" }, { status: 404 })
  const email = (person.email && person.email.trim()) || (person.email2 && person.email2.trim())
  if (!email) return Response.json({ error: "no_email" }, { status: 400 })

  const { data: tags } = await sb.from("person_status_tags").select("tag").eq("person_id", id)
  const blocked = (tags || []).map(t => t.tag).filter(t => BLOCKING.includes(t))
  if (blocked.length) return Response.json({ error: "blocked", tags: blocked }, { status: 409 })

  const { data: ev } = await sb.from("events").select("id, slug, name, event_date, ends_at")
    .eq("kind", "happy_hour").eq("published", true).gte("event_date", new Date().toISOString())
    .order("event_date", { ascending: true }).limit(1).maybeSingle()
  if (!ev) return Response.json({ error: "no_upcoming_happy_hour" }, { status: 404 })

  let token = null
  const { data: ex } = await sb.from("track_tokens").select("token").eq("person_id", id).limit(1).maybeSingle()
  if (ex && ex.token) token = ex.token
  else {
    const { data: m } = await sb.from("track_tokens").insert({ person_id: id }).select("token").single()
    token = m ? m.token : null
  }
  if (!token) return Response.json({ error: "token_failed" }, { status: 500 })

  const timeLine = laTime(ev.event_date) + "–" + laTime(ev.ends_at)
  const html = (warm ? renderWarmHappyHourHtml : renderHappyHourHtml)({
    first_name: person.first_name || "",
    when_long: laLong(ev.event_date), time_line: timeLine,
    preheader: laShort(ev.event_date) + ", " + timeLine + ", Culver City. Complimentary. No agenda, no pitches.",
    rsvp_url: SITE + "/events/" + ev.slug + "/?t=" + encodeURIComponent(token) + "&src=" + (warm ? "email-warm" : "email"),
    list_url: SITE + "/invitations/?t=" + encodeURIComponent(token) + "&src=email",
    unsub_url: PC + "/api/unsubscribe?t=" + encodeURIComponent(token),
  })

  let res
  try {
    res = await graphFetch("https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: warm ? WARM_SUBJECT : HAPPY_HOUR_SUBJECT,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: email } }],
      }),
    })
  } catch (e) { return Response.json({ error: String(e.message || e), needs_auth: true }, { status: 401 }) }
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    return Response.json({ error: "Graph " + res.status, detail: t.slice(0, 300) }, { status: 502 })
  }
  const d = await res.json().catch(() => ({}))

  await sb.from("communications").insert({
    person_id: id, occurred_at: new Date().toISOString(), channel: "email", direction: "outbound",
    step_label: "Draft Created — " + ev.name + " invite", body: warm ? WARM_SUBJECT : HAPPY_HOUR_SUBJECT,
    source: "PeerChair", logged_by: "Dalen Lawrence", send_status: "draft",
  }).then(() => {}, () => {})

  // Drafted but NOT sent -> show "Queued" on the roster/profile (never "Invited"; that only happens
  // when sync-sent sees the email in Sent Items). Existing rows (Invited, Registered, ...) are untouched.
  try {
    const { data: row } = await sb.from("event_attendees").select("id").eq("event_id", ev.id).eq("person_id", id).maybeSingle()
    if (!row) await sb.from("event_attendees").insert({ event_id: ev.id, person_id: id, status: "Queued", source: "queued" })
  } catch (e) { console.error("happy-hour-draft queue mark failed:", e && e.message) }

  return Response.json({ ok: true, draft_url: d.webLink || null, to: email, event: ev.slug })
}
