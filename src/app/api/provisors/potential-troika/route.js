export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

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

// GET /api/provisors/potential-troika — future "Potential Troika" calendar
// slots (tentative blocks Dalen holds open for prospective Troika formations),
// pulled from the `meetings` table that sync-calendar keeps fresh every 30
// min. Excludes today (Dalen only wants slots he could still offer someone
// going forward) and excludes canceled events.
export async function GET() {
  const sb = serverClient()

  const now = new Date()
  const offsetMin = pacificOffsetMinutes(now)
  // Shift "now" into Pacific wall-clock time, read the Y/M/D off of it, then
  // build "tomorrow 00:00:00 Pacific" and convert that back to a real UTC
  // instant using the same offset.
  const pacificNow = new Date(now.getTime() + offsetMin * 60000)
  const y = pacificNow.getUTCFullYear(), m = pacificNow.getUTCMonth(), d = pacificNow.getUTCDate()
  const cutoff = new Date(Date.UTC(y, m, d + 1, 0, 0, 0) - offsetMin * 60000).toISOString()

  const { data, error } = await sb.from("meetings")
    .select("id, title, starts_at, ends_at, location, status")
    .contains("tags", ["troika"])
    .neq("status", "canceled")
    .gte("starts_at", cutoff)
    .order("starts_at", { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ slots: data || [] })
}
