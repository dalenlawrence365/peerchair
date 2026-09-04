"use client"
import { useState, useEffect } from "react"
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

function RecapBody({ recap, onDelete, deleting, onApplyTag, applyingTag }) {
  const eng = ENGAGEMENT_COLOR[recap.engagement_signal]
  const verdict = VERDICT_COLOR[recap.fit_verdict]
  const html = marked.parse(recap.narrative || "", { breaks: true })

  return (
    <div style={{ border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 14, background: T.cardBg }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>{fmtDate(recap.occurred_at)}</span>
        {recap.meeting_type && (
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "rgba(100,116,139,0.13)", color: "#475569" }}>{recap.meeting_type}</span>
        )}
        {recap.fit_verdict && verdict && (
          <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: verdict.bg, border: "1px solid " + verdict.border, color: verdict.fg }}>
            {recap.fit_verdict}
          </span>
        )}
        {recap.engagement_signal && eng && (
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: eng.bg, border: "1px solid " + eng.border, color: eng.fg }}>
            {recap.engagement_signal}
          </span>
        )}
        {recap.parse_failed && (
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "rgba(217,119,6,0.12)", color: "#b45309" }}>unstructured</span>
        )}
        <button onClick={onDelete} disabled={deleting} title="Delete this meeting recap"
          style={{ marginLeft: "auto", fontSize: 11, padding: "3px 9px", borderRadius: 6, border: "1px solid " + T.border, background: "none", color: deleting ? T.textTertiary : "#b91c1c", cursor: deleting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {deleting ? "Deleting…" : "Delete"}
        </button>
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

      {recap.summary && <div style={{ fontSize: 13, fontStyle: "italic", color: T.textSecondary, marginBottom: 12 }}>{recap.summary}</div>}

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
  )
}

export default function MeetingsCard({ personId, personName, onTagApplied }) {
  const [recaps, setRecaps] = useState([])
  const [loadingList, setLoadingList] = useState(true)

  const [rawText, setRawText] = useState("")
  const [occurredAt, setOccurredAt] = useState(todayStr())
  const [meetingType, setMeetingType] = useState("")
  const [participants, setParticipants] = useState([{ id: personId, full_name: personName || "This person" }])
  const [pickerQuery, setPickerQuery] = useState("")
  const [pickerResults, setPickerResults] = useState([])
  const [showPicker, setShowPicker] = useState(false)

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const [deletingId, setDeletingId] = useState(null)
  const [applyingTagId, setApplyingTagId] = useState(null)

  function loadRecaps() {
    setLoadingList(true)
    fetch("/api/people/" + personId + "/meeting-recaps")
      .then(function (r) { return r.json() })
      .then(function (d) { setRecaps((d && d.recaps) || []) })
      .catch(function () {})
      .finally(function () { setLoadingList(false) })
  }

  useEffect(function () { loadRecaps() }, [personId])

  // Reset the pinned participant if the profile itself changes (nav between people).
  useEffect(function () {
    setParticipants([{ id: personId, full_name: personName || "This person" }])
  }, [personId, personName])

  // Debounced person typeahead for adding co-participants.
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
    if (participants.some(function (x) { return x.id === p.id })) return
    setParticipants(participants.concat([{ id: p.id, full_name: p.full_name }]))
    setPickerQuery(""); setPickerResults([]); setShowPicker(false)
  }

  function removeParticipant(id) {
    if (id === personId) return // this profile's person is always included
    setParticipants(participants.filter(function (p) { return p.id !== id }))
  }

  function save() {
    const t = rawText.trim()
    if (!t) return
    setSaving(true); setMsg("")
    fetch("/api/meeting-recaps", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw_text: t,
        person_ids: participants.map(function (p) { return p.id }),
        occurred_at: occurredAt,
        meeting_type: meetingType.trim() || undefined,
      }),
    })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.meeting_recap && d.parse_failed) {
          setMsg("Saved — but auto-formatting failed, so it's stored as raw text. " + (d.parse_failed_reason || ""))
        } else if (d.meeting_recap) {
          setMsg("Meeting recap added.")
        } else {
          setMsg("Couldn't save that" + (d.error ? (": " + d.error) : "") + ".")
          return
        }
        setRawText(""); setMeetingType(""); setOccurredAt(todayStr())
        setParticipants([{ id: personId, full_name: personName || "This person" }])
        loadRecaps()
      })
      .catch(function () { setMsg("Error saving recap.") })
      .finally(function () { setSaving(false) })
  }

  function handleDelete(recapId) {
    if (!window.confirm("Delete this meeting recap? This removes it for everyone it was posted to and can't be undone.")) return
    setDeletingId(recapId)
    fetch("/api/people/" + personId + "/meeting-recaps?recap_id=" + recapId, { method: "DELETE" })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.ok) loadRecaps()
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
      .then(function () { loadRecaps(); if (onTagApplied) onTagApplied() })
      .catch(function () { window.alert("Error applying tag.") })
      .finally(function () { setApplyingTagId(null) })
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 4 }}>Log a meeting</div>
        <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: 12, lineHeight: 1.5 }}>
          Paste the output from Granola (or any note-taker) after a meeting. It gets normalized into a summary, engagement read, referrals, commitments, and — for fit calls — a verdict, then logged so it feeds Research and Draft Email/DM for everyone tagged below.
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {participants.map(function (p) {
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
            placeholder="Add another person on this call (e.g. a second contact at Marsh)…"
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
          <input type="date" value={occurredAt} onChange={function (e) { setOccurredAt(e.target.value) }}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
          <input value={meetingType} onChange={function (e) { setMeetingType(e.target.value) }}
            placeholder="Meeting type (optional — Fit call, Board meeting, etc.)"
            style={{ flex: 1, minWidth: 220, padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
        </div>

        <textarea
          value={rawText}
          onChange={function (e) { setRawText(e.target.value) }}
          placeholder="Paste the full Granola output here…"
          rows={6}
          style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical", marginBottom: 8 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button disabled={!rawText.trim() || saving} onClick={save}
            style={{ padding: "7px 16px", fontSize: 12, borderRadius: 6, border: "none", background: rawText.trim() ? "#3b82f6" : T.border, color: rawText.trim() ? "white" : T.textTertiary, cursor: rawText.trim() && !saving ? "pointer" : "not-allowed", fontWeight: 500, fontFamily: "inherit" }}>
            {saving ? "Saving…" : "Add meeting recap"}
          </button>
          {msg && <span style={{ fontSize: 12, color: T.textTertiary }}>{msg}</span>}
        </div>
      </div>

      {loadingList ? (
        <div style={{ fontSize: 13, color: T.textTertiary, padding: "10px 2px" }}>Loading…</div>
      ) : recaps.length === 0 ? (
        <div style={{ fontSize: 13, color: T.textTertiary, padding: "10px 2px" }}>No meeting recaps on file yet.</div>
      ) : (
        recaps.map(function (r) {
          return (
            <RecapBody key={r.id} recap={r}
              onDelete={function () { handleDelete(r.id) }} deleting={deletingId === r.id}
              onApplyTag={function () { handleApplyTag(r) }} applyingTag={applyingTagId === r.id} />
          )
        })
      )}
    </div>
  )
}
