"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

const GROUP_SHORT = {
  "Middle Market Affinity Group": "Middle Market",
  "M$A/Capital Formation Group": "M&A Capital",
  "Transactions & Transitions": "T&T",
  "Valley Distributors & Manufacturers": "VDAM",
  "Mergers & Acquisitions 2": "M&A 2",
}
function fmtDate(d) {
  if (!d) return "—"
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
}
function initials(name) {
  return (name || "?").split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase()
}

function Face({ p }) {
  const src = p.photo_url || p.avatar_url
  if (src) return <img src={src} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  return (
    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#e5e7eb", color: T.textTertiary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
      {initials(p.full_name)}
    </div>
  )
}

export default function MeetingDetail() {
  const params = useParams()
  const id = params?.id
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState("")

  useEffect(() => {
    if (!id) return
    fetch(`/api/meetings/${id}`).then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else setData(d)
    }).catch(e => setError(String(e)))
  }, [id])

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  const { meeting, attendees } = data
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? attendees.filter(p => (p.full_name || "").toLowerCase().includes(needle) || (p.company || "").toLowerCase().includes(needle))
    : attendees

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 1000 }}>
      <Link href="/provisors/meetings" style={{ fontSize: 12, color: T.textTertiary, textDecoration: "none" }}>← Meetings</Link>
      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: "8px 0 2px" }}>
        {GROUP_SHORT[meeting.group] || meeting.group || "Meeting"}
      </h1>
      <div style={{ fontSize: 13, color: T.textTertiary, marginBottom: 18 }}>
        {fmtDate(meeting.meeting_date)} · {attendees.length} attended
      </div>

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find someone — name or company…"
        style={{ width: "100%", maxWidth: 420, padding: "9px 12px", fontSize: 13, borderRadius: 8, border: "1px solid " + T.border, marginBottom: 18, fontFamily: "inherit", boxSizing: "border-box" }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
        {shown.map(p => (
          <div key={p.id} style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
            <Face p={p} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link href={`/people/${p.id}`} style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, textDecoration: "none" }}>{p.full_name}</Link>
              <div style={{ fontSize: 11.5, color: T.textTertiary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.title ? p.title + " · " : ""}{p.company || ""}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                {p.linkedin_url && (
                  <a href={p.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: "#0a66c2", textDecoration: "none", fontWeight: 600 }}>in ↗</a>
                )}
                <span style={{ fontSize: 10.5, color: p.linkedin_connected ? "#15803d" : T.textTertiary }}>
                  {p.linkedin_connected ? "● connected" : "○ not connected"}
                </span>
                {p.sponsor_state && (
                  <span style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 999, background: "rgba(168,85,247,0.14)", color: "#7c3aed", fontWeight: 600 }}>sponsor</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {shown.length === 0 && <div style={{ color: T.textTertiary, fontSize: 13, marginTop: 8 }}>No match for “{q}”.</div>}
    </main>
  )
}
