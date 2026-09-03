"use client"
import { useState } from "react"
import { T } from "@/lib/pipelineTheme"
import { useVoiceInput } from "@/lib/useVoiceInput"
import { WARNING_TAGS } from "@/lib/warningTags"

// Draft Email tab — voice (or typed) instructions → Claude drafts a real,
// personalized email using the person's profile + recent history → Dalen
// reviews and edits the actual text → approves → lands in his real Outlook
// Drafts folder. Never sends anything itself, same convention as every other
// email flow in this app (EventLinkCard's Draft email button, event
// reminders, etc.) — this only ever calls mode="create", which is a Graph
// draft create, not a send.
//
// After the first draft, "Say more" lets Dalen add more context (voice or
// typed) and regenerate — the request carries the CURRENT (possibly
// hand-edited) subject/body as previous_subject/previous_body, so the model
// revises what's there instead of throwing it away and starting over.


export default function DraftEmailCard({ personId, statusTags }) {
  const initial = useVoiceInput()
  const more = useVoiceInput()
  const [generating, setGenerating] = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [hasDraft, setHasDraft] = useState(false)
  const [hasEmail, setHasEmail] = useState(null) // null = unknown yet
  const [showMore, setShowMore] = useState(false)
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState("")
  const [draftUrl, setDraftUrl] = useState(null)

  function generateDraft(opts) {
    const refine = !!(opts && opts.refine)
    const instructions = (refine ? more.text : initial.text).trim()
    if (!refine && !instructions) return
    setGenerating(true); setMsg("")
    if (!refine) setHasDraft(false)
    const payload = { mode: "generate", instructions: instructions || "Polish and tighten this draft." }
    if (refine) { payload.previous_subject = subject; payload.previous_body = body }
    fetch("/api/people/" + personId + "/draft-email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.subject && d.body) {
          setSubject(d.subject); setBody(d.body); setHasDraft(true); setHasEmail(!!d.has_email)
          if (refine) { more.reset(); setShowMore(false) }
          setMsg(!d.has_email ? "Drafted — but this person has no email on file yet, so it can't be created in Outlook until one's added." : "")
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
    initial.reset(); more.reset()
    setSubject(""); setBody(""); setHasDraft(false); setMsg(""); setDraftUrl(null); setShowMore(false)
  }

  const inputStyle = { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }

  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 4 }}>Draft Email</div>
      <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: 12, lineHeight: 1.5 }}>
        Say (or type) how you want this email to go. Claude drafts it using this person's profile and recent history, current tags, and latest research note. Review and edit before it goes to your Outlook Drafts — nothing is ever sent automatically.
      </div>

      {(function(){
        const flagged = (statusTags || []).filter(function(t){ return WARNING_TAGS.indexOf(t) >= 0 })
        if (!flagged.length) return null
        return (
          <div style={{ fontSize: 12, color: T.danger, marginBottom: 10, background: T.dangerBg, border: "1px solid #fecaca", borderRadius: 6, padding: "8px 10px", fontWeight: 500 }}>
            ⚠ This person is tagged {flagged.join(", ")} — double-check before reaching out.
          </div>
        )
      })()}

      {!initial.supported && (
        <div style={{ fontSize: 12, color: T.warning, marginBottom: 10, background: T.warningBg, border: "1px solid #fde68a", borderRadius: 6, padding: "6px 10px" }}>
          Voice capture isn't supported in this browser — Chrome or Edge work best. You can still type your instructions below.
        </div>
      )}

      {!hasDraft && (
        <>
          <textarea
            value={initial.text}
            onChange={function (e) { initial.setText(e.target.value) }}
            placeholder="e.g. Tell him it was great meeting him at the event last night, invite him to the September 16th session, keep it short and warm..."
            rows={5}
            style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            {initial.supported && (
              <button onClick={initial.toggleListening}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + T.border, background: initial.listening ? T.dangerBg : "white", color: initial.listening ? T.danger : T.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                {initial.listening ? "Stop recording" : "Start recording"}
              </button>
            )}
            <button disabled={!initial.text.trim() || generating} onClick={function () { generateDraft() }}
              style={{ flex: 1, padding: "8px 14px", borderRadius: 8, border: "none", background: T.accent, color: "white", fontSize: 13, cursor: (!initial.text.trim() || generating) ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: (!initial.text.trim() || generating) ? 0.6 : 1 }}>
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

          {showMore ? (
            <div style={{ border: "1px solid " + T.border, borderRadius: 8, padding: 10, marginBottom: 10, background: T.bgSubtle || "rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Say more</div>
              <textarea
                autoFocus
                value={more.text}
                onChange={function (e) { more.setText(e.target.value) }}
                placeholder="Add more context — e.g. also mention the referral he sent last week, and soften the ask..."
                rows={3}
                style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                {more.supported && (
                  <button onClick={more.toggleListening}
                    style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + T.border, background: more.listening ? T.dangerBg : "white", color: more.listening ? T.danger : T.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                    {more.listening ? "Stop recording" : "Start recording"}
                  </button>
                )}
                <button disabled={generating} onClick={function () { generateDraft({ refine: true }) }}
                  style={{ flex: 1, padding: "8px 14px", borderRadius: 8, border: "none", background: T.accent, color: "white", fontSize: 13, cursor: generating ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: generating ? 0.6 : 1 }}>
                  {generating ? "Regenerating…" : "Regenerate with this"}
                </button>
                <button disabled={generating} onClick={function () { setShowMore(false); more.reset() }}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + T.border, background: "white", color: T.textTertiary, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8 }}>
            {!showMore && (
              <button disabled={generating} onClick={function () { setShowMore(true) }}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + T.border, background: "white", color: T.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                Say more
              </button>
            )}
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
