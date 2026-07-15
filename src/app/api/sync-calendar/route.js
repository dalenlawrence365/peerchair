export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { getAccessToken, graphFetch } from "@/lib/microsoft-auth"
import { logCronRun } from "@/lib/cron-audit"
import { resolvePeopleByEmail } from "@/lib/resolvePeople"

const CFO_CIRCLE_EMAIL = "dalen.lawrence@cfo-circle.com"

// Heuristic — pattern-match the event title to assign a meeting_type.
// Editable downstream; the page UI will let Dalen override per row.
// LEGACY: kept for backwards-compat with old code paths that filter on
// meeting_type. New code reads `meetings.tags` instead.
function inferMeetingType(title, bodyPreview) {
  const t = `${title || ""} ${bodyPreview || ""}`.toLowerCase()
  if (/\bfit\s*(call|chat)\b/.test(t)) return "fit_call"
  if (/\bsponsor\s*discovery\b/.test(t)) return "sponsor_discovery"
  if (/\bchapter\b/.test(t) && /\b(director|lead|peer)\b/.test(t)) return "chapter_peer"
  if (/\b(exploratory|intro|introduction)\b/.test(t)) return "exploratory"
  if (/\b(lunch|dinner|gym|workout|personal|doctor|dentist|family|kids|school)\b/.test(t)) return "personal"
  if (/\b30\s*min(ute)?\b/.test(t) || /\bcfo\s*circle\b/.test(t)) return "exploratory"
  return "other"
}

// Emails that are "me" — filter out of attendee role-walking so the
// meeting doesn't inherit Dalen's own role tags.
const SELF_EMAILS = new Set([
  "dalen.lawrence@cfo-circle.com",
  "dalen.lawrence@stalliant.com",
])

// Title pattern → set of tags. Runs against TITLE ONLY — body_preview is
// too noisy (Calendly event descriptions are full of marketing copy that
// triggers false matches, e.g. 'peer group' and 'chapter' in a CFO Circle
// invite would falsely flag the meeting as chapter_peer).
function titleTags(title, _bodyPreviewIgnored) {
  const t = (title || "").toLowerCase()
  const tags = new Set()

  // Pipeline-bearing — specific phrases only, no loose substring matching
  if (/\bfit\s*(call|chat)\b/.test(t)) tags.add("fit_call")
  if (/\bsponsor\s*discovery\b/.test(t)) tags.add("sponsor_discovery")

  // Troika — Dalen typically starts outgoing invites with "Troika"
  if (/\btroika\b/.test(t)) {
    tags.add("troika")
    tags.add("provisors")
    tags.add("networking")
  }

  // ProVisors group patterns. Affinity Group is the strongest signal —
  // ProVisors brands all their roundtables that way.
  if (/\bprovisors\b/.test(t)) { tags.add("provisors"); tags.add("networking") }
  if (/\baffinity\s*group\b/.test(t)) { tags.add("provisors"); tags.add("networking") }
  if (/\btransactions\s*(&|and|\$)\s*transitions\b/.test(t)) { tags.add("provisors"); tags.add("networking") }
  if (/\bcapital\s*formation\b/.test(t)) { tags.add("provisors"); tags.add("networking") }

  // ACG — word-boundary so it doesn't match unrelated words containing "acg"
  if (/\bacg\b/.test(t)) { tags.add("acg"); tags.add("networking") }

  // Explicit networking signals
  if (/\bmixer\b/.test(t)) { tags.add("mixer"); tags.add("networking") }
  if (/\bnetworking\b/.test(t)) tags.add("networking")
  if (/\bhappy\s*hour\b/.test(t)) tags.add("networking")

  // Internal team
  if (/\bchapter\b/.test(t) && /\b(director|lead|peer)\b/.test(t)) tags.add("chapter_peer")

  // Personal time
  if (/\b(lunch|dinner|gym|workout|personal|doctor|dentist|family|kids|school|buffer|drive|commute)\b/.test(t)) tags.add("personal")

  return tags
}

// Attendees → set of role-derived tags. Walks the attendees array, looks
// up each non-self email in people, and ORs in 'cfo' / 'sponsor' /
// 'referral' for each matched role. If ANY attendee has
// provisors_member=true, also adds 'provisors' and 'networking' tags so
// Troikas and ProVisor meetings auto-classify even when the title doesn't
// contain a recognizable pattern.
async function attendeeRoleTags(sb, attendees) {
  const tags = new Set()
  if (!attendees || !attendees.length) return tags

  const emails = attendees
    .map(a => (a.address || "").toLowerCase().trim())
    .filter(e => e && e.includes("@") && !SELF_EMAILS.has(e))

  if (emails.length === 0) return tags

  const { data: people } = await sb
    .from("people")
    .select("email, roles, provisors_member")
    .in("email", emails)

  for (const p of people || []) {
    for (const r of p.roles || []) {
      if (r === "cfo") tags.add("cfo")
      else if (r === "sponsor_contact") tags.add("sponsor")
      else if (r === "referral_partner") tags.add("referral")
    }
    if (p.provisors_member) {
      tags.add("provisors")
      tags.add("networking")
    }
  }
  return tags
}

// Top-level: combine title patterns + attendee roles into a single tag set.
// Adds 'call' as a baseline for any matched-to-person meeting that isn't
// already pipeline-specific (fit_call / sponsor_discovery), and 'other' as
// the catch-all when nothing matched.
//
// firstTouch=true promotes a generic matched-role meeting to the role's
// discovery tag: CFO first-touch → fit_call, sponsor first-touch →
// sponsor_discovery. This auto-marks the start of each pipeline relationship
// even when the title doesn't explicitly say so. Manual override later if wrong.
async function inferTags(sb, title, bodyPreview, attendees, opts = {}) {
  const tags = new Set([
    ...titleTags(title, bodyPreview),
    ...(await attendeeRoleTags(sb, attendees)),
  ])

  const hasRole = tags.has("cfo") || tags.has("sponsor") || tags.has("referral")
  const hasPipelineType = tags.has("fit_call") || tags.has("sponsor_discovery")

  if (hasRole && !hasPipelineType) {
    if (opts.firstTouch) {
      // First-touch auto-promotion based on the strongest role present.
      // CFO wins over sponsor wins over referral if multiple are present.
      if (tags.has("cfo")) tags.add("fit_call")
      else if (tags.has("sponsor")) tags.add("sponsor_discovery")
      else tags.add("call") // referral first-touch = just a call
    } else {
      tags.add("call")
    }
  }

  // Catch-all so every meeting has at least one tag
  if (tags.size === 0) tags.add("other")

  return Array.from(tags)
}

function normalizeStatus(showAs, isCancelled, title) {
  if (isCancelled) return "canceled"
  // Outlook prepends "Canceled: " to the subject when a meeting is cancelled
  // by an organizer (sometimes via an external system like Calendly) but
  // doesn't always set the isCancelled flag on the meeting attendee's copy.
  // Use the title prefix as a secondary signal.
  if (/^canceled:\s*/i.test(title || "")) return "canceled"
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
  const res = await graphFetch(url, { headers: { Prefer: 'outlook.timezone="UTC"' } })
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
  // Attendees resolve through person_emails — someone who accepts an invite
  // from their work address is still the person you know.
  let emailToPerson = {}
  if (emailList.length) {
    emailToPerson = await resolvePeopleByEmail(sb, emailList)
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

      const status = normalizeStatus(ev.showAs, ev.isCancelled, ev.subject)
      if (status === "canceled") canceled++
      if (personId) matched++

      // First-touch detection: this is the person's earliest meeting if there
      // are no prior meetings (or only this one) for the same person_id with
      // starts_at <= this meeting's starts_at.
      let firstTouch = false
      if (personId) {
        const { count: priorCount } = await sb
          .from("meetings")
          .select("id", { count: "exact", head: true })
          .eq("person_id", personId)
          .lt("starts_at", startTs)
          .neq("external_id", ev.id)
        firstTouch = (priorCount || 0) === 0
      }

      // Check the existing row to respect manual tag edits — never overwrite
      // tags that the user has set explicitly via the meetings-page UI.
      let preserveExistingTags = false
      let existingTags = null
      {
        const { data: existing } = await sb
          .from("meetings")
          .select("tags, tags_manually_edited")
          .eq("external_id", ev.id)
          .maybeSingle()
        if (existing?.tags_manually_edited) {
          preserveExistingTags = true
          existingTags = existing.tags
        }
      }

      const tags = preserveExistingTags
        ? existingTags
        : await inferTags(sb, ev.subject, ev.bodyPreview, attendees, { firstTouch })

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
        tags,
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
