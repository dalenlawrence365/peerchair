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
          data.lists[view].map((p, i) => (
            <Link key={p.id} href={`/people/${p.id}`} style={{ textDecoration: "none", color: T.textPrimary }}>
              <div style={{
                padding: "10px 16px", display: "flex", alignItems: "center", gap: 12,
                borderBottom: i < data.lists[view].length - 1 ? "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)") : "none",
                cursor: "pointer",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{p.name}</span>
                    <StatePill s={p.cfo_state} />
                  </div>
                  <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[p.title, p.company].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>{fmtRel(p.last_touch)}</div>
              </div>
            </Link>
          ))
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
