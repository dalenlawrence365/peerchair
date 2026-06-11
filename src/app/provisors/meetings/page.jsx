"use client"
import { useEffect, useState } from "react"
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
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
}

export default function MeetingsList() {
  const [meetings, setMeetings] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    fetch("/api/meetings").then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else setMeetings(d.meetings || [])
    }).catch(e => setError(String(e)))
  }, [])

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!meetings) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Meetings</h1>
        <Link href="/provisors" style={{ fontSize: 12, color: T.textTertiary, textDecoration: "none" }}>← ProVisors</Link>
      </div>
      <div style={{ fontSize: 13, color: T.textTertiary, marginTop: 4, marginBottom: 22 }}>
        Every ProVisors meeting you attended, with the room. Open one to find who you talked to.
      </div>

      {meetings.length === 0 && (
        <div style={{ padding: 32, color: T.textTertiary, fontSize: 13, textAlign: "center", background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12 }}>
          No meetings yet. They appear here when you approve a roster.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {meetings.map(m => (
          <Link key={m.id} href={`/provisors/meetings/${m.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{GROUP_SHORT[m.group] || m.group || "Meeting"}</div>
                <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>{fmtDate(m.meeting_date)}</div>
              </div>
              <div style={{ fontSize: 13, color: T.textSecondary, fontWeight: 500, whiteSpace: "nowrap" }}>{m.attendees} attended</div>
              <div style={{ color: T.textTertiary, fontSize: 18 }}>›</div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}
