"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

const STAGE_LABEL = { pool: "Pool", audience: "Audience", active: "Active" }
const STAGE_COLOR = { pool: "#94a3b8", audience: "#10b981", active: "#059669" }

function fmtRel(iso) {
  if (!iso) return "—"
  const d = new Date(iso); const diff = (Date.now() - d) / 86400000
  if (diff < 1) return "today"
  if (diff < 30) return Math.round(diff) + "d ago"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function ReferralPartnersPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState("all")

  useEffect(function(){
    fetch("/api/referral-partners").then(r => r.json()).then(function(d){
      if (d.error) setError(d.error); else setData(d)
    }).catch(e => setError(e.message || String(e)))
  }, [])

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  const shown = filter === "all" ? data.people : data.people.filter(p => p.state === filter)

  return (
    <main style={{ padding: "26px 32px 64px", maxWidth: 1080 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Referral partners</h1>
      <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 6, marginBottom: 22 }}>
        Service providers and connectors who send CFOs your way — not membership prospects themselves.
      </p>

      {/* Metrics at top */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Tile label="Total" value={data.total} active={filter === "all"} onClick={function(){ setFilter("all") }} color="#10b981" />
        {["pool", "audience", "active"].map(function(s){
          return <Tile key={s} label={STAGE_LABEL[s]} value={data.counts[s] || 0} active={filter === s} onClick={function(){ setFilter(s) }} color={STAGE_COLOR[s]} />
        })}
      </div>

      {/* List */}
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden" }}>
        {shown.length === 0 ? (
          <div style={{ padding: 24, color: T.textTertiary, fontSize: 13 }}>No referral partners in this view.</div>
        ) : shown.map(function(p, i){
          return (
            <Link key={p.id} href={`/people/${p.id}`} style={{ textDecoration: "none", color: T.textPrimary }}>
              <div style={{ padding: "12px 16px", borderBottom: i < shown.length - 1 ? "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)") : "none", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: STAGE_COLOR[p.state] || "#888", color: "white", fontWeight: 600, minWidth: 60, textAlign: "center" }}>{STAGE_LABEL[p.state] || p.state}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: T.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[p.title, p.company].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>{fmtRel(p.last_touch)}</div>
              </div>
            </Link>
          )
        })}
      </div>
    </main>
  )
}

function Tile({ label, value, active, onClick, color }) {
  return (
    <div onClick={onClick} style={{
      background: T.cardBg, border: "1px solid " + (active ? color : T.border),
      borderTop: "3px solid " + color, borderRadius: 10, padding: "16px 18px", cursor: "pointer",
      boxShadow: active ? "0 0 0 1px " + color : "none"
    }}>
      <div style={{ fontSize: 26, fontWeight: 600, color: T.textPrimary, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 }}>{label}</div>
    </div>
  )
}
