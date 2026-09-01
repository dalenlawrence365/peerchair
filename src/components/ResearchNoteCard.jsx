"use client"
import { useState, useRef, useEffect } from "react"
import { marked } from "marked"
import { T } from "@/lib/pipelineTheme"
import { scoreColor } from "@/lib/cfoScores"

// Research Note tab — a standardized home for the AI deep-research writeups
// Dalen runs on CFO prospects (score/verdict/dimension breakdown + full
// narrative with citations), separate from Timeline so it never gets buried
// under communications/meeting notes. Dalen pastes the raw output from
// wherever he ran the research; the server normalizes it into a fixed shape
// via Claude so every note is comparable even as the underlying rubric
// drifts over time. History is kept (nothing overwritten) so past scores
// stay visible if a person is re-researched later.

function fmtDate(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function NoteBody({ note }) {
  const vc = scoreColor(note.score, note.verdict)
  const html = marked.parse(note.narrative || "", { breaks: true })
  return (
    <div style={{ border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 14, background: T.cardBg }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        {note.verdict && (
          <span style={{ fontSize: 13, fontWeight: 700, padding: "4px 12px", borderRadius: 6, background: vc.bg, border: "1px solid " + vc.border, color: vc.fg }}>
            {note.verdict}
          </span>
        )}
        {note.score != null && <span style={{ fontSize: 18, fontWeight: 700, color: T.textPrimary }}>{note.score}<span style={{ fontSize: 12, fontWeight: 500, color: T.textTertiary }}>/100</span></span>}
        {note.confidence != null && <span style={{ fontSize: 12, color: T.textTertiary }}>{note.confidence}% research confidence</span>}
        <span style={{ fontSize: 11, color: T.textTertiary, marginLeft: "auto" }}>{fmtDate(note.created_at)}</span>
      </div>
      {note.summary && <div style={{ fontSize: 13, fontStyle: "italic", color: T.textSecondary, marginBottom: 12 }}>{note.summary}</div>}
      {Array.isArray(note.dimensions) && note.dimensions.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14, fontSize: 12 }}>
          <tbody>
            {note.dimensions.map(function (d, i) {
              return (
                <tr key={i} style={{ borderTop: "1px solid " + T.border }}>
                  <td style={{ padding: "5px 8px 5px 0", color: T.textSecondary, width: "40%" }}>{d.name}</td>
                  <td style={{ padding: "5px 8px", fontWeight: 700, color: T.textPrimary, whiteSpace: "nowrap" }}>{d.score}{d.max != null ? "/" + d.max : ""}</td>
                  <td style={{ padding: "5px 0", color: T.textTertiary }}>{d.why}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="research-narrative" style={{ fontSize: 13, lineHeight: 1.6, color: T.textPrimary }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

export default function ResearchNoteCard({ personId, notes, onSaved }) {
  const [rawText, setRawText] = useState("")
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const [showHistory, setShowHistory] = useState(false)
  const [researching, setResearching] = useState(false)
  const [researchMsg, setResearchMsg] = useState("")
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)

  const list = notes || []
  const latest = list[0] || null
  const history = list.slice(1)

  function runDeepResearch() {
    setResearching(true); setResearchMsg(""); setElapsed(0)
    timerRef.current = setInterval(function () { setElapsed(function (e) { return e + 1 }) }, 1000)
    fetch("/api/people/" + personId + "/deep-research", { method: "POST" })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.note && d.parse_failed) {
          setResearchMsg("Research ran — but auto-formatting failed, so it's stored as raw text (no score/verdict). " + (d.parse_failed_reason || "")); if (onSaved) onSaved()
        } else if (d.note) {
          setResearchMsg("Research complete" + (d.searches_used ? " (" + d.searches_used + " searches)." : "."))
          if (onSaved) onSaved()
        } else {
          setResearchMsg("Research failed" + (d.error ? (": " + d.error) : "") + ".")
        }
      })
      .catch(function () { setResearchMsg("Error running research.") })
      .finally(function () {
        setResearching(false)
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      })
  }

  useEffect(function () {
    return function () { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function save() {
    const t = rawText.trim()
    if (!t) return
    setSaving(true); setMsg("")
    fetch("/api/people/" + personId + "/research-note", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text: t }),
    })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.note && d.parse_failed) {
          setRawText(""); setMsg("Saved — but auto-formatting failed, so it's stored as raw text (no score/verdict) rather than lost. " + (d.parse_failed_reason || "")); if (onSaved) onSaved()
        } else if (d.note) {
          setRawText(""); setMsg("Research note added."); if (onSaved) onSaved()
        } else {
          setMsg("Couldn't save that" + (d.error ? (": " + d.error) : "") + ".")
        }
      })
      .catch(function () { setMsg("Error saving note.") })
      .finally(function () { setSaving(false) })
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 4 }}>Run deep research</div>
        <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: 10, lineHeight: 1.5 }}>
          Claude researches this person live — verifying their CFO status against an independent source, sizing up the company, and scoring the same way as a pasted note. Uses what's already on this profile as a starting point, so it's on par with the process you run by hand. Can take a couple of minutes.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button disabled={researching} onClick={runDeepResearch}
            style={{ padding: "7px 16px", fontSize: 12, borderRadius: 6, border: "none", background: researching ? T.border : "#7c3aed", color: researching ? T.textTertiary : "white", cursor: researching ? "not-allowed" : "pointer", fontWeight: 500, fontFamily: "inherit" }}>
            {researching ? "Researching… " + elapsed + "s" : "Run deep research"}
          </button>
          {researchMsg && <span style={{ fontSize: 12, color: T.textTertiary }}>{researchMsg}</span>}
        </div>
      </div>

      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 4 }}>Add research note</div>
        <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: 10, lineHeight: 1.5 }}>
          Paste the raw output from your deep-research process. It gets normalized into a standard score / verdict / dimension breakdown automatically — formatting doesn't need to match exactly.
        </div>
        <textarea
          value={rawText}
          onChange={function (e) { setRawText(e.target.value) }}
          placeholder="Paste the full research writeup here…"
          rows={6}
          style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical", marginBottom: 8 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button disabled={!rawText.trim() || saving} onClick={save}
            style={{ padding: "7px 16px", fontSize: 12, borderRadius: 6, border: "none", background: rawText.trim() ? "#3b82f6" : T.border, color: rawText.trim() ? "white" : T.textTertiary, cursor: rawText.trim() && !saving ? "pointer" : "not-allowed", fontWeight: 500, fontFamily: "inherit" }}>
            {saving ? "Parsing…" : "Add note"}
          </button>
          {msg && <span style={{ fontSize: 12, color: T.textTertiary }}>{msg}</span>}
        </div>
      </div>

      {latest ? <NoteBody note={latest} /> : (
        <div style={{ fontSize: 13, color: T.textTertiary, padding: "10px 2px" }}>No research note on file yet.</div>
      )}

      {history.length > 0 && (
        <div>
          <button onClick={function () { setShowHistory(!showHistory) }}
            style={{ fontSize: 12, color: T.textTertiary, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "4px 0", textDecoration: "underline" }}>
            {showHistory ? "Hide" : "Show"} {history.length} earlier research note{history.length === 1 ? "" : "s"}
          </button>
          {showHistory && history.map(function (n) { return <NoteBody key={n.id} note={n} /> })}
        </div>
      )}
    </div>
  )
}
