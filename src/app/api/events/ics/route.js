export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/events/ics?slug=august-11-workshop
// Universal .ics calendar file, generated from the events row so it never drifts.
// Works with Apple Calendar, Outlook, and Google (import). Times are emitted in
// UTC (event_date/ends_at are already stored as UTC timestamps), so every calendar
// app renders the correct local time.

function icsEscape(v) {
  return String(v || "")
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}
function toICSUTC(iso) {
  // 2026-08-11T15:30:00+00:00 -> 20260811T153000Z
  const d = new Date(iso)
  const p = n => String(n).padStart(2, "0")
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "T" +
         p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + "Z"
}

export async function GET(req) {
  const slug = new URL(req.url).searchParams.get("slug") || ""
  if (!slug) return new Response("missing slug", { status: 400 })

  const sb = serverClient()
  const { data: ev, error } = await sb.from("events")
    .select("name, event_date, ends_at, venue_name, address_line, parking_instructions, check_in_instructions, breakfast_note, slug")
    .eq("slug", slug).maybeSingle()
  if (error || !ev) return new Response("not found", { status: 404 })

  const where = [ev.venue_name, ev.address_line].filter(Boolean).join(", ")
  const descParts = [
    "CFO Circle Los Angeles.",
    ev.parking_instructions ? ("Parking: " + ev.parking_instructions) : "",
    ev.check_in_instructions ? ("Check-in: " + ev.check_in_instructions) : "",
    ev.breakfast_note ? ("Breakfast: " + ev.breakfast_note) : "",
    "Details & RSVP: https://la-cfo.com/events/" + ev.slug,
  ].filter(Boolean).join("\n\n")

  const dtstamp = toICSUTC(new Date().toISOString())
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CFO Circle Los Angeles//Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + ev.slug + "@la-cfo.com",
    "DTSTAMP:" + dtstamp,
    "DTSTART:" + toICSUTC(ev.event_date),
    "DTEND:" + toICSUTC(ev.ends_at || ev.event_date),
    "SUMMARY:" + icsEscape(ev.name + " — CFO Circle Los Angeles"),
    "LOCATION:" + icsEscape(where),
    "DESCRIPTION:" + icsEscape(descParts),
    "ORGANIZER;CN=Dalen Lawrence:mailto:dalen.lawrence@cfo-circle.com",
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:" + icsEscape(ev.name),
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  const body = lines.join("\r\n") + "\r\n"
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cfo-circle-' + ev.slug + '.ics"',
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
