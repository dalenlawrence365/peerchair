"use client"
import { useEffect, useState } from "react"
import { T } from "@/lib/pipelineTheme"

function fmtDate(iso) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Los_Angeles" })
  } catch { return "" }
}

function Chip({ children, tone }) {
  const tones = {
    cfo: { bg: "#eef2ff", fg: "#3730a3", bd: "#c7d2fe" },
    member: { bg: "#ecfdf5", fg: "#065f46", bd: "#a7f3d0" },
    li: { bg: "#eff6ff", fg: "#1d4ed8", bd: "#bfdbfe" },
    warn: { bg: "#fef2f2", fg: "#b42318", bd: "#fecaca" },
  }
  const c = tones[tone] || { bg: T.borderSoft, fg: T.textSecondary, bd: T.border }
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: c.bg, color: c.fg, border: "1px solid " + c.bd }}>{children}</span>
}

export default function AdmitPage() {
  const [items, setItems] = useState(null)
  const [busy, setBusy] = useState({})
  const [done, setDone] = useState({})

  async function load() {
    const r = await fetch("/api/m/pending", { cache: "no-store" })
    const j = await r.json().catch(function () { return { items: [] } })
    setItems(j.items || [])
  }
  useEffect(function () { load() }, [])

  async function act(attendee_id, payload, label) {
    if (payload.action === "decline_cfo_only" && !window.confirm("Decline this request and send the “CFOs only” note? This also drops them from future invites.")) return
    setBusy(function (b) { return { ...b, [attendee_id]: true } })
    try {
      const r = await fetch("/api/events/attendees", {
        // PATCH, not POST: the approve/decline/status mutations live in the
        // route's PATCH handler. POST is the bulk-invite endpoint (expects
        // {slug, person_ids[]}) and returned "no_people" for these payloads.
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: attendee_id, ...payload }),
      })
      const j = await r.json().catch(function () { return {} })
      if (r.ok && (j.ok || j.status)) setDone(function (d) { return { ...d, [attendee_id]: label } })
      else window.alert(j.error || "Something went wrong.")
    } catch (e) { window.alert(String(e.message || e)) }
    finally { setBusy(function (b) { return { ...b, [attendee_id]: false } }) }
  }

  if (items === null) return <div style={{ color: T.textTertiary, fontSize: 14, padding: "24px 4px" }}>Loading requests…</div>

  const open = items.filter(function (it) { return !done[it.attendee_id] })

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "4px 2px 14px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Admit</h1>
        <span style={{ fontSize: 13, color: T.textTertiary }}>{open.length} waiting</span>
      </div>

      {open.length === 0 && (
        <div className="m-card" style={{ padding: 28, textAlign: "center", color: T.textTertiary, fontSize: 14 }}>
          Nobody’s waiting to get in. ✓
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map(function (it) {
          const p = it.person
          const finished = done[it.attendee_id]
          return (
            <div key={it.attendee_id} className="m-card" style={{ padding: 14, opacity: finished ? 0.6 : 1 }}>
              <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.25 }}>{p.name}</div>
              {(p.title || p.company) && (
                <div style={{ fontSize: 13.5, color: T.textSecondary, marginTop: 2 }}>
                  {[p.title, p.company].filter(Boolean).join(" · ")}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
                {p.is_cfo && <Chip tone="cfo">CFO</Chip>}
                {p.cfo_circle_member && <Chip tone="member">CFO Circle</Chip>}
                {p.linkedin_url ? <Chip tone="li">in</Chip> : <Chip tone="warn">no LinkedIn</Chip>}
              </div>
              {it.event && (
                <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 10 }}>
                  Wants in: <strong style={{ color: T.textPrimary }}>{it.event.name}</strong>{it.event.event_date ? " · " + fmtDate(it.event.event_date) : ""}
                </div>
              )}
              {it.notes && <div style={{ fontSize: 12.5, color: T.textTertiary, marginTop: 6, lineHeight: 1.45 }}>{it.notes}</div>}

              {finished ? (
                <div style={{ fontSize: 14, fontWeight: 600, color: finished === "Approved" ? "#065f46" : "#b42318", marginTop: 12 }}>
                  {finished === "Approved" ? "✓ Approved — confirmation drafted" : "Declined"}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
                  <button className="m-btn m-btn-primary" disabled={busy[it.attendee_id]} onClick={function () { act(it.attendee_id, { status: "Confirmed" }, "Approved") }}>
                    {busy[it.attendee_id] ? "…" : "Approve"}
                  </button>
                  <button className="m-btn m-btn-danger" disabled={busy[it.attendee_id]} onClick={function () { act(it.attendee_id, { action: "decline_cfo_only" }, "Declined") }}>
                    Decline
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
