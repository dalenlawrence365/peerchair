"use client"
import { useState, useEffect, useRef } from "react"
import { marked } from "marked"
import { T } from "@/lib/pipelineTheme"

// Meetings tab — landing zone for Granola (or any AI note-taker) post-meeting
// recaps. Distinct from the ProVisors "Meetings Attended" tab (which only
// shows for ProVisors members and lists roster meeting instances) — this one
// is for pasting real meeting content: fit calls, sponsor check-ins, board
// meetings, anything. A recap can be posted to multiple people at once (a
// meeting with several contacts at one company), so the picker below always
// includes this profile pinned, plus anyone else Dalen adds. History is kept
// (nothing overwritten); saving a recap also logs an inbound communication
// for every participant so it feeds the warmth score, not just this tab.

const ENGAGEMENT_COLOR = {
  Reciprocal: { bg: "rgba(22,163,74,0.12)", fg: "#15803d", border: "rgba(22,163,74,0.3)" },
  Engaged: { bg: "rgba(59,130,246,0.12)", fg: "#1d4ed8", border: "rgba(59,130,246,0.3)" },
  Passive: { bg: "rgba(148,163,184,0.14)", fg: "#64748b", border: "rgba(148,163,184,0.3)" },
  Guarded: { bg: "rgba(217,119,6,0.12)", fg: "#b45309", border: "rgba(217,119,6,0.3)" },
  "Not enough signal": { bg: "rgba(148,163,184,0.10)", fg: "#94a3b8", border: "rgba(148,163,184,0.25)" },
}

// Plain-English meaning for each engagement read, shown as a hover tooltip
// so the pill isn't jargon. Warmth uses the same vocabulary (warmthScore.js).
const ENGAGEMENT_MEANING = {
  Reciprocal: "They engaged back — asked questions, showed real interest, or proposed their own next step. Strongest positive read.",
  Engaged: "They were attentive and participated, but didn't drive it forward themselves.",
  Passive: "They showed up but were mostly passive — neutral read.",
  Guarded: "They were cautious, non-committal, or kept their distance — mild negative read.",
  "Not enough signal": "Not enough in the recap to judge how engaged they were.",
}

const VERDICT_COLOR = {
  "Strong Invite": { bg: "rgba(22,163,74,0.12)", fg: "#15803d", border: "rgba(22,163,74,0.3)" },
  Invite: { bg: "rgba(59,130,246,0.12)", fg: "#1d4ed8", border: "rgba(59,130,246,0.3)" },
  Maybe: { bg: "rgba(217,119,6,0.12)", fg: "#b45309", border: "rgba(217,119,6,0.3)" },
  Pass: { bg: "rgba(148,163,184,0.14)", fg: "#64748b", border: "rgba(148,163,184,0.3)" },
}

function fmtDate(d) {
  if (!d) return ""
  const dt = new Date(d + "T12:00:00")
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function RecapBody({ recap, onDelete, deleting, onApplyTag, applyingTag, expanded, onToggle, onEdit, nested }) {
  const eng = ENGAGEMENT_COLOR[recap.engagement_signal]
  const verdict = VERDICT_COLOR[recap.fit_verdict]
  const html = marked.parse(recap.narrative || "", { breaks: true })
  const hasDetail = !!(recap.narrative || recap.commitments || recap.referral_mentioned)

  return (
    <div style={{ border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 14, background: T.cardBg }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {nested ? (
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T.textTertiary }}>Summary</span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>{fmtDate(recap.occurred_at)}</span>
        )}
        {!nested && recap.meeting_type && (
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "rgba(100,116,139,0.13)", color: "#475569" }}>{recap.meeting_type}</span>
        )}
        {recap.fit_verdict && verdict && (
          <span title="CFO Circle invite-worthiness read from this call" style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: verdict.bg, border: "1px solid " + verdict.border, color: verdict.fg }}>
            {recap.fit_verdict}
          </span>
        )}
        {recap.engagement_signal && eng && (
          <span title={"Engagement read — " + (ENGAGEMENT_MEANING[recap.engagement_signal] || "")}
            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: eng.bg, border: "1px solid " + eng.border, color: eng.fg, cursor: "help" }}>
            Engagement: {recap.engagement_signal}
          </span>
        )}
        {recap.parse_failed && (
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "rgba(217,119,6,0.12)", color: "#b45309" }}>unstructured</span>
        )}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          {onEdit && (
            <button onClick={onEdit} title="Edit this recap"
              style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, border: "1px solid " + T.border, background: "none", color: "#1d4ed8", cursor: "pointer", fontFamily: "inherit" }}>
              Edit
            </button>
          )}
          <button onClick={onDelete} disabled={deleting} title="Delete this meeting recap"
            style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, border: "1px solid " + T.border, background: "none", color: deleting ? T.textTertiary : "#b91c1c", cursor: deleting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </span>
      </div>

      {recap.other_participants && recap.other_participants.length > 0 && (
        <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: 10 }}>
          Also: {recap.other_participants.map(function (p) { return p.full_name }).join(", ")}
        </div>
      )}

      {recap.hard_stop && !recap.warning_tag_applied && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "10px 12px", borderRadius: 8, background: "rgba(185,28,28,0.08)", border: "1px solid rgba(185,28,28,0.25)", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "#b91c1c" }}>
            <strong>Hard stop flagged:</strong> {recap.hard_stop_detail || "(no exact phrasing captured)"}
          </span>
          {recap.suggested_warning_tag && (
            <button onClick={onApplyTag} disabled={applyingTag}
              style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 6, border: "none", background: applyingTag ? T.border : "#b91c1c", color: "white", cursor: applyingTag ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {applyingTag ? "Applying…" : "Apply " + recap.suggested_warning_tag + " tag"}
            </button>
          )}
        </div>
      )}
      {recap.hard_stop && recap.warning_tag_applied && (
        <div style={{ fontSize: 12, color: "#15803d", marginBottom: 12 }}>
          ✓ {recap.suggested_warning_tag} tag applied
        </div>
      )}

      {recap.summary && <div style={{ fontSize: 13, fontStyle: "italic", color: T.textSecondary, marginBottom: expanded ? 12 : 2 }}>{recap.summary}</div>}

      {hasDetail && (
        <button onClick={onToggle}
          style={{ fontSize: 11, fontWeight: 600, padding: "2px 0", background: "none", border: "none", color: "#1d4ed8", cursor: "pointer", fontFamily: "inherit" }}>
          {expanded ? "Hide details ▴" : "Show details ▾"}
        </button>
      )}

      {expanded && (
        <div style={{ marginTop: 8 }}>
          {recap.referral_mentioned && (
            <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 8 }}>
              <strong>Referral:</strong> {recap.referral_who || "mentioned, no name captured"}
            </div>
          )}
          {recap.commitments && (
            <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 12, padding: "8px 10px", background: "rgba(59,130,246,0.06)", borderRadius: 6 }}>
              <strong>Commitments:</strong> {recap.commitments}
            </div>
          )}
          <div className="research-narrative" style={{ fontSize: 13, lineHeight: 1.6, color: T.textPrimary }} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  )
}

function fmtWhen(iso) {
  if (!iso) return ""
  const dt = new Date(iso)
  if (isNaN(dt)) return ""
  return dt.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

const SELF_EMAILS = new Set([
  "dalen.lawrence@cfo-circle.com",
  "dalen.lawrence@stalliant.com",
  "dalenlawrence365@gmail.com",
])

function prettyType(t) {
  if (!t) return ""
  return t.replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase() })
}

const STATUS_STYLE = {
  completed: { bg: "rgba(22,163,74,0.12)", fg: "#15803d" },
  scheduled: { bg: "rgba(59,130,246,0.12)", fg: "#1d4ed8" },
  canceled:  { bg: "rgba(148,163,184,0.16)", fg: "#64748b" },
}

// Three real states, derived — Outlook never says "completed", it's just a
// non-canceled meeting whose end time has passed. No stored flip (the sync
// would overwrite it); no "no-show" state (Dalen deletes/cancels those).
function effectiveStatus(m) {
  if (m.status === "canceled") return "canceled"
  const end = new Date(m.ends_at || m.starts_at).getTime()
  if (isFinite(end) && end < Date.now()) return "completed"
  return "scheduled"
}

// Hide online-meeting join URLs (Zoom/Teams links Dalen doesn't use) from the
// meeting header; keep real venue strings like "Culver City".
function displayLocation(loc) {
  if (!loc) return null
  const s = String(loc).trim()
  if (/^https?:\/\//i.test(s)) return null
  if (/teams\.microsoft\.com|zoom\.us|meet\.google\.com/i.test(s)) return null
  return s
}

// Build the "With:" list. The raw attendee name from Outlook/Calendly is
// whatever the invitee typed into the booking form — often garbage (wrong
// spelling, company, pasted phrases). This meeting is linked to a known
// person, so for the attendee that matches this profile we show the clean
// contact name instead of the booking string; other attendees fall back to
// their raw name/email.
function attendeeNames(m, personName, profileEmails) {
  const seen = new Set()
  const out = []
  for (const a of (m.attendees_json || [])) {
    const addr = (a && a.address ? String(a.address) : "").toLowerCase().trim()
    if (addr && SELF_EMAILS.has(addr)) continue
    let label
    if (addr && profileEmails && profileEmails.has(addr) && personName) {
      label = personName
    } else {
      label = (a && (a.name || a.address)) ? String(a.name || a.address) : ""
    }
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(label)
  }
  // Guarantee the linked contact appears even if the invite carried no
  // address that matched (e.g. matched by a secondary email not in the row).
  if (personName && !out.some(function (n) { return n.toLowerCase() === personName.toLowerCase() })) {
    out.unshift(personName)
  }
  return out
}

// Meetings tab — meeting-first. One row per real meeting (synced from the
// calendar: date, who was there, type, status), with its recap nested
// underneath. The recap is optional — paste it from Granola after the
// meeting, or leave it empty. A meeting that isn't on the calendar can still
// be logged by hand below, and legacy recaps that predate this model (not
// tied to a calendar meeting) are listed at the bottom so nothing is lost.
export default function MeetingsCard({ personId, personName, personEmail, personEmail2, meetings, unlinkedRecaps, onChanged, scrollToRecapId, scrollToMeetingId }) {
  const mtgs = meetings || []
  const legacy = unlinkedRecaps || []
  const profileEmails = new Set([personEmail, personEmail2].filter(Boolean).map(function (e) { return String(e).toLowerCase().trim() }))

  // Per-meeting recap compose (only one open at a time).
  const [composeFor, setComposeFor] = useState(null)
  const [composeText, setComposeText] = useState("")
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")

  const [deletingId, setDeletingId] = useState(null)
  const [applyingTagId, setApplyingTagId] = useState(null)

  // Ad-hoc meeting (not on the calendar) composer.
  const [showAdhoc, setShowAdhoc] = useState(false)
  const [adRaw, setAdRaw] = useState("")
  const [adDate, setAdDate] = useState(todayStr())
  const [adType, setAdType] = useState("")
  const [adParticipants, setAdParticipants] = useState([{ id: personId, full_name: personName || "This person" }])
  const [pickerQuery, setPickerQuery] = useState("")
  const [pickerResults, setPickerResults] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [adSaving, setAdSaving] = useState(false)
  const [adMsg, setAdMsg] = useState("")

  const recapRefs = useRef({})
  const didScrollRef = useRef(false)
  const [highlightId, setHighlightId] = useState(null)
  const [expandedRecaps, setExpandedRecaps] = useState({})

  // Jump to a specific meeting (from a Timeline meeting row).
  const meetingRefs = useRef({})
  const didScrollMtgRef = useRef(false)
  const [highlightMtgId, setHighlightMtgId] = useState(null)

  useEffect(function () {
    if (!scrollToMeetingId || didScrollMtgRef.current) return
    const el = meetingRefs.current[scrollToMeetingId]
    if (!el) return
    didScrollMtgRef.current = true
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    setHighlightMtgId(scrollToMeetingId)
    setTimeout(function () { setHighlightMtgId(null) }, 2500)
  }, [scrollToMeetingId, meetings])

  function toggleRecap(id) {
    setExpandedRecaps(function (s) { return Object.assign({}, s, { [id]: !s[id] }) })
  }

  // Edit an existing recap (summary + narrative text; raw paste untouched).
  const [editingId, setEditingId] = useState(null)
  const [editSummary, setEditSummary] = useState("")
  const [editNarr, setEditNarr] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)

  function startEdit(r) {
    setEditingId(r.id); setEditSummary(r.summary || ""); setEditNarr(r.narrative || "")
    setExpandedRecaps(function (s) { return Object.assign({}, s, { [r.id]: true }) })
  }
  function saveEdit(r) {
    setSavingEdit(true)
    fetch("/api/people/" + personId + "/meeting-recaps", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recap_id: r.id, summary: editSummary, narrative: editNarr }),
    })
      .then(function (res) { return res.json() })
      .then(function (d) {
        if (d.ok) { setEditingId(null); if (onChanged) onChanged() }
        else window.alert("Couldn't save the edit" + (d.error ? (": " + d.error) : "") + ".")
      })
      .catch(function () { window.alert("Error saving edit.") })
      .finally(function () { setSavingEdit(false) })
  }

  // Free-form notes on a meeting (separate from the recap; append-only).
  const [noteFor, setNoteFor] = useState(null)
  const [noteText, setNoteText] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [deletingNoteId, setDeletingNoteId] = useState(null)

  function addNote(meeting) {
    const t = (noteText || "").trim()
    if (!t) return
    setSavingNote(true)
    fetch("/api/meeting-notes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meeting_id: meeting.id, body: t, author: "dalen" }),
    })
      .then(function (res) { return res.json() })
      .then(function (d) {
        if (d.ok || d.id) { setNoteFor(null); setNoteText(""); if (onChanged) onChanged() }
        else window.alert("Couldn't add the note" + (d.error ? (": " + d.error) : "") + ".")
      })
      .catch(function () { window.alert("Error adding note.") })
      .finally(function () { setSavingNote(false) })
  }
  function deleteNote(noteId) {
    if (!window.confirm("Delete this note?")) return
    setDeletingNoteId(noteId)
    fetch("/api/meeting-notes?id=" + noteId, { method: "DELETE" })
      .then(function (res) { return res.json() })
      .then(function (d) { if (d.ok) { if (onChanged) onChanged() } else window.alert("Couldn't delete the note.") })
      .catch(function () {})
      .finally(function () { setDeletingNoteId(null) })
  }

  useEffect(function () {
    setAdParticipants([{ id: personId, full_name: personName || "This person" }])
  }, [personId, personName])

  useEffect(function () {
    if (!scrollToRecapId || didScrollRef.current) return
    const el = recapRefs.current[scrollToRecapId]
    if (!el) return
    didScrollRef.current = true
    setExpandedRecaps(function (s) { return Object.assign({}, s, { [scrollToRecapId]: true }) })
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    setHighlightId(scrollToRecapId)
    setTimeout(function () { setHighlightId(null) }, 2500)
  }, [scrollToRecapId, meetings, unlinkedRecaps])

  useEffect(function () {
    if (!pickerQuery || pickerQuery.trim().length < 2) { setPickerResults([]); return }
    let alive = true
    const t = setTimeout(function () {
      fetch("/api/people/search?q=" + encodeURIComponent(pickerQuery.trim()), { cache: "no-store" })
        .then(function (r) { return r.json() })
        .then(function (d) { if (alive) setPickerResults((d && d.results) || []) })
        .catch(function () {})
    }, 200)
    return function () { alive = false; clearTimeout(t) }
  }, [pickerQuery])

  function addParticipant(p) {
    if (adParticipants.some(function (x) { return x.id === p.id })) return
    setAdParticipants(adParticipants.concat([{ id: p.id, full_name: p.full_name }]))
    setPickerQuery(""); setPickerResults([]); setShowPicker(false)
  }
  function removeParticipant(id) {
    if (id === personId) return
    setAdParticipants(adParticipants.filter(function (p) { return p.id !== id }))
  }

  function openCompose(meetingId) {
    setComposeFor(meetingId); setComposeText(""); setMsg("")
  }

  function saveRecap(meeting) {
    const t = (composeText || "").trim()
    if (!t) return
    setSaving(true); setMsg("")
    fetch("/api/meeting-recaps", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw_text: t,
        person_ids: [personId],
        meeting_id: meeting.id,
        occurred_at: (meeting.starts_at || "").slice(0, 10) || undefined,
        meeting_type: meeting.meeting_type || undefined,
      }),
    })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.meeting_recap) {
          setComposeFor(null); setComposeText("")
          if (onChanged) onChanged()
        } else {
          setMsg("Couldn't save that" + (d.error ? (": " + d.error) : "") + ".")
        }
      })
      .catch(function () { setMsg("Error saving recap.") })
      .finally(function () { setSaving(false) })
  }

  function saveAdhoc() {
    const t = adRaw.trim()
    if (!t) return
    setAdSaving(true); setAdMsg("")
    fetch("/api/meeting-recaps", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw_text: t,
        person_ids: adParticipants.map(function (p) { return p.id }),
        occurred_at: adDate,
        meeting_type: adType.trim() || undefined,
      }),
    })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.meeting_recap) {
          setAdRaw(""); setAdType(""); setAdDate(todayStr())
          setAdParticipants([{ id: personId, full_name: personName || "This person" }])
          setShowAdhoc(false)
          if (onChanged) onChanged()
        } else {
          setAdMsg("Couldn't save that" + (d.error ? (": " + d.error) : "") + ".")
        }
      })
      .catch(function () { setAdMsg("Error saving.") })
      .finally(function () { setAdSaving(false) })
  }

  function handleDelete(recapId) {
    if (!window.confirm("Delete this meeting recap? This removes it for everyone it was posted to and can't be undone.")) return
    setDeletingId(recapId)
    fetch("/api/people/" + personId + "/meeting-recaps?recap_id=" + recapId, { method: "DELETE" })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.ok) { if (onChanged) onChanged() }
        else window.alert("Couldn't delete that" + (d.error ? (": " + d.error) : "") + ".")
      })
      .catch(function () { window.alert("Error deleting recap.") })
      .finally(function () { setDeletingId(null) })
  }

  function handleApplyTag(recap) {
    setApplyingTagId(recap.id)
    fetch("/api/people/" + personId + "/action", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_tag", tag: recap.suggested_warning_tag, notes: "From meeting recap (" + fmtDate(recap.occurred_at) + "): " + (recap.hard_stop_detail || "") }),
    })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (!d.ok) { window.alert("Couldn't apply the tag" + (d.error ? (": " + d.error) : "") + "."); return }
        return fetch("/api/people/" + personId + "/meeting-recaps", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recap_id: recap.id, warning_tag_applied: true }),
        })
      })
      .then(function () { if (onChanged) onChanged() })
      .catch(function () { window.alert("Error applying tag.") })
      .finally(function () { setApplyingTagId(null) })
  }

  function renderRecap(r, nested) {
    if (editingId === r.id) {
      return (
        <div key={r.id} style={{ border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 14, background: T.cardBg }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T.textTertiary, marginBottom: 8 }}>Edit recap</div>
          <input value={editSummary} onChange={function (e) { setEditSummary(e.target.value) }}
            placeholder="One-line summary"
            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
          <textarea value={editNarr} onChange={function (e) { setEditNarr(e.target.value) }}
            rows={8}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={savingEdit} onClick={function () { saveEdit(r) }}
              style={{ padding: "7px 16px", fontSize: 12, borderRadius: 6, border: "none", background: "#3b82f6", color: "white", cursor: savingEdit ? "not-allowed" : "pointer", fontWeight: 500, fontFamily: "inherit" }}>
              {savingEdit ? "Saving…" : "Save"}
            </button>
            <button onClick={function () { setEditingId(null) }}
              style={{ padding: "7px 14px", fontSize: 12, borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          </div>
        </div>
      )
    }
    return (
      <div key={r.id} ref={function (el) { recapRefs.current[r.id] = el }}
        style={highlightId === r.id ? { borderRadius: 10, boxShadow: "0 0 0 3px rgba(59,130,246,0.5)", transition: "box-shadow 0.3s" } : { transition: "box-shadow 0.3s" }}>
        <RecapBody recap={r} nested={nested} onEdit={function () { startEdit(r) }}
          onDelete={function () { handleDelete(r.id) }} deleting={deletingId === r.id}
          onApplyTag={function () { handleApplyTag(r) }} applyingTag={applyingTagId === r.id}
          expanded={!!expandedRecaps[r.id]} onToggle={function () { toggleRecap(r.id) }} />
      </div>
    )
  }

  function renderNotes(m) {
    const notes = m.notes || []
    const adding = noteFor === m.id
    return (
      <div style={{ marginTop: (m.recaps && m.recaps.length) ? 12 : 0 }}>
        {notes.map(function (n) {
          return (
            <div key={n.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 10px", borderLeft: "3px solid #d97706", background: "rgba(217,119,6,0.05)", borderRadius: 4, marginBottom: 6 }}>
              <div style={{ fontSize: 12.5, color: T.textPrimary, whiteSpace: "pre-wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#b45309", marginRight: 8 }}>Note</span>
                {n.body}
              </div>
              <button onClick={function () { deleteNote(n.id) }} disabled={deletingNoteId === n.id}
                style={{ fontSize: 11, border: "none", background: "none", color: deletingNoteId === n.id ? T.textTertiary : "#b91c1c", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>×</button>
            </div>
          )
        })}
        {adding ? (
          <div>
            <textarea value={noteText} onChange={function (e) { setNoteText(e.target.value) }}
              placeholder="Add a note to this meeting…" rows={2}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 12.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical", marginBottom: 6 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={!noteText.trim() || savingNote} onClick={function () { addNote(m) }}
                style={{ padding: "5px 12px", fontSize: 12, borderRadius: 6, border: "none", background: noteText.trim() ? "#3b82f6" : T.border, color: noteText.trim() ? "white" : T.textTertiary, cursor: noteText.trim() && !savingNote ? "pointer" : "not-allowed", fontWeight: 500, fontFamily: "inherit" }}>
                {savingNote ? "Saving…" : "Save note"}
              </button>
              <button onClick={function () { setNoteFor(null); setNoteText("") }}
                style={{ padding: "5px 12px", fontSize: 12, borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={function () { setNoteFor(m.id); setNoteText("") }}
            style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }}>
            + Add note
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {mtgs.length === 0 && legacy.length === 0 ? (
        <div style={{ fontSize: 13, color: T.textTertiary, padding: "10px 2px" }}>
          No meetings with this person yet. Synced calendar meetings appear here automatically; you can also log one below.
        </div>
      ) : null}

      {mtgs.map(function (m) {
        const eff = effectiveStatus(m)
        const st = STATUS_STYLE[eff] || null
        const canceled = eff === "canceled"
        const atts = m.attendees_resolved || []
        const recaps = m.recaps || []
        const composing = composeFor === m.id
        return (
          <div key={m.id} ref={function (el) { meetingRefs.current[m.id] = el }}
            style={Object.assign({ border: "1px solid " + T.border, borderRadius: 10, marginBottom: 10, background: T.cardBg, padding: "12px 14px", transition: "box-shadow 0.3s" }, highlightMtgId === m.id ? { boxShadow: "0 0 0 3px rgba(59,130,246,0.5)" } : {})}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, textDecoration: canceled ? "line-through" : "none" }}>{fmtWhen(m.starts_at)}</span>
              {m.meeting_type && (
                <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: "rgba(100,116,139,0.13)", color: "#475569" }}>{prettyType(m.meeting_type)}</span>
              )}
              {st && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 999, background: st.bg, color: st.fg }}>{prettyType(eff)}</span>
              )}
            </div>
            {atts.length > 0 && (
              <div style={{ fontSize: 12.5, color: T.textPrimary, marginTop: 4 }}>
                {atts.map(function (a, i) {
                  return (
                    <span key={a.person_id || i}>
                      {i > 0 ? ", " : ""}
                      <span style={{ fontWeight: 600 }}>{a.name}</span>
                      {a.company ? <span style={{ color: T.textTertiary, fontWeight: 400 }}>{" (" + a.company + ")"}</span> : null}
                    </span>
                  )
                })}
              </div>
            )}

            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid " + T.borderSoft }}>
              {recaps.length > 0 ? (
                recaps.map(function (r) { return renderRecap(r, true) })
              ) : composing ? (
                <div>
                  <textarea
                    value={composeText}
                    onChange={function (e) { setComposeText(e.target.value) }}
                    placeholder="Paste the Granola (or any note-taker) recap for this meeting…"
                    rows={6}
                    style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical", marginBottom: 8 }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button disabled={!composeText.trim() || saving} onClick={function () { saveRecap(m) }}
                      style={{ padding: "7px 16px", fontSize: 12, borderRadius: 6, border: "none", background: composeText.trim() ? "#3b82f6" : T.border, color: composeText.trim() ? "white" : T.textTertiary, cursor: composeText.trim() && !saving ? "pointer" : "not-allowed", fontWeight: 500, fontFamily: "inherit" }}>
                      {saving ? "Saving…" : "Save recap"}
                    </button>
                    <button onClick={function () { setComposeFor(null); setMsg("") }}
                      style={{ padding: "7px 14px", fontSize: 12, borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }}>
                      Cancel
                    </button>
                    {msg && <span style={{ fontSize: 12, color: T.textTertiary }}>{msg}</span>}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 12, color: T.textTertiary }}>No recap yet.</span>
                  <button onClick={function () { openCompose(m.id) }}
                    style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: "#1d4ed8", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>
                    + Add recap
                  </button>
                </div>
              )}
              {renderNotes(m)}
            </div>
          </div>
        )
      })}

      {/* Log a meeting that isn't on the calendar */}
      <div style={{ marginTop: 6, marginBottom: 16 }}>
        {!showAdhoc ? (
          <button onClick={function () { setShowAdhoc(true) }}
            style={{ fontSize: 12, padding: "7px 14px", borderRadius: 6, border: "1px dashed " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }}>
            + Log a meeting that isn&rsquo;t on the calendar
          </button>
        ) : (
          <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 10 }}>Log a meeting (not on your calendar)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {adParticipants.map(function (p) {
                return (
                  <span key={p.id} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "rgba(59,130,246,0.10)", color: "#1d4ed8", border: "1px solid rgba(59,130,246,0.25)", display: "flex", alignItems: "center", gap: 6 }}>
                    {p.full_name}
                    {p.id !== personId && (
                      <button onClick={function () { removeParticipant(p.id) }} style={{ background: "none", border: "none", cursor: "pointer", color: "#1d4ed8", padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
                    )}
                  </span>
                )
              })}
            </div>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <input
                value={pickerQuery}
                onChange={function (e) { setPickerQuery(e.target.value); setShowPicker(true) }}
                onFocus={function () { setShowPicker(true) }}
                placeholder="Add another person on this call…"
                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              />
              {showPicker && pickerResults.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, background: T.cardBg, border: "1px solid " + T.border, borderRadius: 8, marginTop: 4, maxHeight: 220, overflowY: "auto", boxShadow: "0 4px 14px rgba(0,0,0,0.08)" }}>
                  {pickerResults.map(function (p) {
                    return (
                      <div key={p.id} onClick={function () { addParticipant(p) }}
                        style={{ padding: "8px 10px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid " + T.border }}>
                        <div style={{ fontWeight: 600 }}>{p.full_name}</div>
                        <div style={{ color: T.textTertiary }}>{[p.title, p.company].filter(Boolean).join(" · ")}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <input type="date" value={adDate} onChange={function (e) { setAdDate(e.target.value) }}
                style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
              <input value={adType} onChange={function (e) { setAdType(e.target.value) }}
                placeholder="Meeting type (optional — Fit call, Board meeting, etc.)"
                style={{ flex: 1, minWidth: 220, padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
            </div>
            <textarea
              value={adRaw}
              onChange={function (e) { setAdRaw(e.target.value) }}
              placeholder="Paste the recap, or a one-line note of what happened…"
              rows={5}
              style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical", marginBottom: 8 }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button disabled={!adRaw.trim() || adSaving} onClick={saveAdhoc}
                style={{ padding: "7px 16px", fontSize: 12, borderRadius: 6, border: "none", background: adRaw.trim() ? "#3b82f6" : T.border, color: adRaw.trim() ? "white" : T.textTertiary, cursor: adRaw.trim() && !adSaving ? "pointer" : "not-allowed", fontWeight: 500, fontFamily: "inherit" }}>
                {adSaving ? "Saving…" : "Log meeting"}
              </button>
              <button onClick={function () { setShowAdhoc(false); setAdMsg("") }}
                style={{ padding: "7px 14px", fontSize: 12, borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              {adMsg && <span style={{ fontSize: 12, color: T.textTertiary }}>{adMsg}</span>}
            </div>
          </div>
        )}
      </div>

      {legacy.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.04em", margin: "4px 0 10px" }}>
            Recaps not linked to a calendar meeting
          </div>
          {legacy.map(function (r) { return renderRecap(r, false) })}
        </div>
      )}
    </div>
  )
}
