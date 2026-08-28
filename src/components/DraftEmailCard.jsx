"use client"
import { useState, useRef, useEffect, useCallback } from "react"
import { T } from "@/lib/pipelineTheme"

// Draft Email tab — voice (or typed) instructions → Claude drafts a real,
// personalized email using the person's profile + recent history → Dalen
// reviews and edits the actual text → approves → lands in his real Outlook
// Drafts folder. Never sends anything itself, same convention as every other
// email flow in this app (EventLinkCard's Draft email button, event
// reminders, etc.) — this only ever calls mode="create", which is a Graph
// draft create, not a send.
export default function DraftEmailCard({ personId }) {
  const [supported, setSupported] = useState(true)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [generating, setGenerating] = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [hasDraft, setHasDraft] = useState(false)
  const [hasEmail, setHasEmail] = useState(null) // null = unknown yet
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState("")
  const [draftUrl, setDraftUrl] = useState(null)
  const recognitionRef = useRef(null)
  const baseTranscriptRef = useRef("") // transcript text before the current listening session started

  useEffect(function () {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SR) { setSupported(false); return }
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = "en-US"
    rec.onresult = function (e) {
      let finalText = ""
      let interimText = ""
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript + " "
        else interimText += r[0].transcript
      }
      const base = baseTranscriptRef.current
      setTranscript((base ? base + " " : "") + finalText + interimText)
    }
    rec.onerror = function () { setListening(false) }
    rec.onend = function () { setListening(false) }
    recognitionRef.current = rec
    return function () { try { rec.stop() } catch (e) {} }
  }, [])

  const toggleListening = useCallback(function () {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
      setListening(false)
    } else {
      baseTranscriptRef.current = transcript.trim()
      try { rec.start(); setListening(true) } catch (e) {}
    }
  }, [listening, transcript])

  function generateDraft() {
    if (!transcript.trim()) return
    setGenerating(true); setMsg(""); setHasDraft(false)
    fetch("/api/people/" + personId + "/draft-email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "generate", instructions: transcript.trim() }),
    })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.subject && d.body) {
          setSubject(d.subject); setBody(d.body); setHasDraft(true); setHasEmail(!!d.has_email)
          if (!d.has_email) setMsg("Drafted — but this person has no email on file yet, so it can't be created in Outlook until one's added.")
        } else {
          setMsg("Couldn't generate a draft" + (d.error ? (": " + d.error) : "") + ".")
        }
      })
      .catch(function () { setMsg("Error generating draft.") })
      .finally(function () { setGenerating(false) })
  }

  function createInOutlook() {
    if (!subject.trim() || !body.trim()) return
    setCreating(true); setMsg(""); setDraftUrl(null)
    fetch("/api/people/" + personId + "/draft-email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "create", subject: subject.trim(), body: body.trim() }),
    })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.ok) {
          const cs = d.contact_sync || {}
          const contactNote = cs.ok
            ? (cs.created ? " Contact created in Outlook." : (cs.unchanged ? "" : " Contact updated in Outlook."))
            : (cs.error ? " (Outlook contact sync failed: " + cs.error + ")" : "")
          setMsg("Draft saved to your Outlook Drafts." + contactNote)
          setDraftUrl(d.draft_url || null)
        }
        else if (d.error === "no_email") setMsg("This person has no email on file — add one on their profile, then come back and create the draft.")
        else setMsg("Couldn't create the draft" + (d.error ? (": " + d.error) : "") + ".")
      })
      .catch(function () { setMsg("Error.") })
      .finally(function () { setCreating(false) })
  }

  function startOver() {
    setTranscript(""); baseTranscriptRef.current = ""
    setSubject(""); setBody(""); setHasDraft(false); setMsg(""); setDraftUrl(null)
  }

  const inputStyle = { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }

  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 4 }}>Draft Email</div>
      <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: 12, lineHeight: 1.5 }}>
        Say (or type) how you want this email to go. Claude drafts it using this person's profile and recent history. Review and edit before it goes to your Outlook Drafts — nothing is ever sent automatically.
      </div>

      {!supported && (
        <div style={{ fontSize: 12, color: T.warning, marginBottom: 10, background: T.warningBg, border: "1px solid #fde68a", borderRadius: 6, padding: "6px 10px" }}>
          Voice capture isn't supported in this browser — Chrome or Edge work best. You can still type your instructions below.
        </div>
      )}

      {!hasDraft && (
        <>
          <textarea
            value={transcript}
            onChange={function (e) { setTranscript(e.target.value) }}
            placeholder="e.g. Tell him it was great meeting him at the event last night, invite him to the September 16th session, keep it short and warm..."
            rows={5}
            style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            {supported && (
              <button onClick={toggleListening}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + T.border, background: listening ? T.dangerBg : "white", color: listening ? T.danger : T.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                {listening ? "Stop recording" : "Start recording"}
              </button>
            )}
            <button disabled={!transcript.trim() || generating} onClick={generateDraft}
              style={{ flex: 1, padding: "8px 14px", borderRadius: 8, border: "none", background: T.accent, color: "white", fontSize: 13, cursor: (!transcript.trim() || generating) ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: (!transcript.trim() || generating) ? 0.6 : 1 }}>
              {generating ? "Drafting…" : "Generate draft"}
            </button>
          </div>
        </>
      )}

      {hasDraft && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Subject</div>
          <input value={subject} onChange={function (e) { setSubject(e.target.value) }} style={{ ...inputStyle, marginBottom: 10 }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Body</div>
          <textarea value={body} onChange={function (e) { setBody(e.target.value) }} rows={12} style={{ ...inputStyle, resize: "vertical", marginBottom: 10, lineHeight: 1.5 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={generating} onClick={generateDraft}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + T.border, background: "white", color: T.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              {generating ? "Regenerating…" : "Regenerate"}
            </button>
            <button disabled={creating || hasEmail === false} onClick={createInOutlook}
              style={{ flex: 1, padding: "8px 14px", borderRadius: 8, border: "none", background: T.accent, color: "white", fontSize: 13, cursor: (creating || hasEmail === false) ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: (creating || hasEmail === false) ? 0.6 : 1 }}>
              {creating ? "Creating…" : "Create draft in Outlook"}
            </button>
            <button disabled={creating || generating} onClick={startOver}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + T.border, background: "white", color: T.textTertiary, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Start over
            </button>
          </div>
        </>
      )}

      {msg ? (
        <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 10 }}>
          {msg}{" "}
          {draftUrl ? <a href={draftUrl} target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 600 }}>Open in Outlook →</a> : null}
        </div>
      ) : null}
    </div>
  )
}
