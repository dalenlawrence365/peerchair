export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { getAccessToken } from "@/lib/microsoft-auth"
import { logCronRun } from "@/lib/cron-audit"

const CFO_CIRCLE_EMAIL = "dalen.lawrence@cfo-circle.com"

// Heuristic — pattern-match the event title to assign a meeting_type.
// Editable downstream; the page UI will let Dalen override per row.
function inferMeetingType(title, bodyPreview) {
  const t = `${title || ""} ${bodyPreview || ""}`.toLowerCase()
  if (/\bfit\s*call\b/.test(t)) return "fit_call"
  if (/\b(sponsor|discovery)\b/.test(t)) return "sponsor_discovery"
  if (/\bchapter\b/.test(t) && /\b(director|lead|peer)\b/.test(t)) return "chapter_peer"
  if (/\b(exploratory|intro|introduction)\b/.test(t)) return "exploratory"
  if (/\b(lunch|dinner|gym|workout|personal|doctor|dentist|family|kids|school)\b/.test(t)) return "personal"
  if (/\b30\s*min(ute)?\b/.test(t) || /\bcfo\s*circle\b/.test(t)) return "exploratory"
  return "other"
}

function normalizeStatus(showAs, isCancelled) {
  if (isCancelled) return "canceled"
  if (showAs === "tentative") return "tentative"
  return "scheduled"
}

export async function GET(request) {
  const auth = request.headers.get("authorization") || ""
  const expected = `Bearer ${process.env.CRON_SECRET || "cfocircle2026"}`
  if (auth !== expected) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const sb = serverClient()

  let accessToken
  try { accessToken = await getAccessToken() }
  catch (e) {
    await logCronRun("sync-calendar", "Token refresh failed", [e.message])
    return Response.json({ error: e.message }, { status: 401 })
  }

  // Pull a generous window: 1 day in the past (so just-completed meetings still
  // get tracked) through 90 days forward.
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const end   = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=200&$select=id,subject,bodyPreview,start,end,isAllDay,showAs,isCancelled,location,isOrganizer,attendees,organizer,webLink&$orderby=start/dateTime`
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken, Prefer: 'outlook.timezone="UTC"' },
  })
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    await logCronRun("sync-calendar", "Calendar fetch failed", [`HTTP ${res.status}: ${t.slice(0,200)}`])
    return Response.json({ error: "Calendar fetch failed", status: res.status }, { status: 500 })
  }
  const { value: events } = await res.json()
  if (!events?.length) {
    await logCronRun("sync-calendar", "No calendar events in window")
    return Response.json({ upserted: 0, message: "No events" })
  }

  // Collect all attendee emails to batch-match against people
  const allEmails = new Set()
  for (const ev of events) {
    for (const a of (ev.attendees || [])) {
      const addr = a?.emailAddress?.address?.toLowerCase()
      if (addr && addr !== CFO_CIRCLE_EMAIL.toLowerCase()) allEmails.add(addr)
    }
  }
  const emailList = Array.from(allEmails)
  let emailToPerson = {}
  if (emailList.length) {
    const { data: people } = await sb.from("people").select("id, email").in("email", emailList)
    for (const p of (people || [])) if (p.email) emailToPerson[p.email.toLowerCase()] = p
  }

  let upserted = 0, matched = 0, canceled = 0
  const errors = []

  for (const ev of events) {
    try {
      const startTs = ev.start?.dateTime ? new Date(ev.start.dateTime + (ev.start.dateTime.endsWith("Z") ? "" : "Z")).toISOString() : null
      const endTs   = ev.end?.dateTime   ? new Date(ev.end.dateTime   + (ev.end.dateTime.endsWith("Z")   ? "" : "Z")).toISOString()   : null
      if (!startTs) continue

      // Pick the first attendee that isn't Dalen for person matching
      let personId = null
      const attendees = []
      for (const a of (ev.attendees || [])) {
        const addr = a?.emailAddress?.address?.toLowerCase()
        const name = a?.emailAddress?.name || null
        if (!addr) continue
        attendees.push({ address: addr, name, type: a.type || null, response: a.status?.response || null })
        if (addr !== CFO_CIRCLE_EMAIL.toLowerCase() && !personId) {
          const match = emailToPerson[addr]
          if (match) personId = match.id
        }
      }

      const status = normalizeStatus(ev.showAs, ev.isCancelled)
      if (status === "canceled") canceled++
      if (personId) matched++

      const row = {
        external_id:    ev.id,
        source:         "outlook_calendar",
        title:          ev.subject || "(no title)",
        body_preview:   (ev.bodyPreview || "").slice(0, 2000),
        starts_at:      startTs,
        ends_at:        endTs,
        all_day:        !!ev.isAllDay,
        status,
        location:       ev.location?.displayName || null,
        is_organizer:   !!ev.isOrganizer,
        attendees_json: attendees,
        person_id:      personId,
        meeting_type:   inferMeetingType(ev.subject, ev.bodyPreview),
        updated_at:     new Date().toISOString(),
      }

      const { error: upErr } = await sb.from("meetings").upsert(row, { onConflict: "external_id" })
      if (upErr) { errors.push(upErr.message); continue }
      upserted++
    } catch (e) { errors.push(e.message) }
  }

  await logCronRun(
    "sync-calendar",
    `upserted=${upserted} matched=${matched} canceled=${canceled} window=1d-back/90d-fwd`,
    errors.length ? errors.slice(0, 5) : null,
  )
  return Response.json({ upserted, matched, canceled, errors })
}
