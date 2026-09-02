"use client"
import { useState } from "react"
import { T } from "@/lib/pipelineTheme"
import { useVoiceInput } from "@/lib/useVoiceInput"

// Draft DM tab — same idea as Draft Email (voice/typed instructions → Claude
// drafts using this person's profile, tags, and research note → Dalen
// reviews and edits) but for a LinkedIn direct message instead of an
// Outlook email. There's no external system to push a DM into, so instead
// of "Create draft in Outlook" this ends in a Copy button — Dalen copies
// the whole body and pastes it straight into LinkedIn.

// Same list the server checks before drafting — kept here too so the
// warning is visible the moment the tab opens, before Dalen even generates.
const WARNING_TAGS = ["do_not_contact", "opted_out", "not_a_fit", "out_of_market"]

export default function DraftDMCard({ personId, statusTags }) {
  const initial = useVoiceInput()
  const more = useVoiceInput()
  const [generating, setGenerating] = useState(false)
  const [body, setBody] = useState("")
  const [hasDraft, setHasDraft] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [msg, setMsg] = useState("")
  const [copied, setCopied] = useState(false)

  function generateDraft(opts) {
    const refine = !!(opts && opts.refine)
    const instructions = (refine ? more.text : initial.text).trim()
    if (!refine && !instructions) return
    setGenerating(true); setMsg(""); setCopied(false)
    if (!refine) setHasDraft(false)
    const payload = { mode: "generate", instructions: instructions || "Polish and tighten this draft." }
    if (refine) payload.previous_body = body
    fetch("/api/people/" + personId + "/draft-dm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.body) {
          setBody(d.body); setHasDraft(true)
          if (refine) { more.reset(); setShowMore(false) }
        } else {
          setMsg("Couldn't generate a draft" + (d.error ? (": " + d.error) : "") + ".")
        }
      })
      .catch(function () { setMsg("Error generating draft.") })
      .finally(function () { setGenerating(false) })
  }

  function copyToClipboard() {
    if (!body.trim()) return
    navigator.clipboard.writeText(body.trim())
      .then(function () { setCopied(true); setTimeout(function () { setCopied(false) }, 2000) })
      .catch(function () { setMsg("Couldn't copy — select the text and copy manually.") })
  }

  function startOver() {
    initial.reset(); more.reset()
    setBody(""); setHasDraft(false); setMsg(""); setShowMore(false); setCopied(false)
  }

  const inputStyle = { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }

  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 4 }}>Draft DM</div>
      <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: 12, lineHeight: 1.5 }}>
        Say (or type) how you want this LinkedIn message to go. Claude drafts it using this person's profile and recent history, current tags, and latest research note. Review and edit, then copy it into LinkedIn — nothing is ever sent automatically.
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
            placeholder="e.g. Tell him it was great meeting him at the event last night, invite him to the September 16th session, keep it short and casual..."
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
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Message</div>
          <textarea value={body} onChange={function (e) { setBody(e.target.value) }} rows={10} style={{ ...inputStyle, resize: "vertical", marginBottom: 10, lineHeight: 1.5 }} />

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
            <button disabled={!body.trim()} onClick={copyToClipboard}
              style={{ flex: 1, padding: "8px 14px", borderRadius: 8, border: "none", background: copied ? T.success || "#16a34a" : T.accent, color: "white", fontSize: 13, cursor: !body.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: !body.trim() ? 0.6 : 1 }}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button disabled={generating} onClick={startOver}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + T.border, background: "white", color: T.textTertiary, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Start over
            </button>
          </div>
        </>
      )}

      {msg ? (
        <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 10 }}>{msg}</div>
      ) : null}
    </div>
  )
}
