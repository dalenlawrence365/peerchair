/* Touches that don't live in `communications`: emails sent through the invite pipeline
   (with delivery / open / click state), event-page views, and RSVP milestones.
   Returned in the same shape as a communications row so the profile timeline renders
   them with its existing filters. Read-time only: nothing is duplicated into
   communications, so there is one source of truth per touch. */

const KIND_LABEL = { event_invite_cold: "Cold event invite", event_invite: "Event invite" }

export async function touchRows(sb, personId, comms) {
  const rows = []
  const commList = comms || []

  const { data: sends } = await sb.from("email_sends")
    .select("id, event_id, kind, subject, status, error, sent_at").eq("person_id", personId)
  const sendIds = (sends || []).map(s => s.id)
  let evs = []
  if (sendIds.length) {
    const r = await sb.from("email_events").select("email_send_id, event_type, occurred_at, meta").in("email_send_id", sendIds)
    evs = r.data || []
  }

  const { data: att } = await sb.from("event_attendees")
    .select("event_id, status, source, registered_at, responded_at, unavailable_at, unavailable_note").eq("person_id", personId)
  const { data: pv } = await sb.from("page_events")
    .select("page, src, created_at, is_bot").eq("person_id", personId)

  const evIds = Array.from(new Set([].concat((sends || []).map(s => s.event_id), (att || []).map(a => a.event_id)).filter(Boolean)))
  const evName = {}, evSlug = {}
  if (evIds.length) {
    const { data: e } = await sb.from("events").select("id, name, slug").in("id", evIds)
    for (const x of e || []) { evName[x.id] = x.name; evSlug[x.slug] = x.name }
  }

  for (const s of sends || []) {
    // Already mirrored into communications (older invite routes log there)? Don't double up.
    const t = new Date(s.sent_at).getTime()
    const dup = commList.some(c => c.channel === "email" && (c.direction === "outbound" || c.direction === "OUT") && c.subject === s.subject && Math.abs(new Date(c.occurred_at).getTime() - t) < 10 * 60 * 1000)
    if (dup) continue
    const mine = evs.filter(e => e.email_send_id === s.id)
    const opens = mine.filter(e => e.event_type === "opened")
    const clicks = mine.filter(e => e.event_type === "clicked")
    const last = a => a.map(e => e.occurred_at).sort().slice(-1)[0]
    const bits = ["Status: " + (s.status || "sent")]
    if (opens.length) bits.push("opened " + opens.length + "x (last " + new Date(last(opens)).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + ")")
    if (clicks.length) bits.push("clicked " + clicks.length + "x")
    if (s.error) bits.push(String(s.error).slice(0, 160))
    rows.push({
      id: "send_" + s.id, occurred_at: s.sent_at, channel: "email", direction: "outbound",
      step_label: (KIND_LABEL[s.kind] || s.kind || "Email") + (evName[s.event_id] ? " · " + evName[s.event_id] : ""),
      subject: s.subject, body: bits.join(" · "), source: "resend", logged_by: "system",
    })
  }

  // Event-page views, grouped per page so ten refreshes don't become ten rows.
  const byPage = {}
  for (const v of pv || []) {
    if (v.is_bot) continue
    ;(byPage[v.page] = byPage[v.page] || []).push(v)
  }
  for (const page of Object.keys(byPage)) {
    const list = byPage[page].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const slug = String(page).replace(/^event:/, "")
    const srcs = Array.from(new Set(list.map(v => v.src).filter(Boolean)))
    rows.push({
      id: "view_" + page, occurred_at: list[list.length - 1].created_at, channel: "website", direction: "inbound",
      step_label: "Viewed event page", subject: evSlug[slug] || slug,
      body: list.length + (list.length === 1 ? " view" : " views") + (srcs.length ? " · via " + srcs.join(", ") : "") +
        (list.length > 1 ? " · first " + new Date(list[0].created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""),
      source: "site tracking", logged_by: "system",
    })
  }

  // RSVP milestones.
  for (const a of att || []) {
    const nm = evName[a.event_id] || "event"
    if (a.registered_at) rows.push({ id: "reg_" + a.event_id, occurred_at: a.registered_at, channel: "rsvp", direction: "inbound", step_label: "Registered", subject: nm, body: null, source: a.source || "site", logged_by: "system" })
    if (a.unavailable_at) rows.push({ id: "una_" + a.event_id, occurred_at: a.unavailable_at, channel: "rsvp", direction: "inbound", step_label: "Can't attend", subject: nm, body: a.unavailable_note || null, source: a.source || "site", logged_by: "system" })
  }
  return rows
}
