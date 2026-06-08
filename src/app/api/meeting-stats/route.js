// GET /api/meeting-stats
// Returns meeting counts by tag, split into past (completed) vs future
// (scheduled). Reads from the `meetings` table — single source of truth
// fed by sync-calendar from Outlook/MS Graph.
//
// Past = starts_at < NOW() AND status != 'canceled' (it happened, didn't cancel)
// Future = starts_at >= NOW() AND status != 'canceled' (booked, not yet)
// Canceled meetings excluded from both.
//
// Returned tags include the umbrella 'networking' aggregate plus
// individual tag counts so the UI can show "10 networking (4 ProVisors,
// 3 ACG, 2 mixers, 1 troika)" style breakdowns.

export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

const STATS_TAGS = [
  "cfo", "sponsor", "referral",
  "fit_call", "sponsor_discovery", "call",
  "networking", "provisors", "acg", "mixer", "troika",
  "chapter_peer", "personal", "other",
]

function weekKey(iso) {
  const d = new Date(iso)
  const day = d.getDay() // 0 = Sunday
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((day + 6) % 7)) // roll to Monday
  return monday.toISOString().slice(0, 10)
}

function weekLabel(iso) {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function emptyTagCounts() {
  const o = {}
  for (const t of STATS_TAGS) o[t] = 0
  return o
}

export async function GET() {
  const sb = serverClient()

  const now = new Date()
  const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 3600000).toISOString()
  const fourWeeksOut  = new Date(now.getTime() + 28 * 24 * 3600000).toISOString()
  const nowIso = now.toISOString()

  // Pull all non-canceled meetings in the window
  const { data: meetings, error } = await sb
    .from("meetings")
    .select("id, starts_at, tags, status")
    .gte("starts_at", eightWeeksAgo)
    .lte("starts_at", fourWeeksOut)
    .neq("status", "canceled")
    .limit(2000)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const past = emptyTagCounts()
  const future = emptyTagCounts()
  const thisWeek = emptyTagCounts()
  const weekMap = {} // weekKey -> { week, label, is_future, counts {} }

  const thisWeekKey = weekKey(nowIso)

  for (const m of meetings || []) {
    if (!m.starts_at) continue
    const isPast = new Date(m.starts_at) < now
    const tags = Array.isArray(m.tags) ? m.tags : []
    const bucket = isPast ? past : future

    for (const tag of tags) {
      if (!STATS_TAGS.includes(tag)) continue
      bucket[tag] = (bucket[tag] || 0) + 1
    }

    // Week-bucket
    const wk = weekKey(m.starts_at)
    if (!weekMap[wk]) weekMap[wk] = { week: wk, label: weekLabel(wk), is_future: new Date(wk) > now, counts: emptyTagCounts() }
    for (const tag of tags) {
      if (!STATS_TAGS.includes(tag)) continue
      weekMap[wk].counts[tag] = (weekMap[wk].counts[tag] || 0) + 1
    }
    if (wk === thisWeekKey) {
      for (const tag of tags) {
        if (!STATS_TAGS.includes(tag)) continue
        thisWeek[tag] = (thisWeek[tag] || 0) + 1
      }
    }
  }

  const weeks = Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week))
  const totalMeetings = (meetings || []).length

  return Response.json({
    past,
    future,
    this_week: thisWeek,
    weeks,
    total_meetings: totalMeetings,
    generated_at: new Date().toISOString(),
  })
}
