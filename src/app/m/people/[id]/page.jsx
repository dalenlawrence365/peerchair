"use client"
import { useEffect, useState } from "react"
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

  useEffect(function () {
    (async function () {
      const r = await fetch("/api/people/" + id, { cache: "no-store" })
      const j = await r.json().catch(function () { return {} })
      setPerson(j.person || j)
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
