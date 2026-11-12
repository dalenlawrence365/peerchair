"use client"
import { useEffect, useState, useRef } from "react"
import { useParams } from "next/navigation"
import { T } from "@/lib/pipelineTheme"

const EVENT_BASE = "https://la-cfo.com/events/"

function fmtWhen(iso) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })
  } catch { return "" }
}
function first(p) { return (p && (p.first_name || (p.full_name || "").split(" ")[0])) || "there" }
function link(ev) { return EVENT_BASE + ev.slug }

function dmTemplate(p, ev) {
  const when = fmtWhen(ev.event_date)
  if (ev.kind === "workshop")
    return `Hi ${first(p)} — I'd like to invite you to our workshop, ${ev.name}, on ${when}. I think you'd get real value from it. Details & RSVP: ${link(ev)}`
  if (ev.kind === "happy_hour")
    return `Hi ${first(p)} — we're getting LA CFOs together for ${ev.name} on ${when}. Would love to have you join us. Details & RSVP: ${link(ev)}`
  return `Hi ${first(p)} — I'd love to have you join us for ${ev.name} on ${when}. Details & RSVP: ${link(ev)}`
}
function emailTemplate(p, ev) {
  const when = fmtWhen(ev.event_date)
  return {
    subject: `Invitation: ${ev.name}`,
    body: `Hi ${first(p)},\n\nI'd love to have you join us for ${ev.name} on ${when}.\n\nYou can see the details and RSVP here:\n${link(ev)}\n\nHope to see you there.\n\nBest,\nDalen`,
  }
}

function Chip({ children, tone }) {
  const tones = { cfo: { bg: "#eef2ff", fg: "#3730a3", bd: "#c7d2fe" }, member: { bg: "#ecfdf5", fg: "#065f46", bd: "#a7f3d0" }, sponsor: { bg: "#fff7ed", fg: "#9a3412", bd: "#fed7aa" } }
  const c = tones[tone] || { bg: T.borderSoft, fg: T.textSecondary, bd: T.border }
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: c.bg, color: c.fg, border: "1px solid " + c.bd }}>{children}</span>
}

export default function MobileProfile() {
  const { id } = useParams()
  const [person, setPerson] = useState(null)
  const [events, setEvents] = useState([])
  const [mode, setMode] = useState(null) // "dm" | "email" | null
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [picked, setPicked] = useState(null) // event id used for AI craft
  const [aiBusy, setAiBusy] = useState(false)
  const [sendBusy, setSendBusy] = useState(false)
  const [flash, setFlash] = useState(null)
  const [draftUrl, setDraftUrl] = useState(null)
  // Notes
  const [notes, setNotes] = useState([])
  const [noteText, setNoteText] = useState("")
  const [recording, setRecording] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [noteMsg, setNoteMsg] = useState(null)
  const recognitionRef = useRef(null)
  const noteBaseRef = useRef("")

  function extractNotes(comms) {
    return (comms || []).filter(function (c) {
      const ch = (c.channel || "").toLowerCase(), sl = (c.step_label || "").toLowerCase()
      return ch.indexOf("note") >= 0 || sl === "note" || c.direction === "INTERNAL"
    }).slice(0, 5)
  }

  useEffect(function () {
    (async function () {
      const r = await fetch("/api/people/" + id, { cache: "no-store" })
      const j = await r.json().catch(function () { return {} })
      setPerson(j.person || j)
      setNotes(extractNotes(j.communications))
      const er = await fetch("/api/m/events-upcoming", { cache: "no-store" })
      const ej = await er.json().catch(function () { return { events: [] } })
      setEvents(ej.events || [])
    })()
  }, [id])

  function openCompose(m) {
    setMode(m); setPicked(null); setDraftUrl(null); setFlash(null)
    setSubject(""); setBody("")
  }
  function applyTemplate(ev) {
    setPicked(ev.id); setDraftUrl(null); setFlash(null)
    if (mode === "dm") setBody(dmTemplate(person, ev))
    else { const t = emailTemplate(person, ev); setSubject(t.subject); setBody(t.body) }
  }

  // Voice dictation (Web Speech API, Chrome/Edge; on iOS the keyboard mic also
  // works straight into the box). Appends final chunks to whatever's there.
  function toggleDictation() {
    if (recording) { if (recognitionRef.current) recognitionRef.current.stop(); return }
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SR) { setNoteMsg("Voice dictation isn't available in this browser — use your keyboard's mic, or type."); return }
    const rec = new SR()
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US"
    noteBaseRef.current = noteText ? noteText.trim() + " " : ""
    rec.onresult = function (e) {
      let fin = ""
      for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) fin += e.results[i][0].transcript }
      if (fin) { noteBaseRef.current = noteBaseRef.current + fin + " "; setNoteText(noteBaseRef.current.replace(/\s+/g, " ").trimStart()) }
    }
    rec.onend = function () { setRecording(false) }
    rec.onerror = function () { setRecording(false) }
    recognitionRef.current = rec
    try { rec.start(); setRecording(true); setNoteMsg(null) } catch (e) { setRecording(false) }
  }

  async function cleanUpNote() {
    const t = noteText.trim(); if (!t) return
    if (recording && recognitionRef.current) recognitionRef.current.stop()
    setCleaning(true); setNoteMsg(null)
    try {
      const r = await fetch("/api/people/" + id + "/clean-note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t }) })
      const j = await r.json().catch(function () { return {} })
      if (r.ok && j.note) setNoteText(j.note)
      else setNoteMsg(j.error || "Couldn't clean that up — your note is still here.")
    } catch (e) { setNoteMsg(String(e.message || e)) }
    finally { setCleaning(false) }
  }

  async function saveNote() {
    const t = noteText.trim(); if (!t) return
    if (recording && recognitionRef.current) recognitionRef.current.stop()
    setSavingNote(true); setNoteMsg(null)
    try {
      const r = await fetch("/api/people/" + id + "/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "note", body: t }) })
      const j = await r.json().catch(function () { return {} })
      if (r.ok && !j.error) {
        setNotes(function (prev) { return [{ id: "tmp" + Date.now(), occurred_at: new Date().toISOString(), channel: "Note", body: t }].concat(prev).slice(0, 5) })
        setNoteText(""); setNoteMsg("Saved.")
      } else setNoteMsg(j.error || "Couldn't save the note.")
    } catch (e) { setNoteMsg(String(e.message || e)) }
    finally { setSavingNote(false) }
  }

  async function craftAI() {
    const ev = events.find(function (e) { return e.id === picked })
    let instructions
    if (ev) {
      const when = fmtWhen(ev.event_date)
      instructions = (mode === "dm")
        ? `Write a short, warm LinkedIn DM (2–3 sentences, no subject line, no formal salutation) inviting them to ${ev.name} on ${when}. Include this RSVP link exactly once: ${link(ev)}.`
        : `Write a short, warm invitation email to ${ev.name} on ${when}. Include this RSVP link: ${link(ev)}.`
    } else {
      if (!body.trim()) { setFlash("Pick an event or type what to say first."); return }
      instructions = body.trim()
    }
    setAiBusy(true); setFlash(null)
    try {
      const url = mode === "dm" ? "/api/people/" + id + "/draft-dm" : "/api/people/" + id + "/draft-email"
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "generate", instructions, previous_body: body.trim() || undefined }) })
      const j = await r.json().catch(function () { return {} })
      if (!r.ok) { setFlash(j.error || "Couldn't craft that."); return }
      if (mode === "email" && j.subject) setSubject(j.subject)
      if (j.body) setBody(j.body)
    } catch (e) { setFlash(String(e.message || e)) }
    finally { setAiBusy(false) }
  }

  async function copyDM() {
    try { await navigator.clipboard.writeText(body); setFlash("Copied — paste it into LinkedIn.") }
    catch { setFlash("Couldn't copy automatically — select the text to copy.") }
  }
  function openLinkedIn() {
    if (person && person.linkedin_url) window.open(person.linkedin_url, "_blank")
  }
  async function createEmailDraft() {
    if (!person || !person.email) { setFlash("No email on file for this person."); return }
    if (!subject.trim() || !body.trim()) { setFlash("Need a subject and a body."); return }
    setSendBusy(true); setFlash(null)
    try {
      const r = await fetch("/api/people/" + id + "/draft-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "create", subject: subject.trim(), body: body.trim() }) })
      const j = await r.json().catch(function () { return {} })
      if (!r.ok || !j.ok) { setFlash(j.error === "no_email" ? "No email on file." : (j.error || "Draft failed.")); return }
      setDraftUrl(j.draft_url || null); setFlash("Draft created in your Outlook.")
    } catch (e) { setFlash(String(e.message || e)) }
    finally { setSendBusy(false) }
  }

  if (!person) return <div style={{ color: T.textTertiary, fontSize: 14, padding: "24px 4px" }}>Loading…</div>

  const roles = person.roles || []
  const name = person.full_name || [person.first_name, person.last_name].filter(Boolean).join(" ") || "—"
  const hasLinkedIn = !!person.linkedin_url
  const hasEmail = !!person.email

  return (
    <div>
      <a href="/m/people" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13.5, color: T.accent, textDecoration: "none", margin: "2px 0 12px" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg> People
      </a>

      <div className="m-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}>{name}</div>
        {(person.title || person.company) && (
          <div style={{ fontSize: 14, color: T.textSecondary, marginTop: 3 }}>{[person.title, person.company].filter(Boolean).join(" · ")}</div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 11 }}>
          {roles.includes("cfo") && <Chip tone="cfo">CFO</Chip>}
          {person.cfo_circle_member && <Chip tone="member">CFO Circle</Chip>}
          {roles.includes("sponsor_contact") && <Chip tone="sponsor">Sponsor</Chip>}
          {person.event_tier && <Chip>Tier {person.event_tier}</Chip>}
        </div>
        {hasEmail && <div style={{ fontSize: 13.5, color: T.textSecondary, marginTop: 11, wordBreak: "break-all" }}>{person.email}</div>}
        {hasLinkedIn && <a href={person.linkedin_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", fontSize: 13.5, color: T.accent, marginTop: 4, textDecoration: "none" }}>LinkedIn profile ↗</a>}
      </div>

      {/* Note capture — type or dictate, optional AI cleanup, lands on this person */}
      <div className="m-card" style={{ padding: 14, marginTop: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Note</div>
        <textarea className="m-input" rows={noteText || recording ? 4 : 2} value={noteText}
          onChange={function (e) { setNoteText(e.target.value) }}
          placeholder="Jot or dictate a note about this person…"
          style={{ borderColor: recording ? "#dc2626" : T.border }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <button onClick={toggleDictation} className="m-btn"
            style={{ width: "auto", minHeight: 42, padding: "0 14px", flex: "0 0 auto", fontSize: 14,
              borderColor: recording ? "#dc2626" : T.border, color: recording ? "#dc2626" : T.textPrimary, background: recording ? "#fef2f2" : T.cardBg }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            {recording ? "Recording…" : "Dictate"}
          </button>
          {noteText.trim() && (
            <button onClick={cleanUpNote} disabled={cleaning} className="m-btn"
              style={{ width: "auto", minHeight: 42, padding: "0 14px", flex: "1 1 auto", fontSize: 14, color: cleaning ? T.textTertiary : "#7c3aed" }}>
              {cleaning ? "Cleaning…" : "✨ Clean up"}
            </button>
          )}
        </div>
        {noteText.trim() && (
          <button className="m-btn m-btn-primary" disabled={savingNote} onClick={saveNote} style={{ marginTop: 8 }}>
            {savingNote ? "Saving…" : "Save note"}
          </button>
        )}
        {noteMsg && <div style={{ fontSize: 13, color: noteMsg === "Saved." ? "#065f46" : T.textSecondary, marginTop: 9, lineHeight: 1.45 }}>{noteMsg}</div>}
        {notes.length > 0 && (
          <div style={{ marginTop: 14, borderTop: "1px solid " + T.border, paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            {notes.map(function (n) {
              return (
                <div key={n.id} style={{ fontSize: 13.5, color: T.textPrimary, lineHeight: 1.5 }}>
                  <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 2 }}>{fmtWhen(n.occurred_at)}</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {!mode && (
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button className="m-btn m-btn-primary" onClick={function () { openCompose("dm") }}>Message</button>
          <button className="m-btn" onClick={function () { openCompose("email") }}>Email</button>
        </div>
      )}

      {mode && (
        <div className="m-card" style={{ padding: 14, marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{mode === "dm" ? "LinkedIn message" : "Email"}</div>
            <button onClick={function () { setMode(null) }} style={{ background: "none", border: 0, color: T.textTertiary, fontSize: 20, lineHeight: 1, cursor: "pointer" }}>×</button>
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.textTertiary, marginBottom: 7 }}>CHOOSE A TEMPLATE</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 13 }}>
            {events.map(function (ev) {
              return (
                <button key={ev.id} onClick={function () { applyTemplate(ev) }}
                  style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 999, cursor: "pointer",
                    border: "1px solid " + (picked === ev.id ? T.accent : T.border),
                    background: picked === ev.id ? "#eff6ff" : T.cardBg, color: picked === ev.id ? T.accent : T.textPrimary }}>
                  Invite · {ev.name}
                </button>
              )
            })}
            {events.length === 0 && <span style={{ fontSize: 13, color: T.textTertiary }}>No upcoming events to invite to.</span>}
          </div>

          {mode === "email" && (
            <input className="m-input" value={subject} onChange={function (e) { setSubject(e.target.value) }} placeholder="Subject" style={{ marginBottom: 10 }} />
          )}
          <textarea className="m-input" rows={mode === "dm" ? 6 : 9} value={body} onChange={function (e) { setBody(e.target.value) }}
            placeholder={mode === "dm" ? "Write a message, or pick a template / craft with AI…" : "Write the email, or pick a template / craft with AI…"} />

          <button className="m-btn" disabled={aiBusy} onClick={craftAI} style={{ marginTop: 10 }}>
            {aiBusy ? "Crafting…" : "✨ Craft with AI"}
          </button>

          {flash && <div style={{ fontSize: 13, color: draftUrl ? "#065f46" : T.textSecondary, marginTop: 11, lineHeight: 1.45 }}>{flash}</div>}

          {mode === "dm" ? (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="m-btn m-btn-primary" disabled={!body.trim()} onClick={copyDM}>Copy</button>
              <button className="m-btn" disabled={!hasLinkedIn} onClick={openLinkedIn}>{hasLinkedIn ? "Open LinkedIn" : "No LinkedIn"}</button>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              {draftUrl ? (
                <a href={draftUrl} target="_blank" rel="noreferrer" className="m-btn m-btn-primary" style={{ textDecoration: "none" }}>Open draft in Outlook ↗</a>
              ) : (
                <button className="m-btn m-btn-primary" disabled={sendBusy || !hasEmail} onClick={createEmailDraft}>
                  {sendBusy ? "Creating…" : hasEmail ? "Create Outlook draft" : "No email on file"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
