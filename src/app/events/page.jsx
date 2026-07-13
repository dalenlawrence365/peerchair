"use client"
import { useEffect, useState, useCallback } from "react"
import { T } from "@/lib/pipelineTheme"

const SLUG = "august-11-workshop"

function Chip({ label, bg, color }) {
  return <span style={{ background: bg, color: color, fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 999 }}>{label}</span>
}

function statusChip(status) {
  if (status === "Confirmed") return <Chip label="Confirmed" bg={T.memberBg} color={T.memberText} />
  if (status === "Declined")  return <Chip label="Declined" bg={T.dangerBg} color={T.danger} />
  if (status === "Requested") return <Chip label="Requested" bg={T.qualifiedBg} color={T.qualifiedText} />
  return <Chip label="Invited" bg={T.audienceBg} color={T.audienceText} />
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
            setMsg("Approved " + (name || "") + " — invite link copied (couldn't create a draft; paste it to them).")
          }
        } else if (d && d.ok && status === "Declined") {
          setMsg("Declined " + (name || "") + ".")
        }
        load()
      })
      .catch(function () { setMsg("Something went wrong.") })
      .finally(function () { setBusy(null) })
  }

  function copy(url) {
    try { navigator.clipboard.writeText(url); setMsg("Invite link copied.") } catch (e) {}
  }

  if (loading) return <div style={{ padding: "28px 32px", color: T.textTertiary }}>Loading…</div>
  if (!data || data.error) return <div style={{ padding: "28px 32px", color: T.danger }}>Couldn’t load the event.</div>

  const ev = data.event || {}
  const c = data.counts || {}
  const all = data.attendees || []
  const pending = all.filter(function (a) { return a.status === "Requested" })
  const roster = all.filter(function (a) { return a.status !== "Requested" })
  const shortOf = Math.max(0, (ev.min_to_run || 8) - (c.confirmed || 0))

  return (
    <div style={{ padding: "28px 32px", maxWidth: 900 }}>
      <div style={{ marginBottom: 6, fontSize: 22, fontWeight: 600, color: T.textPrimary }}>{ev.name || "Event"}</div>
      <div style={{ color: T.textTertiary, fontSize: 13, marginBottom: 18 }}>Tuesday, August 11, 2026 · 8:30–11:30 AM · Century City</div>

      {/* Counts */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <Stat label="Confirmed" value={c.confirmed || 0} sub={shortOf > 0 ? (shortOf + " short of " + (ev.min_to_run || 8)) : "at go threshold"} good={shortOf === 0} />
        <Stat label="Pending requests" value={c.requested || 0} sub="awaiting your review" highlight={(c.requested || 0) > 0} />
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
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary }}>{a.name || "(no name)"}{a.company ? <span style={{ fontWeight: 400, color: T.textSecondary }}>{"  ·  " + a.company}</span> : null}</div>
                    <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 2 }}>{a.email || ""}</div>
                    {a.notes ? <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 6 }}>{a.notes}</div> : null}
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
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, color: T.textPrimary, fontWeight: 600 }}>{a.name || "(no name)"}</span>
                    {statusChip(a.status)}
                    {a.company ? <span style={{ fontSize: 13, color: T.textSecondary, fontWeight: 500 }}>{a.company}</span> : null}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.textTertiary, marginTop: 3 }}>{a.notes || a.title || ""}</div>
                </div>
                <button onClick={function () { copy(a.invite_url) }} style={Object.assign({ flexShrink: 0 }, btnLink)}>Copy invite link</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
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
