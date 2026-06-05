"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"
import Avatar from "@/components/Avatar"

const STAGE_LABEL = {
  pool: "Pool",
  audience: "Audience",
  discovery: "Discovery",
  proposal: "Proposal",
  active: "Active",
}

const SPONSOR_COLOR = "#a855f7" // purple — matches existing sponsor color in PipelineView

function fmtRel(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  const diff = (Date.now() - d) / 86400000
  if (diff < 1) return "today"
  if (diff < 30) return Math.round(diff) + "d ago"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function SponsorPipelineView({ stage }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState({}) // company_id -> bool
  const [q, setQ] = useState("")

  useEffect(function(){
    setData(null); setError(null); setExpanded({}); setQ("")
    fetch(`/api/sponsor-pipeline?stage=${stage}`).then(r => r.json()).then(function(d){
      if (d.error) setError(d.error); else setData(d)
    }).catch(e => setError(e.message || String(e)))
  }, [stage])

  function toggle(companyId) {
    setExpanded(function(prev){
      const next = Object.assign({}, prev)
      next[companyId] = !next[companyId]
      return next
    })
  }

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  // Local filter (firm name or contact name)
  const needle = q.trim().toLowerCase()
  const filtered = !needle ? data.list : data.list.filter(function(c){
    if (c.name.toLowerCase().indexOf(needle) >= 0) return true
    if ((c.category || "").toLowerCase().indexOf(needle) >= 0) return true
    return (c.contacts || []).some(p => (p.name || "").toLowerCase().indexOf(needle) >= 0)
  })

  return (
    <main style={{ padding: "26px 32px 64px", maxWidth: 1160 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Sponsor Pipeline</h1>
      <div style={{ fontSize: 13, color: T.textTertiary, marginTop: 4, marginBottom: 22 }}>
        {data.total.toLocaleString()} companies across all stages
      </div>

      {/* Stage funnel — clickable cards */}
      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        {data.stages.map(function(s){
          const n = data.funnel[s] || 0
          const isCurrent = s === stage
          return (
            <Link key={s} href={`/pipeline/sponsor/${s}`} style={{ textDecoration: "none", flex: "1 1 0", minWidth: 120 }}>
              <div style={{
                background: isCurrent ? "white" : T.cardBg,
                border: "1px solid " + (isCurrent ? SPONSOR_COLOR : T.border),
                borderTop: "3px solid " + SPONSOR_COLOR,
                borderRadius: 10, padding: "14px 16px", cursor: "pointer",
                boxShadow: isCurrent ? "0 0 0 1px " + SPONSOR_COLOR : "none",
              }}>
                <div style={{ fontSize: 24, fontWeight: 600, color: T.textPrimary, lineHeight: 1 }}>{n.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 5 }}>
                  {STAGE_LABEL[s] || s}
                </div>
                <div style={{ fontSize: 9, color: SPONSOR_COLOR, marginTop: 2, fontWeight: 600 }}>companies</div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Stage header + filter input */}
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {STAGE_LABEL[stage] || stage} <span style={{ color: T.textTertiary, fontWeight: 400 }}>· {(data.funnel[stage] || 0).toLocaleString()} firms</span>
        </div>
        <input
          value={q}
          onChange={function(e){ setQ(e.target.value) }}
          placeholder="Filter by firm or contact…"
          style={{
            padding: "8px 12px", fontSize: 13, border: "1px solid " + T.border,
            borderRadius: 8, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
            minWidth: 240,
          }}
        />
      </div>

      {/* Company list */}
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, color: T.textTertiary, fontSize: 13 }}>
            {data.list.length === 0
              ? `No companies in ${STAGE_LABEL[stage] || stage}.`
              : `No firms or contacts match "${q}".`}
          </div>
        ) : filtered.map(function(co, i){
          const isOpen = !!expanded[co.id]
          return (
            <div key={co.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)") : "none" }}>
              {/* Company row */}
              <div
                onClick={function(){ toggle(co.id) }}
                style={{
                  padding: "14px 16px",
                  display: "flex", alignItems: "center", gap: 12,
                  cursor: "pointer",
                  background: isOpen ? "rgba(168, 85, 247, 0.04)" : "transparent",
                }}>
                <div style={{
                  fontSize: 11, color: T.textTertiary, width: 14, textAlign: "center",
                  transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 120ms",
                }}>▶</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{co.name}</div>
                  <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>
                    {[co.category, `${co.contact_count} contact${co.contact_count === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>{fmtRel(co.last_touch)}</div>
              </div>

              {/* Expanded contact list */}
              {isOpen && (
                <div style={{
                  background: "rgba(0,0,0,0.02)",
                  borderTop: "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)"),
                }}>
                  {co.contacts.length === 0 ? (
                    <div style={{ padding: "12px 16px 12px 42px", fontSize: 12, color: T.textTertiary }}>
                      No contacts at this firm yet.
                    </div>
                  ) : co.contacts.map(function(p, j){
                    return (
                      <Link key={p.id} href={`/people/${p.id}`} style={{ textDecoration: "none", color: T.textPrimary }}>
                        <div style={{
                          padding: "10px 16px 10px 42px",
                          display: "flex", alignItems: "center", gap: 10,
                          borderBottom: j < co.contacts.length - 1 ? "1px solid " + (T.borderSoft || "rgba(0,0,0,0.04)") : "none",
                          cursor: "pointer",
                        }}>
                          <Avatar name={p.name} src={p.avatar_url} size={28} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: T.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p.title || "—"}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>{fmtRel(p.last_touch)}</div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
