export const dynamic = "force-dynamic"
export const maxDuration = 60

import { serverClient } from "@/lib/supabaseServer"
import { logCronRun } from "@/lib/cron-audit"

// GET  /api/sync-granola  -- cron (30 min, see vercel.json), CRON_SECRET required
// POST /api/sync-granola  -- on-demand, no auth (same pattern as sync-calendar's
//                            manual "Refresh" -- safe to expose because it only
//                            reads Granola + writes meeting_notes, same as every
//                            other same-origin route in this app)
//
// Pulls recently-updated Granola notes, matches each one to a row in `meetings`
// (synced from Outlook by sync-calendar) by shared attendee email + a close
// start time, and drops the note's AI summary into `meeting_notes` with
// source="granola" -- the same table/column the Meetings-tab "paste a Granola
// summary" box already writes to, so this just automates what Dalen was doing
// by hand. Idempotent: the Granola note id is stashed in meeting_notes.author
// (author is otherwise unused/unrendered for auto-inserted notes) so a note
// already synced is never inserted twice, even though the 48h lookback window
// re-fetches it on every run.
//
// Requires GRANOLA_API_KEY (Settings -> Connectors -> API keys in the Granola
// desktop app, Business plan). If it isn't set, this is a deliberate no-op --
// not a failure -- so cron-health doesn't page Dalen for a feature he hasn't
// finished wiring up yet.

const GRANOLA_API = "https://public-api.granola.ai/v1"
const LOOKBACK_HOURS = 48
const MATCH_WINDOW_MIN = 90 // how far a granola calendar_event start time may drift from meetings.starts_at and still count as the same event

// Emails that are "me" -- present on virtually every meeting, so on their own
// they're not useful for disambiguating between two candidate meetings that
// both happen to fall in the same time window (rare, but two back-to-back
// calls can both be "within 90 min" of a given start time).
const SELF_EMAILS = new Set([
  "dalen.lawrence@cfo-circle.com",
  "dalen.lawrence@stalliant.com",
])

function granolaHeaders() {
  return { Authorization: `Bearer ${process.env.GRANOLA_API_KEY}` }
}

export async function GET(request) {
  const auth = request.headers.get("authorization") || ""
  const expected = `Bearer ${process.env.CRON_SECRET || "cfocircle2026"}`
  if (auth !== expected) return Response.json({ error: "Unauthorized" }, { status: 401 })
  return doSync()
}

export async function POST(request) {
  return doSync()
}

async function doSync() {
  if (!process.env.GRANOLA_API_KEY) {
    await logCronRun("sync-granola", "Skipped -- GRANOLA_API_KEY not configured", null)
    return Response.json({ skipped: "GRANOLA_API_KEY not configured" })
  }

  const sb = serverClient()
  const errors = []
  let checked = 0, inserted = 0, skippedNoSummary = 0, skippedNoEvent = 0, skippedNoMatch = 0

  // 1. Pull every note updated in the lookback window (paginated).
  const updatedAfter = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()
  let noteSummaries = []
  try {
    let cursor = null
    do {
      const url = new URL(GRANOLA_API + "/notes")
      url.searchParams.set("updated_after", updatedAfter)
      url.searchParams.set("page_size", "30")
      if (cursor) url.searchParams.set("cursor", cursor)
      const res = await fetch(url, { headers: granolaHeaders() })
      if (!res.ok) {
        const t = await res.text().catch(() => "")
        throw new Error(`List notes HTTP ${res.status}: ${t.slice(0, 200)}`)
      }
      const j = await res.json()
      noteSummaries = noteSummaries.concat(j.notes || [])
      cursor = j.hasMore ? j.cursor : null
    } while (cursor)
  } catch (e) {
    errors.push("List notes failed: " + e.message)
    await logCronRun("sync-granola", `checked=0 inserted=0`, errors)
    return Response.json({ error: e.message }, { status: 500 })
  }

  if (!noteSummaries.length) {
    await logCronRun("sync-granola", "No notes updated in lookback window")
    return Response.json({ checked: 0, inserted: 0 })
  }

  // 2. Skip notes we've already synced -- author stores "granola:<note_id>"
  //    for every auto-inserted row, so this is a single cheap query up front
  //    instead of a per-note existence check.
  const { data: alreadySynced } = await sb
    .from("meeting_notes")
    .select("author")
    .eq("source", "granola")
    .like("author", "granola:%")
  const syncedIds = new Set((alreadySynced || []).map(function (r) { return (r.author || "").slice("granola:".length) }))
  const toCheck = noteSummaries.filter(function (n) { return !syncedIds.has(n.id) })

  for (const summary of toCheck) {
    checked++
    let note
    try {
      const res = await fetch(`${GRANOLA_API}/notes/${summary.id}`, { headers: granolaHeaders() })
      if (!res.ok) {
        const t = await res.text().catch(() => "")
        errors.push(`Get note ${summary.id} HTTP ${res.status}: ${t.slice(0, 150)}`)
        continue
      }
      note = await res.json()
    } catch (e) {
      errors.push(`Get note ${summary.id} failed: ${e.message}`)
      continue
    }

    if (!note.summary_text) { skippedNoSummary++; continue }
    if (!note.calendar_event || !note.calendar_event.scheduled_start_time) { skippedNoEvent++; continue }

    const ce = note.calendar_event
    const inviteeEmails = new Set()
    for (const inv of (ce.invitees || [])) { if (inv.email) inviteeEmails.add(inv.email.toLowerCase()) }
    if (ce.organiser) inviteeEmails.add(ce.organiser.toLowerCase())
    for (const a of (note.attendees || [])) { if (a.email) inviteeEmails.add(a.email.toLowerCase()) }

    const nonSelfEmails = Array.from(inviteeEmails).filter(function (e) { return !SELF_EMAILS.has(e) })
    if (!nonSelfEmails.length) { skippedNoMatch++; continue }

    const startMs = new Date(ce.scheduled_start_time).getTime()
    const windowStart = new Date(startMs - MATCH_WINDOW_MIN * 60 * 1000).toISOString()
    const windowEnd = new Date(startMs + MATCH_WINDOW_MIN * 60 * 1000).toISOString()

    const { data: candidates, error: candErr } = await sb
      .from("meetings")
      .select("id, starts_at, attendees_json")
      .gte("starts_at", windowStart)
      .lte("starts_at", windowEnd)
    if (candErr) { errors.push(`Candidate lookup for ${summary.id} failed: ${candErr.message}`); continue }

    let best = null, bestDiff = Infinity
    for (const m of (candidates || [])) {
      const meetingEmails = new Set((m.attendees_json || []).map(function (a) { return (a.address || "").toLowerCase() }))
      const overlaps = nonSelfEmails.some(function (e) { return meetingEmails.has(e) })
      if (!overlaps) continue
      const diff = Math.abs(new Date(m.starts_at).getTime() - startMs)
      if (diff < bestDiff) { bestDiff = diff; best = m }
    }

    if (!best) { skippedNoMatch++; continue }

    const body = note.summary_text + (note.web_url ? `\n\n— Synced from Granola: ${note.web_url}` : "")
    const { error: insErr } = await sb.from("meeting_notes").insert({
      meeting_id: best.id,
      body,
      source: "granola",
      author: "granola:" + note.id,
    })
    if (insErr) { errors.push(`Insert for note ${note.id} -> meeting ${best.id} failed: ${insErr.message}`); continue }
    inserted++
  }

  await logCronRun(
    "sync-granola",
    `checked=${checked} inserted=${inserted} no_summary=${skippedNoSummary} no_event=${skippedNoEvent} no_match=${skippedNoMatch}`,
    errors.length ? errors.slice(0, 5) : null,
  )
  return Response.json({ checked, inserted, skippedNoSummary, skippedNoEvent, skippedNoMatch, errors })
}
