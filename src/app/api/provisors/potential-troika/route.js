export const dynamic = "force-dynamic"
import { graphFetch } from "@/lib/microsoft-auth"

// Pacific UTC offset (in minutes, negative) for a given instant -- reads it
// straight from Intl's tz database so it's correct across DST transitions
// without pulling in a date library.
function pacificOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", timeZoneName: "shortOffset",
  }).formatToParts(date)
  const tzPart = parts.find(p => p.type === "timeZoneName")?.value || "GMT-8"
  const m = tzPart.match(/GMT([+-]\d+)/)
  return m ? parseInt(m[1], 10) * 60 : -480
}

// GET /api/provisors/potential-troika — every future event on Dalen's
// dedicated "Potential Troikas" Outlook calendar: open slots he's holding
// to offer someone for scheduling a Troika.
//
// This is a LIVE Graph call scoped to that one named calendar, not a read
// of the `meetings` table. `meetings` mixes every calendar event tagged
// "troika" by a title-keyword regex -- which also catches genuinely
// scheduled Troikas (e.g. a real "Troika lunch with <name>" on the main
// calendar), and can't reliably distinguish those from open placeholder
// holds. Scoping to the specific calendar sidesteps that entirely: whatever
// is on "Potential Troikas" is, definitionally, a slot Dalen is holding
// open, and nothing else leaks in.
export async function GET() {
  try {
    // Find the "Potential Troikas" calendar's id.
    const calRes = await graphFetch(
      "https://graph.microsoft.com/v1.0/me/calendars?$select=id,name&$top=100"
    )
    if (!calRes.ok) {
      const t = await calRes.text().catch(() => "")
      return Response.json({ error: `Calendar list failed: HTTP ${calRes.status}: ${t.slice(0, 200)}` }, { status: 500 })
    }
    const { value: calendars } = await calRes.json()
    const cal = (calendars || []).find(c => (c.name || "").trim().toLowerCase() === "potential troikas")
      || (calendars || []).find(c => (c.name || "").toLowerCase().includes("potential troika"))
    if (!cal) {
      return Response.json({ error: 'No calendar named "Potential Troikas" found on this account.' }, { status: 404 })
    }

    // "Not including the day I ask" -- compute the start of tomorrow in
    // Pacific time so the cutoff matches what Dalen sees on his own calendar.
    const now = new Date()
    const offsetMin = pacificOffsetMinutes(now)
    const pacificNow = new Date(now.getTime() + offsetMin * 60000)
    const y = pacificNow.getUTCFullYear(), m = pacificNow.getUTCMonth(), d = pacificNow.getUTCDate()
    const start = new Date(Date.UTC(y, m, d + 1, 0, 0, 0) - offsetMin * 60000).toISOString()
    const end = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()

    const evRes = await graphFetch(
      `https://graph.microsoft.com/v1.0/me/calendars/${cal.id}/calendarView` +
      `?startDateTime=${start}&endDateTime=${end}` +
      `&$select=id,subject,start,end,isCancelled,showAs&$orderby=start/dateTime&$top=100`,
      { headers: { Prefer: 'outlook.timezone="UTC"' } }
    )
    if (!evRes.ok) {
      const t = await evRes.text().catch(() => "")
      return Response.json({ error: `Calendar fetch failed: HTTP ${evRes.status}: ${t.slice(0, 200)}` }, { status: 500 })
    }
    const { value: events } = await evRes.json()

    const slots = (events || [])
      .filter(ev => !ev.isCancelled)
      // Only genuinely OPEN slots -- Dalen names them "Potential ___" on
      // purpose. A "Reserved for ___" block on this same calendar means
      // that time is already spoken for (held for a specific in-progress
      // plan), not something to offer to whoever's next -- so it's
      // deliberately excluded here, not just missed.
      .filter(ev => (ev.subject || "").trim().toLowerCase().startsWith("potential"))
      .map(ev => ({
        id: ev.id,
        title: ev.subject || "(no title)",
        starts_at: ev.start?.dateTime ? new Date(ev.start.dateTime + "Z").toISOString() : null,
        ends_at: ev.end?.dateTime ? new Date(ev.end.dateTime + "Z").toISOString() : null,
      }))
      .filter(s => s.starts_at)

    return Response.json({ slots, calendar: cal.name })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
