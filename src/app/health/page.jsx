"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

const SEV = {
  high:   { label: "High",   color: "#dc2626", bg: "#fee2e2" },
  medium: { label: "Medium", color: "#d97706", bg: "#fef3c7" },
  low:    { label: "Low",    color: "#0891b2", bg: "#cffafe" },
}

export default function HealthPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [fixing, setFixing] = useState(false)
  const [fixMsg, setFixMsg] = useState(null)

  function load() {
    setData(null); setError(null)
    fetch("/api/health").then(r => r.json()).then(function(d){
      if (d.error) setError(d.error); else setData(d)
    }).catch(e => setError(e.message || String(e)))
  }
  useEffect(load, [])

  async function runFix(fix) {
    setFixing(true); setFixMsg(null)
    try {
      const r = await fetch("/api/health", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fix }) })
      const j = await r.json()
      if (!r.ok) setFixMsg({ ok: false, text: j.error || "Fix failed" })
      else setFixMsg({ ok: true, text: `Fixed — ${j.cleared} record(s) updated.` })
    } catch(e) { setFixMsg({ ok: false, text: e.message || String(e) }) }
    setFixing(false)
    load()
  }

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Running audit…</div></main>

  const checks = (data.checks || []).slice().sort(function(a, b){
    const order = { high: 0, medium: 1, low: 2 }
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity]
    return (b.count || 0) - (a.count || 0)
  })
  const totalIssues = checks.reduce(function(s, c){ return s + (c.count > 0 ? 1 : 0) }, 0)
  const cleanCount = checks.length - totalIssues

  return (
    <main style={{ padding: "26px 32px 64px", maxWidth: 1080 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Data health</h1>
        <button onClick={load} style={{ fontSize: 12, padding: "7px 14px", borderRadius: 6, border: "1px solid " + T.border, background: "white", cursor: "pointer", fontFamily: "inherit" }}>↻ Re-run audit</button>
      </div>
      <div style={{ fontSize: 13, color: T.textTertiary, marginBottom: 22 }}>
        {(() => {
          // The audit RPC only guarantees `people`; `contacts`/`pool` were dropped
          // when Contact stopped being a role. Reading .toLocaleString() off a
          // missing key threw and took the whole page down. Render only the
          // totals that are actually present.
          const t = data.totals || {}
          const num = function (v) { return typeof v === "number" ? v.toLocaleString() : null }
          const parts = []
          if (num(t.people) != null) parts.push(num(t.people) + " people")
          if (num(t.contacts) != null) parts.push(num(t.contacts) + " contacts")
          if (num(t.pool) != null) parts.push(num(t.pool) + " pool")
          parts.push(totalIssues + " issue type" + (totalIssues === 1 ? "" : "s") + " found")
          parts.push(cleanCount + " clean")
          return parts.join(" · ")
        })()}
      </div>

      {fixMsg && (
        <div style={{ background: fixMsg.ok ? "#dcfce7" : "#fee2e2", color: fixMsg.ok ? "#166534" : "#dc2626", border: "1px solid " + (fixMsg.ok ? "#86efac" : "#fca5a5"), borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
          {fixMsg.ok ? "✓ " : "⚠ "}{fixMsg.text}
        </div>
      )}

      {checks.map(function(c){
        const sev = SEV[c.severity] || SEV.low
        const clean = c.count === 0
        const isOpen = expanded[c.key]
        return (
          <div key={c.key} style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
            <div onClick={function(){ if (!clean) setExpanded(Object.assign({}, expanded, { [c.key]: !isOpen })) }}
              style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: clean ? "default" : "pointer" }}>
              <div style={{ width: 56, textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: clean ? "#16a34a" : sev.color, lineHeight: 1 }}>{clean ? "✓" : c.count}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{c.label}</span>
                  {!clean && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: sev.bg, color: sev.color, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{sev.label}</span>}
                </div>
                <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 3 }}>{c.detail}</div>
              </div>
              {!clean && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {c.key === "cfo_state_without_role" && (
                    <button onClick={function(e){ e.stopPropagation(); runFix("clear_stray_cfo_state") }} disabled={fixing}
                      style={{ fontSize: 11, padding: "6px 12px", borderRadius: 6, border: "none", background: "#dc2626", color: "white", cursor: fixing ? "not-allowed" : "pointer", fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      {fixing ? "Fixing…" : "Clear stray states"}
                    </button>
                  )}
                  {c.key === "needs_role_review" && (
                    <Link href="/queue/review" onClick={function(e){ e.stopPropagation() }} style={{ fontSize: 11, padding: "6px 12px", borderRadius: 6, border: "1px solid " + T.border, color: T.textPrimary, textDecoration: "none", fontWeight: 500, whiteSpace: "nowrap" }}>Review →</Link>
                  )}
                  <span style={{ fontSize: 16, color: T.textTertiary }}>{isOpen ? "▾" : "▸"}</span>
                </div>
              )}
            </div>
            {isOpen && !clean && (
              <div style={{ borderTop: "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)"), padding: "8px 18px 14px" }}>
                <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, margin: "8px 0" }}>Sample (up to 12)</div>
                {(c.sample || []).map(function(s, i){
                  const isUuid = s.id && /^[0-9a-f]{8}-/.test(s.id)
                  const inner = (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid " + (T.borderSoft || "rgba(0,0,0,0.04)") }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name || "(no name)"}</span>
                        {s.detail && <span style={{ fontSize: 11, color: T.textTertiary, marginLeft: 8 }}>{s.detail}</span>}
                      </div>
                      {s.roles && <span style={{ fontSize: 11, color: T.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{s.roles}</span>}
                    </div>
                  )
                  return isUuid
                    ? <Link key={i} href={`/people/${s.id}`} style={{ textDecoration: "none", color: T.textPrimary, display: "block" }}>{inner}</Link>
                    : <div key={i}>{inner}</div>
                })}
              </div>
            )}
          </div>
        )
      })}
    </main>
  )
}
