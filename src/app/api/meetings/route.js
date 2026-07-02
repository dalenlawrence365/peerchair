// GET /api/meetings — database-backed list of meetings from the new `meetings`
// table (populated by /api/sync-calendar from Microsoft Graph).
//
// This replaces the prior direct-to-Calendly implementation. The Calendly
// integration now lives one layer up: sync-calendar pulls from Outlook (which
// auto-creates events for Calendly bookings), and a Calendly enrichment layer
// can attach invitee/event-uri metadata to the row when needed. Single source
// of truth, single endpoint.

export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

export async function GET(request) {
  const sb = serverClient()
  const url = new URL(request.url)
  const range = url.searchParams.get("range") || "upcoming"  // upcoming | past | all
  const type = url.searchParams.get("type")
  const tag = url.searchParams.get("tag")
  const includePersonal = url.searchParams.get("include_personal") !== "false"
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500)

  let q = sb.from("meetings").select(`
    id, external_id, source, title, body_preview, starts_at, ends_at, all_day,
    status, location, is_organizer, attendees_json, meeting_type, tags, tags_manually_edited, calendly_event_uri,
    person:person_id ( id, full_name, email, roles, cfo_state, sponsor_state, referral_state )
  `)

  if (range === "upcoming") {
    q = q.gte("starts_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
         .order("starts_at", { ascending: true })
  } else if (range === "past") {
    q = q.lt("starts_at", new Date().toISOString())
         .order("starts_at", { ascending: false })
  } else {
    q = q.order("starts_at", { ascending: false })
  }

  if (type) q = q.eq("meeting_type", type)
  if (tag) q = q.contains("tags", [tag])
  if (!includePersonal) q = q.neq("meeting_type", "personal")

  q = q.limit(limit)

  const { data, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Counts for filter chips and upcoming-7d badge
  const { data: tally } = await sb.from("meetings")
    .select("meeting_type, status, starts_at")
    .not("status", "in", "(canceled,completed)")
  const counts = {}
  const now = Date.now()
  const next7 = now + 7 * 24 * 60 * 60 * 1000
  let upcoming_7d = 0
  for (const r of (tally || [])) {
    const k = r.meeting_type || "other"
    counts[k] = (counts[k] || 0) + 1
    const t = new Date(r.starts_at).getTime()
    if (t >= now && t <= next7) upcoming_7d++
  }

  return Response.json({ items: data || [], counts, upcoming_7d })
}
