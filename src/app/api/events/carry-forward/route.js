export const dynamic = "force-dynamic"

import { serverClient } from "@/lib/supabaseServer"

// People who wanted in and couldn't make a date.
//
// GET  /api/events/carry-forward?exclude_event_slug=<slug>
//   Open promises, minus anyone already on that event's roster — so the list is
//   "who still needs inviting", not "who once said maybe".
// POST /api/events/carry-forward { person_id, event_slug, action: 'fulfil'|'drop' }
//   fulfil — they've been invited to a real event; the promise is kept.
//   drop   — you've decided not to carry them. Recorded, not deleted.
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
  if (!person_id || !["fulfil", "drop"].includes(action)) {
    return Response.json({ error: "person_id and action(fulfil|drop) required" }, { status: 400 })
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
