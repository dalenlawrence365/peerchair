"use client"
import Link from "next/link"
import { useEffect, useState, useCallback } from "react"
import { T } from "@/lib/pipelineTheme"

const SLUG = "august-11-workshop"

function shortDate(iso) {
  if (!iso) return ""
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) } catch (e) { return "" }
}
function rosterDate(a) {
  if ((a.status === "Confirmed" || a.status === "Declined") && a.responded_at) return a.status + " " + shortDate(a.responded_at)
  if (a.invited_at) return "Invited " + shortDate(a.invited_at)
  return ""
}

function Chip({ label, bg, color }) {
  return <span style={{ background: bg, color: color, fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 999 }}>{label}</span>
}

function statusChip(status) {
  if (status === "Confirmed") return <Chip label="Confirmed" bg={T.memberBg} color={T.memberText} />
  if (status === "Declined")  return <Chip label="Declined" bg={T.dangerBg} color={T.danger} />
  if (status === "Registered" || status === "Requested") return <Chip label="Registered" bg={T.qualifiedBg} color={T.qualifiedText} />
  return <Chip label="Invited" bg={T.audienceBg} color={T.audienceText} />
}

const PILL = { registered: "#d97706", approved: "#16a34a", confirmed: "#0f766e", noshow: "#dc2626" }
function Pill({ label, date, bg, on }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, lineHeight: 1.3,
      background: on ? bg : "transparent", color: on ? "#ffffff" : "#94a3b8",
      border: "1px solid " + (on ? bg : "#cbd5e1"), whiteSpace: "nowrap",
    }}>
      <span>{label}</span>
      {on && date ? <span style={{ fontWeight: 400, opacity: 0.85 }}>{date}</span> : null}
    </span>
  )
}
function PillTrack({ a }) {
  const isLi = a.source === "li-event"
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Pill label={isLi ? "LinkedIn" : "Invited"} date={shortDate(a.invited_at)} bg={isLi ? "#0a66c2" : "#1a2550"} on={true} />
      <Pill label="Registered" date={shortDate(a.registered_at)} bg={PILL.registered} on={!!a.registered_at} />
      <Pill label="Approved" date={shortDate(a.approved_at)} bg={PILL.approved} on={!!a.approved_at} />
      <Pill label="Confirmed" date={shortDate(a.responded_at)} bg={PILL.confirmed} on={a.status === "Confirmed"} />
      {a.status === "No-show" ? <Pill label="No-show" date="" bg={PILL.noshow} on={true} /> : null}
    </div>
  )
}

export default function EventsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(null)
  const [draftUrl, setDraftUrl] = useState(null)

  const load = useCallback(function () {
    fetch("/api/events/attendees?slug=" + SLUG)
      .then(function (r) { return r.json() })
      .then(function (d) { setData(d); setLoading(false) })
      .catch(function () { setLoading(false) })
  }, [])

  useEffect(function () { load() }, [load])

  function setStatus(id, status, name) {
    setBusy(id)
    fetch("/api/events/attendees", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id, status: status }) })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d && d.ok && status === "Invited") {
          setDraftUrl(null)
          if (d.drafted) {
            setMsg("Approved " + (name || "") + " — a draft invite email is in your Outlook drafts. Review it, then send.")
            if (d.draft_url) setDraftUrl(d.draft_url)
          } else {
            try { navigator.clipboard.writeText(d.invite_url) } catch (e) {}
            setMsg("Approved " + (name || "") + " — approved link copied. Draft not created" + (d.draft_error ? " (" + d.draft_error + ")" : "") + ".")
          }
        } else if (d && d.ok && status === "Declined") {
          setMsg("Declined " + (name || "") + ".")
        } else if (d && d.ok && status === "No-show") {
          setMsg("Marked " + (name || "") + " as a no-show.")
        }
        load()
      })
      .catch(function () { setMsg("Something went wrong.") })
      .finally(function () { setBusy(null) })
  }

  function markConfirmation(id, sent) {
    setBusy(id)
    fetch("/api/events/attendees", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id, mark_confirmation: sent ? "sent" : "unsent" }) })
      .then(function (r) { return r.json() })
      .then(function (d) { if (d && d.ok) { load() } else { setMsg("Couldn't update confirmation.") } })
      .catch(function () { setMsg("Something went wrong.") })
      .finally(function () { setBusy(null) })
  }

  function copy(url) {
    try { navigator.clipboard.writeText(url); setMsg("Approved link copied.") } catch (e) {}
  }

  if (loading) return <div style={{ padding: "28px 32px", color: T.textTertiary }}>Loading…</div>
  if (!data || data.error) return <div style={{ padding: "28px 32px", color: T.danger }}>Couldn’t load the event.</div>

  const ev = data.event || {}
  const c = data.counts || {}
  const all = data.attendees || []
  // Awaiting review = registered but not yet approved. Keying off status alone
  // hid anyone who was invited directly AND then self-registered.
  const TERMINAL = ["Declined", "No-show", "Attended"]
  const awaitingReview = function (a) {
    return TERMINAL.indexOf(a.status) === -1 && !a.approved_at &&
      (!!a.registered_at || a.status === "Registered" || a.status === "Requested")
  }
  const pending = all.filter(awaitingReview)
  const roster = all.filter(function (a) { return !awaitingReview(a) })
  const shortOf = Math.max(0, (ev.min_to_run || 8) - (c.confirmed || 0))

  return (
    <div style={{ padding: "28px 32px", maxWidth: 900 }}>
      <div style={{ marginBottom: 6, fontSize: 22, fontWeight: 600, color: T.textPrimary }}>{ev.name || "Event"}</div>
      <div style={{ color: T.textTertiary, fontSize: 13, marginBottom: 14 }}>Tuesday, August 11, 2026 · 8:30–11:30 AM · Century City</div>
      <div style={{ marginBottom: 18 }}>
        <a href={"/api/events/campaign-export?slug=" + SLUG + "&src=li-dm"} style={{ display: "inline-block", fontSize: 12.5, fontWeight: 600, color: T.accent, textDecoration: "none", border: "1px solid " + T.border, borderRadius: 8, padding: "7px 12px", background: "white" }}>↓ Export CFO campaign CSV (LinkedHelper)</a>
      </div>

      {/* Counts */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <Stat label="Confirmed" value={c.confirmed || 0} sub={shortOf > 0 ? (shortOf + " short of " + (ev.min_to_run || 8)) : "at go threshold"} good={shortOf === 0} />
        <Stat label="Registered" value={c.registered || 0} sub="awaiting your review" highlight={(c.registered || 0) > 0} />
        <Stat label="Invited" value={c.invited || 0} sub="total on the list" />
        <Stat label="Declined" value={c.declined || 0} sub="" />
      </div>

      {msg ? <div style={{ background: "#fffdf5", border: "1px solid #f1e2b8", color: T.textPrimary, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 18 }}>{msg}{draftUrl ? <a href={draftUrl} target="_blank" rel="noopener" style={{ color: T.accent, marginLeft: 10, fontWeight: 600, textDecoration: "none" }}>Open draft →</a> : null}</div> : null}

      {/* Pending */}
      <div style={{ fontSize: 13, fontWeight: 600, color: T.brass || "#b7791f", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Pending requests</div>
      {pending.length === 0 ? (
        <div style={{ color: T.textTertiary, fontSize: 14, marginBottom: 26 }}>No requests waiting. New self-registrations land here.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 30 }}>
          {pending.map(function (a) {
            return (
              <div key={a.id} style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                    <Avatar name={a.name} src={a.avatar_url} />
                    <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary }}>{a.person_id ? <Link href={"/people/" + a.person_id} style={{ color: T.textPrimary, textDecoration: "none" }}>{a.name || "(no name)"}</Link> : (a.name || "(no name)")}{a.company ? <span style={{ fontWeight: 400, color: T.textSecondary }}>{"  ·  " + a.company}</span> : null}</div>
                    <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 2 }}>{a.email || ""}</div>
                    {a.notes ? <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 6 }}>{a.notes}</div> : null}
                    <div style={{ marginTop: 8 }}><PillTrack a={a} /></div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <button disabled={busy === a.id} onClick={function () { setStatus(a.id, "Invited", a.name) }} style={btnPrimary}>Approve</button>
                    <button disabled={busy === a.id} onClick={function () { setStatus(a.id, "Declined", a.name) }} style={btnGhost}>Decline</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Roster */}
      <div style={{ fontSize: 13, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Invited &amp; confirmed</div>
      {roster.length === 0 ? (
        <div style={{ color: T.textTertiary, fontSize: 14 }}>No one invited yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {roster.map(function (a) {
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, background: T.cardBg, border: "1px solid " + T.border, borderRadius: 8, padding: "11px 14px" }}>
                <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                  <Avatar name={a.name} src={a.avatar_url} size={36} />
                  <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    {a.person_id ? <Link href={"/people/" + a.person_id} style={{ fontSize: 14, color: T.textPrimary, fontWeight: 600, textDecoration: "none" }}>{a.name || "(no name)"}</Link> : <span style={{ fontSize: 14, color: T.textPrimary, fontWeight: 600 }}>{a.name || "(no name)"}</span>}
                    {a.linkedin_url ? <a href={a.linkedin_url} target="_blank" rel="noopener noreferrer" title="Open in LinkedIn" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 3, background: "#0a66c2", color: "#fff", fontSize: 10, fontWeight: 700, textDecoration: "none", lineHeight: 1, flexShrink: 0 }}>in</a> : null}
                    {a.linkedin_connected ? <span title="First-degree connection — you can DM them" style={{ fontSize: 10, fontWeight: 700, color: "#0a66c2", border: "1px solid #0a66c2", borderRadius: 999, padding: "1px 6px", lineHeight: 1.5 }}>1st</span> : null}
                    {a.company ? <span style={{ fontSize: 13, color: T.textSecondary, fontWeight: 500 }}>{a.company}</span> : null}
                  </div>
                  <div style={{ marginTop: 6 }}><PillTrack a={a} /></div>
                  {a.email ? <div style={{ marginTop: 5 }}><a href={"mailto:" + a.email} style={{ fontSize: 12, color: T.accent, textDecoration: "none" }}>{a.email}</a></div> : null}
                  {a.notes || a.title ? <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 3 }}>{a.notes || a.title}</div> : null}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end", flexShrink: 0 }}>
                  {a.confirmation_sent_at ? (
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "1px solid #a7e0b8", borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap" }}>✓ Confirmation sent {shortDate(a.confirmation_sent_at)}</span>
                  ) : a.confirmation_draft_weblink ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#9a3412", background: "#ffe4d6", border: "1px solid #f4a273", borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap" }}>⚠ Confirmation NOT sent</span>
                      <div style={{ display: "flex", gap: 10 }}>
                        <a href={a.confirmation_draft_weblink} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#0a66c2", textDecoration: "none" }}>Open draft</a>
                        <button disabled={busy === a.id} onClick={function () { markConfirmation(a.id, true) }} style={{ background: "transparent", color: "#15803d", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Mark sent</button>
                      </div>
                    </div>
                  ) : null}
                  <button onClick={function () { copy(a.invite_url) }} style={btnLink}>Copy approved link</button>
                  {a.status !== "No-show" ? <button disabled={busy === a.id} onClick={function () { setStatus(a.id, "No-show", a.name) }} style={{ background: "transparent", color: "#b3452f", border: "none", fontSize: 12, cursor: "pointer" }}>Mark no-show</button> : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Avatar({ name, src, size }) {
  const s = size || 40
  const initials = (name || "?").split(/\s+/).map(function (w) { return w[0] }).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"
  const [broken, setBroken] = useState(false)
  const box = { width: s, height: s, borderRadius: "50%", flexShrink: 0, background: T.borderSoft }
  if (src && !broken) {
    return <img src={src} alt={name || ""} onError={function () { setBroken(true) }}
      style={Object.assign({}, box, { objectFit: "cover" })} />
  }
  return <div style={Object.assign({}, box, { display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: s * 0.36, fontWeight: 600, color: T.textSecondary })}>{initials}</div>
}

function Stat({ label, value, sub, highlight, good }) {
  return (
    <div style={{
      background: highlight ? "#fffdf5" : T.cardBg,
      border: "1px solid " + (highlight ? "#f1e2b8" : T.border),
      borderRadius: 10, padding: "14px 18px", minWidth: 150,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: good ? T.success : T.textPrimary }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.textSecondary, marginTop: 2 }}>{label}</div>
      {sub ? <div style={{ fontSize: 11.5, color: T.textTertiary, marginTop: 2 }}>{sub}</div> : null}
    </div>
  )
}

const btnPrimary = { background: "#16a34a", color: "white", border: "none", fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 7, cursor: "pointer" }
const btnGhost = { background: "white", color: "#475569", border: "1px solid #e7e8ec", fontSize: 13, fontWeight: 500, padding: "8px 14px", borderRadius: 7, cursor: "pointer" }
const btnLink = { background: "transparent", color: "#2563eb", border: "none", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }
