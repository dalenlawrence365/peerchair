"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

const STATE_COLOR = {
  audience:  { bg: "rgba(59, 130, 246, 0.12)", fg: "#3b82f6" },
  prospect:  { bg: "rgba(217, 119, 6, 0.14)",  fg: "#b45309" },
  qualified: { bg: "rgba(168, 85, 247, 0.14)", fg: "#a855f7" },
  member:    { bg: "rgba(22, 163, 74, 0.14)",  fg: "#15803d" },
}

// Activity pills — shown only if the person has that activity
const ACTIVITY_DEFS = [
  { key: "replied",            label: "Reply",      bg: "rgba(22, 163, 74, 0.14)",  fg: "#15803d" },
  { key: "brochure_sent",      label: "Brochure",   bg: "rgba(59, 130, 246, 0.12)", fg: "#3b82f6" },
  { key: "assessment_sent",    label: "Assessment", bg: "rgba(168, 85, 247, 0.14)", fg: "#a855f7" },
  { key: "event_invite_sent",  label: "Event inv.", bg: "rgba(99, 102, 241, 0.14)", fg: "#6366f1" },
  { key: "fit_call_scheduled", label: "Fit sched",  bg: "rgba(217, 119, 6, 0.14)",  fg: "#b45309" },
  { key: "fit_call_completed", label: "Fit call ✓", bg: "rgba(22, 163, 74, 0.18)",  fg: "#15803d" },
]

// Status tag pills — shown only if active
const STATUS_LABEL = {
  reserve:        { label: "Reserve",     bg: "rgba(100,116,139,0.13)", fg: "#475569" },
  snoozed:        { label: "Snoozed",     bg: "rgba(100,116,139,0.13)", fg: "#475569" },
  not_a_fit:      { label: "Not a fit",   bg: "rgba(217, 119, 6, 0.14)",  fg: "#b45309" },
  opted_out:      { label: "Opted out",   bg: "rgba(220, 38, 38, 0.13)",  fg: "#b91c1c" },
  do_not_contact: { label: "DNC",         bg: "rgba(220, 38, 38, 0.13)",  fg: "#b91c1c" },
}

function StatePill({ s }) {
  const c = STATE_COLOR[s] || { bg: "rgba(100,116,139,0.1)", fg: "#64748b" }
  return <Pill bg={c.bg} fg={c.fg} text={s} upper />
}

function Pill({ bg, fg, text, upper = false }) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 999,
      fontSize: 9.5, fontWeight: 600,
      textTransform: upper ? "uppercase" : "none",
      letterSpacing: upper ? 0.3 : 0,
      background: bg, color: fg, whiteSpace: "nowrap",
    }}>{text}</span>
  )
}

function fmtRel(iso) {
  if (!iso) return null
  const days = (Date.now() - new Date(iso)) / 86400000
  if (days < 1) return "today"
  if (days < 30) return Math.round(days) + "d ago"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function fmtConnected(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString("en-US", sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" })
}

export default function CfoMetricsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [view, setView] = useState("no_brochure")

  useEffect(() => {
    fetch("/api/cfo-metrics").then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else setData(d)
    }).catch(e => setError(e.message || String(e)))
  }, [])

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 1100 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>CFO outreach</h1>
      <div style={{ fontSize: 13, color: T.textTertiary, marginTop: 4, marginBottom: 22 }}>
        {data.connected_total.toLocaleString()} connected CFOs (past Pool stage)
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
        <Tile label="Brochure sent"     value={data.brochure.sent}      pct={data.brochure.pct_sent}     active={view === "with_brochure"}   onClick={() => setView("with_brochure")}   color="#15803d" />
        <Tile label="Brochure NOT sent" value={data.brochure.not_sent}  pct={100 - data.brochure.pct_sent} active={view === "no_brochure"}     onClick={() => setView("no_brochure")}     color="#b45309" />
        <Tile label="Assessment sent"     value={data.assessment.sent}      pct={data.assessment.pct_sent}     active={view === "with_assessment"} onClick={() => setView("with_assessment")} color="#15803d" />
        <Tile label="Assessment NOT sent" value={data.assessment.not_sent}  pct={100 - data.assessment.pct_sent} active={view === "no_assessment"}   onClick={() => setView("no_assessment")}   color="#b45309" />
      </div>

      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid " + T.border, fontSize: 12, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {LABEL[view]} <span style={{ color: T.textPrimary, marginLeft: 6, fontWeight: 500 }}>· {data.lists[view].length.toLocaleString()}</span>
        </div>
        {data.lists[view].length === 0 ? (
          <div style={{ padding: 24, color: T.textTertiary, fontSize: 13 }}>None.</div>
        ) : (
          data.lists[view].map((p, i) => <PersonRow key={p.id} p={p} isLast={i === data.lists[view].length - 1} />)
        )}
      </div>
    </main>
  )
}

function PersonRow({ p, isLast }) {
  const connectedFmt = fmtConnected(p.connected_at)
  const inviteFmt = fmtConnected(p.invite_sent_at)
  const touchFmt = fmtRel(p.last_touch)
  return (
    <div style={{
      padding: "12px 16px",
      display: "flex", alignItems: "flex-start", gap: 12,
      borderBottom: isLast ? "none" : "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)"),
    }}>
      {/* Left half: clickable to profile */}
      <Link href={`/people/${p.id}`} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: T.textPrimary, cursor: "pointer" }}>
        {/* Line 1: name + state + status pills + activity pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</span>
          <StatePill s={p.cfo_state} />
          {(p.status_tags || []).map(t => {
            const c = STATUS_LABEL[t]
            if (!c) return null
            return <Pill key={t} bg={c.bg} fg={c.fg} text={c.label} />
          })}
          {ACTIVITY_DEFS.filter(d => p.activity?.[d.key]).map(d =>
            <Pill key={d.key} bg={d.bg} fg={d.fg} text={d.label} />
          )}
        </div>
        {/* Line 2: title · company */}
        <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[p.title, p.company].filter(Boolean).join(" · ") || "—"}
        </div>
      </Link>
      {/* Right side: dates + email + LinkedIn — NOT inside the Link, so anchors work natively */}
      <div style={{ textAlign: "right", whiteSpace: "nowrap", fontSize: 11, color: T.textTertiary, lineHeight: 1.55, paddingTop: 1 }}>
        {inviteFmt && <div>Invite sent {inviteFmt}</div>}
        {connectedFmt && <div>Connected {connectedFmt}</div>}
        {!inviteFmt && !connectedFmt && <div style={{ color: "#cbd5e1", fontStyle: "italic" }}>no connection date</div>}
        {touchFmt && <div>Last touch {touchFmt}</div>}
        {p.email ? (
          <div>
            <a
              href={`mailto:${p.email}`}
              title={`Compose to ${p.email}`}
              style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 500 }}
            >
              ✉ {p.email.length > 28 ? p.email.slice(0, 26) + "…" : p.email}
            </a>
          </div>
        ) : (
          <div style={{ color: "#cbd5e1", fontStyle: "italic" }}>no email</div>
        )}
        {p.linkedin_url ? (
          <div>
            <a
              href={p.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              title={p.linkedin_url}
              style={{ color: "#0a66c2", textDecoration: "none", fontWeight: 500 }}
            >
              in&nbsp;LinkedIn ↗
            </a>
          </div>
        ) : (
          <div style={{ color: "#cbd5e1", fontStyle: "italic" }}>no LinkedIn</div>
        )}
      </div>
    </div>
  )
}

const LABEL = {
  no_brochure:     "CFOs without brochure",
  no_assessment:   "CFOs without assessment",
  with_brochure:   "CFOs with brochure",
  with_assessment: "CFOs with assessment",
}

function Tile({ label, value, pct, active, color, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        background: active ? "white" : T.cardBg,
        border: "1px solid " + (active ? color : T.border),
        boxShadow: active ? `0 0 0 1px ${color}` : "none",
        borderTop: "3px solid " + color,
        borderRadius: 10, padding: "16px 14px", cursor: "pointer",
        textAlign: "left", fontFamily: "inherit",
      }}>
      <div style={{ fontSize: 28, fontWeight: 600, color: T.textPrimary, lineHeight: 1 }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: color, marginTop: 4, fontWeight: 600 }}>{pct.toFixed(1)}% of connected</div>
    </button>
  )
}
