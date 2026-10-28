export const dynamic = "force-dynamic"
export const maxDuration = 30

import { serverClient } from "@/lib/supabaseServer"

// POST /api/people/[id]/happy-hour-dm   { force?: boolean, undo?: boolean }
// One click for the LinkedIn happy-hour invite: returns the approved DM text with THIS person's
// tracked link (the browser copies it to the clipboard) and puts them on the roster as Invited.
// There's no sent-mail feed for a pasted LinkedIn DM, so "copied" is treated as "sent" — flagged as
// source "linkedin-dm" so it's distinguishable from a verified email send, and reversible (undo).

const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"
// "not_a_fit" is about CFO Circle membership fit, not about happy hours — it does NOT block a happy-hour invite.
const BLOCKING = ["do_not_contact", "opted_out", "archived"]
function laLong(iso) { return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "America/Los_Angeles" }) }
function laTime(iso) { return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).replace(":00", "").replace(" PM", "").replace(" AM", "") }

export async function POST(request, { params }) {
  const { id } = await params
  let b = {}
  try { b = await request.json() } catch (e) {}
  const sb = serverClient()

  const { data: person } = await sb.from("people").select("id, first_name, full_name, linkedin_connected").eq("id", id).maybeSingle()
  if (!person) return Response.json({ error: "person not found" }, { status: 404 })

  const { data: ev } = await sb.from("events").select("id, slug, name, event_date, ends_at")
    .eq("kind", "happy_hour").eq("published", true).gte("event_date", new Date().toISOString())
    .order("event_date", { ascending: true }).limit(1).maybeSingle()
  if (!ev) return Response.json({ error: "no_upcoming_happy_hour" }, { status: 404 })

  // ---- undo: "I didn't actually send it" ----
  if (b.undo === true) {
    const { data: row } = await sb.from("event_attendees").select("id, status, source").eq("event_id", ev.id).eq("person_id", id).maybeSingle()
    if (row && row.status === "Invited" && row.source === "linkedin-dm") {
      await sb.from("event_attendees").delete().eq("id", row.id)
      await sb.from("communications").insert({
        person_id: id, occurred_at: new Date().toISOString(), channel: "linkedin", direction: "internal",
        step_label: "LinkedIn DM — happy hour invite marked NOT sent (undo)", body: "Dalen marked the copied happy hour DM as not sent.",
        source: "PeerChair", logged_by: "Dalen Lawrence",
      }).then(() => {}, () => {})
      return Response.json({ ok: true, undone: true })
    }
    return Response.json({ ok: true, undone: false })
  }

  const { data: tags } = await sb.from("person_status_tags").select("tag").eq("person_id", id).is("removed_at", null)
  const blocked = (tags || []).map(t => t.tag).filter(t => BLOCKING.includes(t))
  if (blocked.length) return Response.json({ error: "blocked", tags: blocked }, { status: 409 })

  const { data: existing } = await sb.from("event_attendees").select("id, status, invited_at").eq("event_id", ev.id).eq("person_id", id).maybeSingle()
  if (existing && b.force !== true) return Response.json({ error: "already", status: existing.status, at: existing.invited_at || null }, { status: 409 })

  let token = null
  const { data: ex } = await sb.from("track_tokens").select("token").eq("person_id", id).limit(1).maybeSingle()
  if (ex && ex.token) token = ex.token
  else { const { data: m } = await sb.from("track_tokens").insert({ person_id: id }).select("token").single(); token = m ? m.token : null }
  if (!token) return Response.json({ error: "token_failed" }, { status: 500 })

  const name = String(person.first_name || "").trim()
  const link = SITE + "/events/" + ev.slug + "/?t=" + encodeURIComponent(token) + "&src=linkedin-dm"
  const message =
    (name ? "Hi " + name + "," : "Hi,") + "\n\n" +
    "I’m hosting a CFO happy hour in Culver City on " + laLong(ev.event_date) + ", " + laTime(ev.event_date) + "–" + laTime(ev.ends_at) + " PM, with hospitality from Marsh Agency.\n\n" +
    "No presentations, no pitches, no agenda. Just an evening with other CFOs who understand the seat. Sitting, fractional, or between roles, you’re welcome.\n\n" +
    "Attendance is limited and I confirm each seat personally. Want me to save you a spot?\n\n" +
    link

  const nowIso = new Date().toISOString()
  if (!existing) {
    await sb.from("event_attendees").insert({ event_id: ev.id, person_id: id, status: "Invited", invited_at: nowIso, source: "linkedin-dm" })
  } else if (existing.status === "Queued") {
    await sb.from("event_attendees").update({ status: "Invited", invited_at: nowIso, source: "linkedin-dm" }).eq("id", existing.id)
  }

  await sb.from("communications").insert({
    person_id: id, occurred_at: nowIso, channel: "linkedin", direction: "outbound",
    step_label: "LinkedIn DM — happy hour invite (copied; assumed sent)", body: message,
    source: "PeerChair", logged_by: "Dalen Lawrence",
  }).then(() => {}, () => {})

  return Response.json({ ok: true, message, connected: !!person.linkedin_connected, event: ev.slug })
}
