export const dynamic = "force-dynamic"

import { serverClient } from "@/lib/supabaseServer"

// People who wanted in and couldn't make a date.
//
// GET  /api/events/carry-forward?exclude_event_slug=<slug>
//   Open promises, minus anyone already on that event's roster — so the list is
//   "who still needs inviting", not "who once said maybe".
// POST /api/events/carry-forward { person_id, action: 'not_qualified' }
//   not_qualified — you researched them and they don't fit. Tags them not_a_fit (the
//   same pill as everywhere else), closes the promise for good, and takes them off
//   any Queued list. They never reappear here.
// POST /api/events/carry-forward { person_id, event_slug, action: 'fulfil'|'drop' }
//   fulfil — they've been invited to a real event; the promise is kept.
//   drop   — you've decided not to carry them. Recorded, not deleted.
// People who were judged not a fit / asked not to be contacted never belong on a
// "who still needs inviting" list, whatever promise is still open on them.
const BLOCKING_TAGS = ["not_a_fit", "do_not_contact", "opted_out", "archived"]

export async function GET(request) {
  const sb = serverClient()
  const url = new URL(request.url)
  const excludeSlug = url.searchParams.get("exclude_event_slug")

  const { data: rows, error } = await sb
    .from("event_carry_forward")
    .select("id, person_id, from_event_id, reason, promised, created_at, people:person_id ( full_name, email, title, company, cfo_state, linkedin_url, linkedin_connected ), events:from_event_id ( name, event_date )")
    .is("fulfilled_at", null)
    .order("created_at", { ascending: true })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  let waiting = rows || []

  const personIds = waiting.map(function (w) { return w.person_id })
  if (personIds.length) {
    const { data: blockedRows } = await sb.from("person_status_tags")
      .select("person_id").in("person_id", personIds).in("tag", BLOCKING_TAGS).is("removed_at", null)
    const blocked = new Set((blockedRows || []).map(function (r) { return r.person_id }))
    waiting = waiting.filter(function (w) { return !blocked.has(w.person_id) })
  }

  if (excludeSlug) {
    const { data: ev } = await sb.from("events").select("id").eq("slug", excludeSlug).maybeSingle()
    if (ev) {
      const { data: onRoster } = await sb.from("event_attendees")
        .select("person_id").eq("event_id", ev.id)
      const already = new Set((onRoster || []).map(function (r) { return r.person_id }))
      waiting = waiting.filter(function (w) { return !already.has(w.person_id) })
    }
  }

  return Response.json({
    waiting: waiting.map(function (w) {
      return {
        id: w.id,
        person_id: w.person_id,
        full_name: w.people ? w.people.full_name : "(unknown)",
        email: w.people ? w.people.email : null,
        title: w.people ? w.people.title : null,
        company: w.people ? w.people.company : null,
        linkedin_url: w.people ? w.people.linkedin_url : null,
        reason: w.reason,
        promised: w.promised,
        waiting_since: w.created_at,
        from_event: w.events ? w.events.name : null,
        from_event_date: w.events ? w.events.event_date : null,
      }
    }),
    count: waiting.length,
  })
}

export async function POST(request) {
  const sb = serverClient()
  const body = await request.json().catch(function () { return {} })
  const { person_id, event_slug, action } = body
  if (!person_id || !["fulfil", "drop", "not_qualified"].includes(action)) {
    return Response.json({ error: "person_id and action(fulfil|drop|not_qualified) required" }, { status: 400 })
  }

  if (action === "not_qualified") {
    const { data: has } = await sb.from("person_status_tags")
      .select("id").eq("person_id", person_id).eq("tag", "not_a_fit").is("removed_at", null).limit(1)
    if (!has || !has.length) {
      const { error: tErr } = await sb.rpc("set_status_tag", {
        p_person_id: person_id, p_tag: "not_a_fit", p_set_by: "events",
        p_notes: "Marked not qualified from the event carry-forward / queue list.",
      })
      if (tErr) return Response.json({ error: tErr.message }, { status: 500 })
    }
    await sb.from("event_carry_forward").update({ fulfilled_at: new Date().toISOString() })
      .eq("person_id", person_id).is("fulfilled_at", null)
    await sb.from("event_attendees").delete().eq("person_id", person_id).eq("status", "Queued")
    return Response.json({ ok: true, action })
  }

  let eventId = null
  if (event_slug) {
    const { data: ev } = await sb.from("events").select("id").eq("slug", event_slug).maybeSingle()
    eventId = ev ? ev.id : null
  }

  const { error } = await sb.from("event_carry_forward")
    .update({ fulfilled_at: new Date().toISOString(), fulfilled_event_id: eventId })
    .eq("person_id", person_id)
    .is("fulfilled_at", null)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true, action })
}
