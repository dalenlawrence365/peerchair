export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"
import { corsResponse, handleOptions } from "@/lib/cors"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { graphFetch } from "@/lib/microsoft-auth"

export async function OPTIONS() { return handleOptions() }

// LA-related keywords to identify days Dalen is in LA
const LA_KEYWORDS = [
  'los angeles', ' la ', 'santa monica', 'century city', 'beverly hills',
  'west hollywood', 'culver city', 'el segundo', 'manhattan beach',
  'hermosa beach', 'redondo beach', 'torrance', 'long beach', 'pasadena',
  'burbank', 'glendale', 'studio city', 'sherman oaks', 'encino',
  'woodland hills', 'calabasas', 'provisors', 'troika'
]

function isLAEvent(event) {
  const text = [
    event.subject || '',
    event.location?.displayName || '',
    event.body?.content || '',
    event.bodyPreview || ''
  ].join(' ').toLowerCase()
  return LA_KEYWORDS.some(kw => text.includes(kw))
}

export async function GET(request) {
  if (!verifyGptActionKey(request)) {
    return corsResponse({ error: "Unauthorized" }, { status: 401 })
  }

  const sb = serverClient()

  // Calculate 8-25 day window in PST
  const now = new Date()
  const start = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)
  const end = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000)

  // graphFetch force-refreshes and retries once on 401 — a raw fetch here
  // silently returned "no availability" whenever the stored token was stale.
  let res
  try {
    res = await graphFetch(
      `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$select=subject,start,end,location,bodyPreview&$orderby=start/dateTime&$top=100`,
      { headers: { Prefer: 'outlook.timezone="America/Los_Angeles"' } }
    )
  } catch (e) {
    return corsResponse({ error: e.message }, { status: 401 })
  }

  if (!res.ok) {
    const err = await res.text()
    return corsResponse({ error: "Calendar fetch failed: " + err }, { status: 500 })
  }

  const { value: events } = await res.json()

  // Find LA days
  const laDays = new Set()
  const allBusyDays = new Set()

  for (const event of (events || [])) {
    const date = event.start.dateTime?.split('T')[0]
    if (!date) continue
    allBusyDays.add(date)
    if (isLAEvent(event)) laDays.add(date)
  }

  // Build Thursday list as fallback
  const thursdays = []
  const cursor = new Date(start)
  while (cursor <= end) {
    if (cursor.getDay() === 4) { // Thursday
      thursdays.push(cursor.toISOString().split('T')[0])
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  // Preferred days: LA days first, then Thursdays
  const laDaysArray = [...laDays].sort()
  const thursdayFallbacks = thursdays.filter(d => !laDays.has(d))

  return corsResponse({
    window_start: start.toISOString().split('T')[0],
    window_end: end.toISOString().split('T')[0],
    la_days: laDaysArray,
    thursday_fallbacks: thursdayFallbacks,
    preferred_days: laDaysArray.length > 0 ? laDaysArray : thursdayFallbacks,
    note: laDaysArray.length > 0
      ? `Found ${laDaysArray.length} LA day(s) in window. Use these for in-person troikas.`
      : `No LA days detected. Defaulting to Thursday(s): ${thursdayFallbacks.join(', ')}`
  })
}
