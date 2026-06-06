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

function StatePill({ s }) {
  const c = STATE_COLOR[s] || { bg: "rgba(100,116,139,0.1)", fg: "#64748b" }
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 999,
      fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3,
      background: c.bg, color: c.fg,
    }}>{s}</span>
  )
}

// ─── Activity & status pills ─────────────────────────────────────────────────
// Activity = positive milestones reached (replies received, materials sent, fit
// call done). Color leans warm/green to read as "this has happened, ✓."
// Status = currently-set qualitative tags (not_a_fit, opted_out, etc.). Color
// leans neutral or red depending on severity.

const ACTIVITY_PILL = {
  reply_received:     { label: "Reply",      bg: "rgba(22, 163, 74, 0.10)",  fg: "#15803d", border: "rgba(22, 163, 74, 0.3)" },
  brochure_sent:      { label: "Brochure",   bg: "rgba(59, 130, 246, 0.10)", fg: "#2563eb", border: "rgba(59, 130, 246, 0.3)" },
  assessment_sent:    { label: "Assessment", bg: "rgba(168, 85, 247, 0.10)", fg: "#9333ea", border: "rgba(168, 85, 247, 0.3)" },
  fit_call_completed: { label: "Fit call ✓", bg: "rgba(22, 163, 74, 0.14)",  fg: "#15803d", border: "rgba(22, 163, 74, 0.4)" },
}

const STATUS_PILL = {
  reserve:        { label: "Reserve",     bg: "rgba(100, 116, 139, 0.10)", fg: "#475569", border: "rgba(100, 116, 139, 0.3)" },
  snoozed:        { label: "Snoozed",     bg: "rgba(100, 116, 139, 0.10)", fg: "#475569", border: "rgba(100, 116, 139, 0.3)" },
  not_a_fit:      { label: "Not a fit",   bg: "rgba(217, 119, 6, 0.14)",   fg: "#b45309", border: "rgba(217, 119, 6, 0.4)" },
  opted_out:      { label: "Opted out",   bg: "rgba(220, 38, 38, 0.10)",   fg: "#b91c1c", border: "rgba(220, 38, 38, 0.3)" },
  do_not_contact: { label: "DNC",         bg: "rgba(220, 38, 38, 0.14)",   fg: "#b91c1c", border: "rgba(220, 38, 38, 0.4)" },
}

function MiniPill({ def }) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 4,
      fontSize: 10, fontWeight: 600, whiteSpace: "nowrap",
      background: def.bg, color: def.fg, border: "1px solid " + def.border,
    }}>{def.label}</span>
  )
}

function fmtDate(iso) {
  if (!iso) return null
  // Accepts YYYY-MM-DD or ISO datetime
  const d = iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function fmtRel(iso) {
  if (!iso) return "—"
  const days = (Date.now() - new Date(iso)) / 86400000
  if (days < 1) return "today"
  if (days < 30) return Math.round(days) + "d ago"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function CfoMetricsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [view, setView] = useState("no_brochure") // active list to render

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

      {/* Metric tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
        <Tile label="Brochure sent"     value={data.brochure.sent}      pct={data.brochure.pct_sent}     active={view === "with_brochure"}   onClick={() => setView("with_brochure")}   color="#15803d" />
        <Tile label="Brochure NOT sent" value={data.brochure.not_sent}  pct={100 - data.brochure.pct_sent} active={view === "no_brochure"}     onClick={() => setView("no_brochure")}     color="#b45309" />
        <Tile label="Assessment sent"     value={data.assessment.sent}      pct={data.assessment.pct_sent}     active={view === "with_assessment"} onClick={() => setView("with_assessment")} color="#15803d" />
        <Tile label="Assessment NOT sent" value={data.assessment.not_sent}  pct={100 - data.assessment.pct_sent} active={view === "no_assessment"}   onClick={() => setView("no_assessment")}   color="#b45309" />
      </div>

      {/* Active list */}
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid " + T.border, fontSize: 12, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {LABEL[view]} <span style={{ color: T.textPrimary, marginLeft: 6, fontWeight: 500 }}>· {data.lists[view].length.toLocaleString()}</span>
        </div>
        {data.lists[view].length === 0 ? (
          <div style={{ padding: 24, color: T.textTertiary, fontSize: 13 }}>None.</div>
        ) : (
          data.lists[view].map((p, i) => {
            const activityDefs = (p.activity_pills || []).map(t => ACTIVITY_PILL[t]).filter(Boolean)
            const statusDefs   = (p.status_tags    || []).map(t => STATUS_PILL[t]).filter(Boolean)
            const hasPills = activityDefs.length + statusDefs.length > 0
            return (
              <Link key={p.id} href={`/people/${p.id}`} style={{ textDecoration: "none", color: T.textPrimary }}>
                <div style={{
                  padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 12,
                  borderBottom: i < data.lists[view].length - 1 ? "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)") : "none",
                  cursor: "pointer",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Line 1: name + state pill + activity/status pills inline */}
                    <div style={{ fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span>{p.name}</span>
                      <StatePill s={p.cfo_state} />
                      {activityDefs.map((def, j) => <MiniPill key={"a" + j} def={def} />)}
                      {statusDefs.map((def, j) => <MiniPill key={"s" + j} def={def} />)}
                    </div>
                    {/* Line 2: title · company */}
                    <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[p.title, p.company].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  {/* Right side: connected_at + last_touch stacked */}
                  <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap", textAlign: "right", lineHeight: 1.5 }}>
                    {p.connected_at && <div>Connected {fmtDate(p.connected_at)}</div>}
                    <div>{fmtRel(p.last_touch)}</div>
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </main>
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
