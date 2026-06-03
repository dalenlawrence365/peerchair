"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

const RELEVANCE = [
  { key: "all",                label: "All",                 color: T.textTertiary },
  { key: "unrated",            label: "Unrated",             color: "#94a3b8" },
  { key: "cfo_circle",         label: "CFO Circle",          color: "#f97316" },
  { key: "stalliant",          label: "Stalliant",           color: "#0d9488" },
  { key: "network_visibility", label: "Network visibility",  color: "#3b82f6" },
  { key: "legacy",             label: "Legacy",              color: "#71717a" },
]
const HEAT_COLOR = { hot: "#ef4444", warm: "#f59e0b", cold: "#64748b" }
const STATUS_COLOR = { connected: "#10b981", pending_invite: "#f59e0b", withdrawn: "#94a3b8", disconnected: "#dc2626" }

function fmtDate(s) {
  if (!s) return "—"
  return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export default function LinkedInConnectionsPage() {
  const [relevance, setRelevance] = useState("all")
  const [heat, setHeat] = useState("all")
  const [status, setStatus] = useState("connected")
  const [q, setQ] = useState("")
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  async function load() {
    try {
      const params = new URLSearchParams({ relevance, heat, status })
      if (q) params.set("q", q)
      const r = await fetch(`/api/linkedin-connections?${params}`, { cache: "no-store" })
      if (!r.ok) throw new Error("HTTP " + r.status)
      setData(await r.json())
    } catch (e) { setErr(e.message) }
  }
  useEffect(function(){ load() }, [relevance, heat, status])

  return (
    <main style={{ padding: "32px 36px", maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>LinkedIn connections</h1>
          <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 8, marginBottom: 20, maxWidth: 720 }}>
            Mirror of your LinkedIn graph, curated for relevance. People show here regardless of whether they're in PeerChair as an active pipeline contact — when they ARE, the cross-reference appears on each row.
          </p>
        </div>
        <Link href="/linkedin-connections/import"
          style={{ fontSize: 13, padding: "9px 16px", borderRadius: 8, background: T.textPrimary, color: "white", textDecoration: "none", fontWeight: 500, whiteSpace: "nowrap" }}>
          Import CSV →
        </Link>
      </div>

      {/* Relevance filter chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {RELEVANCE.map(function(r){
          const active = relevance === r.key
          const count = data && (r.key === "all" ? (data.counts && data.counts.total) : (data.counts && data.counts.relevance && data.counts.relevance[r.key]))
          return (
            <button key={r.key} onClick={function(){ setRelevance(r.key) }}
              style={{
                fontSize: 12, padding: "6px 10px", borderRadius: 16,
                border: "1px solid " + (active ? r.color : T.border),
                background: active ? r.color : "white",
                color: active ? "white" : T.textPrimary,
                cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 600 : 400,
                whiteSpace: "nowrap",
              }}>
              {r.label}{count !== undefined && <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Secondary controls: heat + status + search */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <select value={heat} onChange={e => setHeat(e.target.value)}
          style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid " + T.border, background: "white", fontFamily: "inherit" }}>
          <option value="all">Heat: all</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}
          style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid " + T.border, background: "white", fontFamily: "inherit" }}>
          <option value="all">Status: all</option>
          <option value="connected">Connected</option>
          <option value="pending_invite">Pending invite</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="disconnected">Disconnected</option>
        </select>
        <input value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") load() }}
          placeholder="Search name / company / title…"
          style={{ flex: 1, minWidth: 220, fontSize: 13, padding: "6px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", fontFamily: "inherit", boxSizing: "border-box" }} />
        <button onClick={load}
          style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textPrimary, cursor: "pointer", fontFamily: "inherit" }}>
          Search
        </button>
      </div>

      {err && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>Error: {err}</div>}
      {data === null && !err && <div style={{ color: T.textTertiary, fontSize: 13 }}>Loading…</div>}

      {data && (
        <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: 8 }}>
          {data.total_filtered.toLocaleString()} of {(data.counts && data.counts.total || 0).toLocaleString()} connections
        </div>
      )}

      {data && data.items.length === 0 && (
        <div style={{ color: T.textTertiary, fontSize: 13, padding: "32px 0", textAlign: "center" }}>
          {(data.counts && data.counts.total === 0)
            ? <>No connections yet. <Link href="/linkedin-connections/import" style={{ color: "#3b82f6" }}>Import your LinkedIn export</Link> to get started.</>
            : "No connections match the current filters."}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, overflow: "hidden" }}>
          {data.items.map(function(c, idx){
            const relConf = RELEVANCE.find(r => r.key === c.relevance) || RELEVANCE[1]
            const isOverlap = !!c.peerchair_person_id
            return (
              <div key={c.id} style={{
                padding: "12px 16px",
                borderBottom: idx < data.items.length - 1 ? "1px solid " + T.borderSoft : "none",
                display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                       style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, textDecoration: "none" }}>
                      {c.full_name || "(no name)"}
                    </a>
                    {isOverlap && (
                      <Link href={`/people/${c.peerchair_person_id}`}
                        style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#10b981", color: "white", textDecoration: "none", fontWeight: 500 }}>
                        Also in PeerChair {c.person && (c.person.roles || []).length > 0 ? "· " + c.person.roles.join(", ") : ""}
                      </Link>
                    )}
                  </div>
                  {(c.current_title || c.current_company) && (
                    <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>
                      {[c.current_title, c.current_company].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>Connected: {fmtDate(c.connected_at)}</span>
                    {c.location && <span>{c.location}</span>}
                    {c.source && <span>Source: {c.source}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: relConf.color, color: "white" }}>
                    {relConf.label}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: HEAT_COLOR[c.heat] + "22", color: HEAT_COLOR[c.heat] }}>
                    {c.heat}
                  </span>
                  {c.connection_status !== "connected" && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: STATUS_COLOR[c.connection_status] + "22", color: STATUS_COLOR[c.connection_status] }}>
                      {c.connection_status.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
