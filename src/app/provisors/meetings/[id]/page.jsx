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
function fmtShort(d) {
  if (!d) return ""
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// LinkedIn-coverage bucket for an attendee. The three non-"all" buckets partition the
// roster: has-URL+connected, has-URL+not-connected, and no-URL-at-all → they sum to All.
function bucketOf(p) {
  if (!p.linkedin_url) return "nourl"
  return p.linkedin_connected ? "connected" : "notconnected"
}
const STATS = [
  { key: "all", label: "All", color: T.textPrimary, tint: "rgba(15,23,42,0.06)" },
  { key: "connected", label: "Connected", color: "#15803d", tint: "rgba(21,128,61,0.09)" },
  { key: "notconnected", label: "Not connected", color: "#b45309", tint: "rgba(180,83,9,0.09)" },
  { key: "nourl", label: "No LinkedIn URL", color: "#6b7280", tint: "rgba(107,114,128,0.10)" },
  { key: "connsent", label: "Request pending", color: "#0a66c2", tint: "rgba(10,102,194,0.10)" },
  { key: "norequest", label: "No request sent", color: "#9a3412", tint: "rgba(154,52,18,0.10)" },
]

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
  const [filter, setFilter] = useState("all")

  useEffect(() => {
    if (!id) return
    fetch(`/api/meetings/${id}`).then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else setData(d)
    }).catch(e => setError(String(e)))
  }, [id])

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  const { meeting, attendees } = data
  const counts = { all: attendees.length, connected: 0, notconnected: 0, nourl: 0, connsent: 0, norequest: 0 }
  for (const p of attendees) { counts[bucketOf(p)]++; if (p.connection_sent_at && p.linkedin_connected !== true) counts.connsent++; if (p.linkedin_url && p.linkedin_connected !== true && !p.connection_sent_at) counts.norequest++ }
  const needle = q.trim().toLowerCase()
  const byFilter =
    filter === "all" ? attendees
    : filter === "connsent" ? attendees.filter(p => p.connection_sent_at && p.linkedin_connected !== true)
    : filter === "norequest" ? attendees.filter(p => p.linkedin_url && p.linkedin_connected !== true && !p.connection_sent_at)
    : attendees.filter(p => bucketOf(p) === filter)
  const filtered = needle
    ? byFilter.filter(p => (p.full_name || "").toLowerCase().includes(needle) || (p.company || "").toLowerCase().includes(needle))
    : byFilter
  const mId = meeting.troika_master_person_id
  const shown = mId
    ? [...filtered].sort((a, b) => (a.id === mId ? -1 : 0) - (b.id === mId ? -1 : 0))
    : filtered

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 1000 }}>
      <Link href="/provisors/meetings" style={{ fontSize: 12, color: T.textTertiary, textDecoration: "none" }}>← Meetings</Link>
      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: "8px 0 2px" }}>
        {GROUP_SHORT[meeting.group] || meeting.group || meeting.label || "Meeting"}
      </h1>
      <div style={{ fontSize: 13, color: T.textTertiary, marginBottom: 14 }}>
        {fmtDate(meeting.meeting_date)} · {attendees.length} attended
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        {STATS.map(s => {
          const active = filter === s.key
          return (
            <button key={s.key} onClick={() => setFilter(s.key)} style={{ flex: "1 1 0", minWidth: 132, textAlign: "left", cursor: "pointer", background: active ? s.tint : T.cardBg, border: "1px solid " + (active ? s.color : T.border), borderRadius: 10, padding: "12px 14px", fontFamily: "inherit" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color, letterSpacing: -0.5 }}>{counts[s.key]}</div>
              <div style={{ fontSize: 11.5, color: T.textTertiary, marginTop: 2 }}>{s.label}</div>
            </button>
          )
        })}
      </div>

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find someone — name or company…"
        style={{ width: "100%", maxWidth: 420, padding: "9px 12px", fontSize: 13, borderRadius: 8, border: "1px solid " + T.border, marginBottom: 18, fontFamily: "inherit", boxSizing: "border-box" }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
        {shown.map(p => {
          const isMaster = meeting.troika_master_person_id && p.id === meeting.troika_master_person_id
          return (
          <div key={p.id} style={{ background: isMaster ? "rgba(124,58,237,0.06)" : T.cardBg, border: "1px solid " + (isMaster ? "#7c3aed" : T.border), borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
            <Face p={p} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Link href={`/people/${p.id}`} style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, textDecoration: "none" }}>{p.full_name}</Link>
                {isMaster && (
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 999, background: "#7c3aed", color: "white", fontWeight: 700, whiteSpace: "nowrap" }}>TROIKA MASTER</span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: T.textTertiary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.title ? p.title + " · " : ""}{p.company || ""}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                {p.linkedin_url && (
                  <a href={p.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: "#0a66c2", textDecoration: "none", fontWeight: 600 }}>in ↗</a>
                )}
                <span style={{ fontSize: 10.5, color: p.linkedin_connected ? "#15803d" : T.textTertiary }}>
                  {p.linkedin_connected ? "● connected" : "○ not connected"}
                </span>
                {p.sponsor_state && (
                  <span style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 999, background: "rgba(168,85,247,0.14)", color: "#7c3aed", fontWeight: 600 }}>sponsor</span>
                )}
                {p.connection_sent_at && (
                  <span style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 999, background: "rgba(10,102,194,0.12)", color: "#0a66c2", fontWeight: 600, whiteSpace: "nowrap" }}>connection sent · {fmtShort(p.connection_sent_at)}</span>
                )}
              </div>
            </div>
          </div>
          )
        })}
      </div>
      {shown.length === 0 && <div style={{ color: T.textTertiary, fontSize: 13, marginTop: 8 }}>{needle ? `No match for “${q}”.` : "No one in this view."}</div>}
    </main>
  )
}
