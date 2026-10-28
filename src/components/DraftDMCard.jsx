"use client"
import { useState } from "react"
import { T } from "@/lib/pipelineTheme"
import { useVoiceInput } from "@/lib/useVoiceInput"
import { WARNING_TAGS } from "@/lib/warningTags"

// Draft DM tab — same idea as Draft Email (voice/typed instructions → Claude
// drafts using this person's profile, tags, and research note → Dalen
// reviews and edits) but for a LinkedIn direct message instead of an
// Outlook email. There's no external system to push a DM into, so instead
// of "Create draft in Outlook" this ends in a Copy button — Dalen copies
// the whole body and pastes it straight into LinkedIn.


export default function DraftDMCard({ personId, statusTags }) {
  const initial = useVoiceInput()
  const more = useVoiceInput()
  const [generating, setGenerating] = useState(false)
  const [body, setBody] = useState("")
  const [hasDraft, setHasDraft] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [msg, setMsg] = useState("")
  const [copied, setCopied] = useState(false)
  const [briefing, setBriefing] = useState(false)
  const [briefWarn, setBriefWarn] = useState(null) // { warnings, instructions }
  const [hhDm, setHhDm] = useState(null) // { kind: ok|warn|err, text, message, variantForce }
  const [hhBusy, setHhBusy] = useState(false)

  // One-click "Invite to next workshop": the server builds the editable
  // instructions from this person's history + their standing on the next event.
  // If they already stand somewhere that makes an invite odd (confirmed, invited,
  // declined...) we stop and show why, with a "Draft anyway" escape hatch.
  function inviteToNextWorkshop(force, kind) {
    setBriefing(true); setMsg(""); setBriefWarn(null)
    fetch("/api/people/" + personId + "/invite-brief?channel=dm" + (kind === "social" ? "&kind=social" : ""), { cache: "no-store" })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (!d || !d.ok) { setMsg(d && d.error === "no_upcoming_event" ? "There's no upcoming published " + (kind === "social" ? "happy hour" : "workshop") + " to invite them to." : "Couldn't build the invite brief."); return }
        initial.setText(d.instructions)
        if (d.warnings && d.warnings.length && !force) { setBriefWarn({ warnings: d.warnings, instructions: d.instructions }); return }
        generateDraft({ override: d.instructions })
      })
      .catch(function () { setMsg("Couldn't build the invite brief.") })
      .finally(function () { setBriefing(false) })
  }

  function generateDraft(opts) {
    const refine = !!(opts && opts.refine)
    const instructions = ((opts && opts.override) ? opts.override : (refine ? more.text : initial.text)).trim()
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

  function happyHourDm(force) {
    setHhBusy(true); setHhDm(null)
    fetch("/api/people/" + personId + "/happy-hour-dm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: force === true }) })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.ok) {
          const warn = d.connected ? "" : " Heads up: they're not marked as a 1st-degree connection, so LinkedIn may not deliver a DM."
          navigator.clipboard.writeText(d.message)
            .then(function () { setHhDm({ kind: "ok", text: "Message copied — paste it into LinkedIn. Marked Invited (assumed sent)." + warn, message: d.message }) })
            .catch(function () { setHhDm({ kind: "ok", text: "Marked Invited (assumed sent), but I couldn't copy automatically — copy the message below." + warn, message: d.message }) })
        } else if (d.error === "already") {
          const st = d.status
          const what = st === "Queued" ? "already has a happy hour email draft waiting (not sent yet)"
            : st === "Invited" ? "was already sent the happy hour invite"
            : (st === "Registered" || st === "Requested") ? "has already registered for the happy hour"
            : st === "Confirmed" ? "is already confirmed for the happy hour"
            : st === "Declined" || st === "Unavailable" ? "already said they can't make the happy hour"
            : "is already on the happy hour roster (" + st + ")"
          setHhDm({ kind: "warn", text: "Nothing copied — this person " + what + "." })
        }
        else if (d.error === "blocked") setHhDm({ kind: "err", text: "Not created — this person is tagged " + (d.tags || []).join(", ") + "." })
        else if (d.error === "no_upcoming_happy_hour") setHhDm({ kind: "err", text: "No upcoming published happy hour event found." })
        else setHhDm({ kind: "err", text: "Couldn't build the message" + (d.error ? (": " + d.error) : "") + "." })
      })
      .catch(function () { setHhDm({ kind: "err", text: "Couldn't build the message — network error." }) })
      .finally(function () { setHhBusy(false) })
  }

  function undoHappyHourDm() {
    setHhBusy(true)
    fetch("/api/people/" + personId + "/happy-hour-dm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undo: true }) })
      .then(function (r) { return r.json() })
      .then(function (d) { setHhDm({ kind: "warn", text: d && d.undone ? "Undone — removed from the happy hour roster. Nothing is marked as sent." : "Nothing to undo (they were invited some other way)." }) })
      .catch(function () { setHhDm({ kind: "err", text: "Couldn't undo — network error." }) })
      .finally(function () { setHhBusy(false) })
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary }}>Draft DM</div>
        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}><button disabled={briefing || generating} onClick={function () { inviteToNextWorkshop(false, "workshop") }}
          title="Builds the message from this person's history and the next workshop, with their personal tracked link. You can edit everything after."
          style={{ padding: "4px 11px", borderRadius: 999, border: "1px solid " + T.accent, background: "white", color: T.accent, fontSize: 12, fontWeight: 600, cursor: (briefing || generating) ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: (briefing || generating) ? 0.6 : 1, whiteSpace: "nowrap" }}>
          {briefing ? "Reading history…" : "✦ Invite to next workshop"}
        </button>
        <button disabled={briefing || generating} onClick={function () { inviteToNextWorkshop(false, "social") }}
          title="Builds a casual invite to the next happy hour with their personal tracked link."
          style={{ padding: "4px 11px", borderRadius: 999, border: "1px solid " + T.accent, background: "white", color: T.accent, fontSize: 12, fontWeight: 600, cursor: (briefing || generating) ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: (briefing || generating) ? 0.6 : 1, whiteSpace: "nowrap" }}>
          ✦ Invite to happy hour
        </button>
        <button disabled={hhBusy || generating} onClick={function () { happyHourDm(false) }}
          title="One click: copies the approved November happy hour DM (with this person's tracked link) and marks them Invited, assuming you paste and send it."
          style={{ padding: "4px 11px", borderRadius: 999, border: "1px solid " + T.accent, background: T.accent, color: "white", fontSize: 12, fontWeight: 600, cursor: (hhBusy || generating) ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: (hhBusy || generating) ? 0.6 : 1, whiteSpace: "nowrap" }}>
          {hhBusy ? "Working…" : "✉ Nov happy hour DM → copy"}
        </button></span>
      </div>
      {hhDm ? (
        <div style={{ margin: "6px 0 10px", padding: "10px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, lineHeight: 1.5,
          background: hhDm.kind === "ok" ? "#dcfce7" : (hhDm.kind === "warn" ? "#fef3c7" : "#fee2e2"),
          border: "1px solid " + (hhDm.kind === "ok" ? "#86efac" : (hhDm.kind === "warn" ? "#fcd34d" : "#fca5a5")),
          color: hhDm.kind === "ok" ? "#166534" : (hhDm.kind === "warn" ? "#92400e" : "#991b1b") }}>
          {hhDm.kind === "ok" ? "✓ " : (hhDm.kind === "warn" ? "⚠ " : "✕ ")}{hhDm.text}{" "}
          {hhDm.kind === "ok" ? <button disabled={hhBusy} onClick={undoHappyHourDm} style={{ marginLeft: 6, padding: "3px 10px", borderRadius: 6, border: "1px solid #166534", background: "white", color: "#166534", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Didn't send — undo</button> : null}
          {hhDm.text.indexOf("Nothing copied") === 0 ? <button disabled={hhBusy} onClick={function () { happyHourDm(true) }} style={{ marginLeft: 6, padding: "3px 10px", borderRadius: 6, border: "1px solid #92400e", background: "white", color: "#92400e", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Copy anyway</button> : null}
          {hhDm.message ? <textarea readOnly value={hhDm.message} rows={5} onFocus={function (e) { e.target.select() }} style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: "8px 10px", fontSize: 12, fontWeight: 400, border: "1px solid #86efac", borderRadius: 6, fontFamily: "inherit", color: "#14532d", background: "white" }} /> : null}
        </div>
      ) : null}
      {briefWarn ? (
        <div style={{ fontSize: 12, color: T.warning, marginBottom: 10, background: T.warningBg, border: "1px solid #fde68a", borderRadius: 6, padding: "8px 10px", lineHeight: 1.5 }}>
          {briefWarn.warnings.map(function (w, i) { return <div key={i}>⚠ {w}</div> })}
          <button onClick={function () { setBriefWarn(null); generateDraft({ override: briefWarn.instructions }) }}
            style={{ marginTop: 6, padding: "4px 10px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textPrimary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Draft anyway</button>
          <button onClick={function () { setBriefWarn(null) }}
            style={{ marginTop: 6, marginLeft: 6, padding: "4px 10px", borderRadius: 6, border: "none", background: "transparent", color: T.textTertiary, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Dismiss</button>
        </div>
      ) : null}
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
