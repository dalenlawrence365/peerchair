// GET /api/meeting-stats
// Returns meeting counts by type and by week for the last 8 weeks

const CALENDLY_USER = "https://api.calendly.com/users/6e6c3a6f-335a-4520-a3f7-53b42e7d834c"

function classifyEvent(name, slug) {
  var s = (name || slug || "").toLowerCase() // name first — event_type is a UUID URL
  // Sponsor discovery: only when both words are present together (or the
  // hyphenated slug form). Single 'sponsor' alone is too loose — e.g. the
  // generic 30-min event was historically created from a sponsor template
  // and may still carry that word in its display name.
  if (s.includes("sponsor discovery") || s.includes("sponsor-discovery") || s.includes("sponsor_discovery")) return "sponsor_discovery"
  // Fit call/chat: require the specific phrase, not loose 'fit' which
  // could match unrelated event names.
  if (s.includes("fit chat") || s.includes("fit-chat") || s.includes("fit_chat") || s.includes("fit call")) return "fit_call"
  // Everything else (generic 15-min, generic 30-min, ad-hoc events, etc.)
  return "other"
}

function weekKey(iso) {
  var d = new Date(iso)
  var day = d.getDay() // 0 = Sunday
  var monday = new Date(d)
  monday.setDate(d.getDate() - ((day + 6) % 7)) // roll to Monday
  return monday.toISOString().slice(0, 10)
}

function weekLabel(iso) {
  var d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export async function GET() {
  const TOKEN = process.env.CALENDLY_TOKEN
  if (!TOKEN) return Response.json({ error: "No CALENDLY_TOKEN" }, { status: 500 })

  const headers = { "Authorization": "Bearer " + TOKEN }
  const now = new Date()

  // Fetch last 8 weeks + next 4 weeks
  const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 3600000).toISOString()
  const fourWeeksOut  = new Date(now.getTime() + 28 * 24 * 3600000).toISOString()

  let events = []
  try {
    const res = await fetch(
      `https://api.calendly.com/scheduled_events?user=${encodeURIComponent(CALENDLY_USER)}&min_start_time=${eightWeeksAgo}&max_start_time=${fourWeeksOut}&count=100&sort=start_time:asc`,
      { headers }
    )
    if (!res.ok) return Response.json({ error: "Calendly error " + res.status }, { status: 500 })
    const data = await res.json()
    events = data.collection || []
  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 })
  }

  // Classify each event
  const classified = events.map(e => {
    const slug = (e.event_type || "").split("/event_types/").pop()
    return {
      id:         e.uri.split("/scheduled_events/").pop(),
      type:       classifyEvent(e.name, slug),
      start_time: e.start_time,
      status:     e.status,
      week:       weekKey(e.start_time),
      is_past:    new Date(e.start_time) < now,
      is_canceled: e.status === "canceled",
    }
  }).filter(e => !e.is_canceled)

  // Totals by type (all time in window)
  const totals = { fit_call: 0, sponsor_discovery: 0, other: 0 }
  const upcoming = { fit_call: 0, sponsor_discovery: 0, other: 0 }
  classified.forEach(e => {
    totals[e.type]++
    if (!e.is_past) upcoming[e.type]++
  })

  // Current week totals
  const thisWeek = weekKey(now.toISOString())
  const thisWeekCounts = { fit_call: 0, sponsor_discovery: 0, other: 0 }
  classified.filter(e => e.week === thisWeek).forEach(e => thisWeekCounts[e.type]++)

  // Build last 8 weeks + upcoming weeks
  const weekMap = {}
  classified.forEach(e => {
    if (!weekMap[e.week]) weekMap[e.week] = { week: e.week, label: weekLabel(e.week), fit_call: 0, sponsor_discovery: 0, other: 0, is_future: new Date(e.week) > now }
    weekMap[e.week][e.type]++
  })

  // Ensure last 8 weeks all appear (even if empty)
  for (let i = 7; i >= 0; i--) {
    var d = new Date(now)
    d.setDate(d.getDate() - i * 7)
    var wk = weekKey(d.toISOString())
    if (!weekMap[wk]) weekMap[wk] = { week: wk, label: weekLabel(wk), fit_call: 0, sponsor_discovery: 0, other: 0, is_future: false }
  }

  const weeks = Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week))

  // Scheduled = upcoming (not yet happened), Completed = past
  const scheduled = { fit_call: 0, sponsor_discovery: 0, other: 0 }
  const completed = { fit_call: 0, sponsor_discovery: 0, other: 0 }
  classified.forEach(e => {
    if (!e.is_past) scheduled[e.type]++
    else completed[e.type]++
  })

  return Response.json({
    totals,
    upcoming,
    scheduled,
    completed,
    this_week: thisWeekCounts,
    weeks,
    total_meetings: classified.length,
    generated_at: now.toISOString()
  })
}
