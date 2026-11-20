export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

const SELF = new Set(["dalen.lawrence@cfo-circle.com"])
const MEETING_TYPES = ["fit_call", "sponsor_discovery", "chapter_peer", "exploratory", "other", "personal"]
const STATUSES = ["scheduled", "tentative", "canceled", "completed"]

// GET /api/meetings/[id]
// The id is either a calendar meeting (`meetings` table: Outlook-synced or manual) or a
// ProVisors group meeting (`provisors_meetings`). Calendar meetings come back as a full
// record: attendees, notes (including the Granola summary/transcript) and suggestions.
export async function GET(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })
  const sb = serverClient()

  const { data: cal, error: calErr } = await sb.from("meetings")
    .select("id, external_id, source, title, body_preview, starts_at, ends_at, all_day, status, location, is_organizer, attendees_json, meeting_type, tags, tags_manually_edited, granola_note_id, granola_url, granola_synced_at, person:person_id ( id, full_name, email )")
    .eq("id", id).maybeSingle()
  if (calErr) return Response.json({ error: calErr.message }, { status: 500 })
  if (cal) return Response.json(await calendarDetail(sb, cal))

  return provisorsMeeting(sb, id)
}

async function calendarDetail(sb, cal) {
  const [{ data: att }, { data: notes }] = await Promise.all([
    sb.from("meeting_attendees")
      .select("role, source, people(id, full_name, email, company, title, roles)")
      .eq("meeting_id", cal.id),
    sb.from("meeting_notes")
      .select("id, body, source, author, created_at")
      .eq("meeting_id", cal.id)
      .order("created_at", { ascending: true }),
  ])
  const attendees = (att || []).filter(r => r.people).map(r => ({ ...r.people, role: r.role, link_source: r.source }))
    .sort((a, b) => (a.role === "organizer" ? -1 : b.role === "organizer" ? 1 : 0) || (a.full_name || "").localeCompare(b.full_name || ""))

  // Calendar invitees who aren't attendees yet: match to a person by email so the page can
  // offer a one-click add. Unmatched invitees come back with person: null.
  const have = new Set(attendees.map(p => (p.email || "").toLowerCase()).filter(Boolean))
  const invitees = (Array.isArray(cal.attendees_json) ? cal.attendees_json : [])
    .map(a => ({ name: a?.name || null, address: (a?.address || "").toLowerCase().trim() }))
    .filter(a => a.address && !SELF.has(a.address) && !have.has(a.address))
  let suggestions = invitees.map(a => ({ ...a, person: null }))
  if (invitees.length) {
    const list = invitees.map(a => a.address)
    const { data: ppl } = await sb.from("people").select("id, full_name, email, email2, company")
      .or(`email.in.(${list.map(e => `"${e}"`).join(",")}),email2.in.(${list.map(e => `"${e}"`).join(",")})`)
    const byEmail = {}
    ;(ppl || []).forEach(p => { [p.email, p.email2].filter(Boolean).forEach(e => { byEmail[e.toLowerCase()] = p }) })
    suggestions = invitees.map(a => ({ ...a, person: byEmail[a.address] || null }))
    const taken = new Set(attendees.map(p => p.id))
    suggestions = suggestions.filter(s => !(s.person && taken.has(s.person.id)))
  }

  const { attendees_json, ...meeting } = cal
  return { kind: "calendar", meeting, attendees, suggestions, notes: notes || [] }
}

async function provisorsMeeting(sb, id) {
  const { data: meeting, error } = await sb.from("provisors_meetings")
    .select("id, meeting_date, label, outlook_event_id, group_id, provisors_groups(name, troika_master_person_id)")
    .eq("id", id).maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!meeting) return Response.json({ error: "Meeting not found" }, { status: 404 })

  const { data: att } = await sb.from("meeting_attendance")
    .select("people(id, full_name, company, title, avatar_url, photo_url, linkedin_url, linkedin_connected, roles, provisors_member, sponsor_state)")
    .eq("meeting_id", id)
  const attendees = (att || []).map(r => r.people).filter(Boolean)
    .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""))

  // Attach each attendee's connection_sent tag date so the grid can show
  // "connection sent · <date>" and the page can count/filter on it. (Manual click and
  // the LinkedHelper sent event both write this tag, so it reflects all requests.)
  const ids = attendees.map(p => p.id)
  if (ids.length) {
    const { data: sentTags } = await sb.from("person_action_tags")
      .select("person_id, set_at")
      .eq("action_type", "connection_sent")
      .in("person_id", ids)
    const sentBy = {}
    ;(sentTags || []).forEach(t => { if (!sentBy[t.person_id] || t.set_at > sentBy[t.person_id]) sentBy[t.person_id] = t.set_at })
    attendees.forEach(p => { p.connection_sent_at = sentBy[p.id] || null })
  }

  return Response.json({
    meeting: {
      id: meeting.id, meeting_date: meeting.meeting_date, label: meeting.label,
      group: meeting.provisors_groups ? meeting.provisors_groups.name : null,
      troika_master_person_id: meeting.provisors_groups ? meeting.provisors_groups.troika_master_person_id : null,
      outlook_event_id: meeting.outlook_event_id,
    },
    attendees,
  })
}

// PATCH /api/meetings/[id]
//   { add: [tag], remove: [tag] }  — tag edits on the meetings list (marks tags as hand-edited so
//                                    the calendar sync stops overwriting them)
//   { meeting_type, status, granola_url } — fields the sync never writes
//   { title, starts_at, ends_at, location, body_preview } — only for meetings created here
//                                    (source "manual"); Outlook-synced rows are re-written by the
//                                    sync, so change those in Outlook.
export async function PATCH(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })
  let b; try { b = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  const sb = serverClient()

  const { data: cur, error: curErr } = await sb.from("meetings").select("id, source, tags").eq("id", id).maybeSingle()
  if (curErr) return Response.json({ error: curErr.message }, { status: 500 })
  if (!cur) return Response.json({ error: "Meeting not found" }, { status: 404 })

  const patch = {}
  if (Array.isArray(b.add) || Array.isArray(b.remove)) {
    const set = new Set(cur.tags || [])
    ;(b.add || []).forEach(t => set.add(String(t)))
    ;(b.remove || []).forEach(t => set.delete(String(t)))
    if (set.size === 0) set.add("other")
    patch.tags = [...set]
    patch.tags_manually_edited = true
  }
  if (b.meeting_type !== undefined) {
    if (!MEETING_TYPES.includes(b.meeting_type)) return Response.json({ error: "invalid meeting_type" }, { status: 400 })
    patch.meeting_type = b.meeting_type
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return Response.json({ error: "invalid status" }, { status: 400 })
    patch.status = b.status
  }
  if (b.granola_url !== undefined) patch.granola_url = b.granola_url ? String(b.granola_url).trim() : null
  if (cur.source === "manual") {
    if (b.title !== undefined) patch.title = String(b.title).trim() || "(no title)"
    if (b.location !== undefined) patch.location = b.location ? String(b.location).trim() : null
    if (b.body_preview !== undefined) patch.body_preview = b.body_preview ? String(b.body_preview).slice(0, 2000) : null
    if (b.starts_at !== undefined) { if (isNaN(new Date(b.starts_at))) return Response.json({ error: "invalid starts_at" }, { status: 400 }); patch.starts_at = new Date(b.starts_at).toISOString() }
    if (b.ends_at !== undefined) patch.ends_at = b.ends_at ? new Date(b.ends_at).toISOString() : null
  }
  if (!Object.keys(patch).length) return Response.json({ error: "nothing to update" }, { status: 400 })
  patch.updated_at = new Date().toISOString()

  const { error } = await sb.from("meetings").update(patch).eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
