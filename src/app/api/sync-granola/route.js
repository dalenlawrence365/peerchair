import { cronSecret } from "@/lib/cronAuth"
export const dynamic = "force-dynamic"
export const maxDuration = 60

import { serverClient } from "@/lib/supabaseServer"
import { logCronRun } from "@/lib/cron-audit"

// GET  /api/sync-granola        -- cron (once a day, see vercel.json), CRON_SECRET required
// POST /api/sync-granola        -- the "Sync Granola" button on the Meetings page; same-origin,
//                                  no auth (same pattern as sync-calendar's Refresh). Optional JSON
//                                  body { hours } sets the lookback (default 72, max 720).
//
// Pulls recently-updated Granola notes and attaches each to the calendar meeting it belongs to
// (shared invite email + a close start time). For each matched meeting it:
//   - links the note (meetings.granola_note_id / granola_url)
//   - saves the AI summary and the transcript as meeting_notes (source granola_summary /
//     granola_transcript). Existing text is never overwritten, so hand edits survive re-syncs.
//   - adds everyone on the Granola note who is already in PeerChair (matched by email) to
//     meeting_attendees. People who aren't in PeerChair are reported, not created.
// Idempotent: a note that's fully synced (linked + summary + transcript) is skipped.
//
// Requires GRANOLA_API_KEY (Granola desktop app -> Settings -> Connectors -> API keys). Without it
// this is a deliberate no-op, not a failure.

const GRANOLA_API = "https://public-api.granola.ai/v1"
const DEFAULT_LOOKBACK_HOURS = 72
const MATCH_WINDOW_MIN = 90

const SELF_EMAILS = new Set([
  "dalen.lawrence@cfo-circle.com",
  "dalen.lawrence@stalliant.com",
])

const headers = () => ({ Authorization: `Bearer ${process.env.GRANOLA_API_KEY}` })

export async function GET(request) {
  const auth = request.headers.get("authorization") || ""
  const expected = `Bearer ${cronSecret()}`
  if (auth !== expected) return Response.json({ error: "Unauthorized" }, { status: 401 })
  return doSync(DEFAULT_LOOKBACK_HOURS)
}

export async function POST(request) {
  let hours = DEFAULT_LOOKBACK_HOURS
  try { const b = await request.json(); if (Number(b?.hours) > 0) hours = Math.min(Number(b.hours), 720) } catch {}
  return doSync(hours)
}

// "mm:ss  Name: text" lines, offsets measured from the first segment.
function formatTranscript(segments) {
  if (!Array.isArray(segments) || !segments.length) return ""
  const t0 = new Date(segments[0].start_time).getTime()
  const pad = n => String(n).padStart(2, "0")
  return segments.map(s => {
    const sp = s.speaker || {}
    const who = sp.name || sp.diarization_label || (sp.attribution === "me" ? "Me" : sp.attribution === "them" ? "Them" : sp.source === "microphone" ? "Microphone" : "Speaker")
    const off = Math.max(0, Math.round((new Date(s.start_time).getTime() - t0) / 1000))
    return `${pad(Math.floor(off / 60))}:${pad(off % 60)}  ${who}: ${s.text}`
  }).join("\n")
}

async function fetchNote(id, withTranscript) {
  const url = new URL(`${GRANOLA_API}/notes/${id}`)
  if (withTranscript) url.searchParams.set("include", "transcript")
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) throw new Error(`Get note ${id} HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 150)}`)
  return res.json()
}

async function doSync(lookbackHours) {
  if (!process.env.GRANOLA_API_KEY) {
    await logCronRun("sync-granola", "Skipped -- GRANOLA_API_KEY not configured", null)
    return Response.json({ skipped: "GRANOLA_API_KEY not configured" })
  }
  const sb = serverClient()
  const errors = []
  const stats = { checked: 0, linked: 0, summaries: 0, transcripts: 0, attendees_added: 0, no_summary: 0, no_event: 0, no_match: 0, already_done: 0 }
  const unknownPeople = []

  // 1. Notes updated in the lookback window.
  const updatedAfter = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString()
  let notes = []
  try {
    let cursor = null
    do {
      const url = new URL(GRANOLA_API + "/notes")
      url.searchParams.set("updated_after", updatedAfter)
      url.searchParams.set("page_size", "30")
      if (cursor) url.searchParams.set("cursor", cursor)
      const res = await fetch(url, { headers: headers() })
      if (!res.ok) throw new Error(`List notes HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`)
      const j = await res.json()
      notes = notes.concat(j.notes || [])
      cursor = j.hasMore ? j.cursor : null
    } while (cursor)
  } catch (e) {
    await logCronRun("sync-granola", "checked=0", [e.message])
    return Response.json({ error: e.message }, { status: 500 })
  }

  // 2. What's already fully synced (linked + summary + transcript)?
  const ids = notes.map(n => n.id)
  const done = new Set()
  if (ids.length) {
    const { data: linked } = await sb.from("meetings").select("id, granola_note_id").in("granola_note_id", ids)
    const mids = (linked || []).map(m => m.id)
    const { data: have } = mids.length
      ? await sb.from("meeting_notes").select("meeting_id, source").in("meeting_id", mids).in("source", ["granola_summary", "granola_transcript"])
      : { data: [] }
    const kinds = {}
    ;(have || []).forEach(r => { (kinds[r.meeting_id] ||= new Set()).add(r.source) })
    ;(linked || []).forEach(m => { const k = kinds[m.id]; if (k && k.has("granola_summary") && k.has("granola_transcript")) done.add(m.granola_note_id) })
  }

  for (const n of notes) {
    if (done.has(n.id)) { stats.already_done++; continue }
    stats.checked++
    let note
    try { note = await fetchNote(n.id, true) } catch (e) { errors.push(e.message); continue }

    if (!note.summary_text) { stats.no_summary++; continue }
    const ce = note.calendar_event
    if (!ce || !ce.scheduled_start_time) { stats.no_event++; continue }

    const emails = new Set()
    ;(ce.invitees || []).forEach(i => i.email && emails.add(i.email.toLowerCase()))
    if (ce.organiser) emails.add(ce.organiser.toLowerCase())
    ;(note.attendees || []).forEach(a => a.email && emails.add(a.email.toLowerCase()))
    const others = [...emails].filter(e => !SELF_EMAILS.has(e))

    // 3. Find the calendar meeting: already linked to this note, else same start window + shared invitee.
    let meeting = null
    {
      const { data: linked } = await sb.from("meetings").select("id").eq("granola_note_id", note.id).maybeSingle()
      if (linked) meeting = linked
    }
    if (!meeting) {
      const startMs = new Date(ce.scheduled_start_time).getTime()
      const { data: cands, error: cErr } = await sb.from("meetings").select("id, starts_at, attendees_json")
        .gte("starts_at", new Date(startMs - MATCH_WINDOW_MIN * 60000).toISOString())
        .lte("starts_at", new Date(startMs + MATCH_WINDOW_MIN * 60000).toISOString())
        .is("granola_note_id", null)
      if (cErr) { errors.push(`Candidate lookup ${note.id}: ${cErr.message}`); continue }
      let bestDiff = Infinity
      for (const m of cands || []) {
        const mine = new Set((m.attendees_json || []).map(a => (a.address || "").toLowerCase()))
        if (!others.some(e => mine.has(e))) continue
        const diff = Math.abs(new Date(m.starts_at).getTime() - startMs)
        if (diff < bestDiff) { bestDiff = diff; meeting = m }
      }
    }
    if (!meeting) { stats.no_match++; continue }

    // 4. Link + notes.
    const { error: linkErr } = await sb.from("meetings")
      .update({ granola_note_id: note.id, granola_url: note.web_url || null, granola_synced_at: new Date().toISOString() })
      .eq("id", meeting.id)
    if (linkErr) { errors.push(`Link ${note.id}: ${linkErr.message}`); continue }
    stats.linked++

    const { data: existing } = await sb.from("meeting_notes").select("source").eq("meeting_id", meeting.id).in("source", ["granola_summary", "granola_transcript"])
    const has = new Set((existing || []).map(r => r.source))
    const toInsert = []
    if (!has.has("granola_summary")) toInsert.push({ meeting_id: meeting.id, source: "granola_summary", author: "granola", body: note.summary_markdown || note.summary_text })
    const tx = formatTranscript(note.transcript)
    if (tx && !has.has("granola_transcript")) toInsert.push({ meeting_id: meeting.id, source: "granola_transcript", author: "granola", body: tx })
    if (toInsert.length) {
      const { error: insErr } = await sb.from("meeting_notes").insert(toInsert)
      if (insErr) errors.push(`Notes ${note.id}: ${insErr.message}`)
      else toInsert.forEach(r => r.source === "granola_summary" ? stats.summaries++ : stats.transcripts++)
    }

    // 5. Attendees already in PeerChair (match on any stored email; self excluded).
    if (others.length) {
      const [{ data: pe }, { data: pp }] = await Promise.all([
        sb.from("person_emails").select("person_id, email").in("email", others),
        sb.from("people").select("id, email, email2").or(`email.in.(${others.map(e => `"${e}"`).join(",")}),email2.in.(${others.map(e => `"${e}"`).join(",")})`),
      ])
      const byEmail = {}
      ;(pe || []).forEach(r => { byEmail[r.email.toLowerCase()] = r.person_id })
      ;(pp || []).forEach(r => { [r.email, r.email2].filter(Boolean).forEach(e => { byEmail[e.toLowerCase()] = r.id }) })
      const rows = [], seen = new Set()
      for (const e of others) {
        const pid = byEmail[e]
        if (!pid) { unknownPeople.push(e); continue }
        if (seen.has(pid)) continue
        seen.add(pid)
        rows.push({ meeting_id: meeting.id, person_id: pid, role: e === (ce.organiser || "").toLowerCase() ? "organizer" : "attendee", source: "granola" })
      }
      if (rows.length) {
        // ignoreDuplicates: never downgrade a role someone set by hand
        const { error: aErr } = await sb.from("meeting_attendees").upsert(rows, { onConflict: "meeting_id,person_id", ignoreDuplicates: true })
        if (aErr) errors.push(`Attendees ${note.id}: ${aErr.message}`)
        else stats.attendees_added += rows.length
      }
    }
  }

  await logCronRun(
    "sync-granola",
    Object.entries(stats).map(([k, v]) => `${k}=${v}`).join(" "),
    errors.length ? errors.slice(0, 5) : null,
  )
  return Response.json({ ...stats, not_in_peerchair: [...new Set(unknownPeople)], errors })
}
