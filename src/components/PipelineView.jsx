"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"
import Avatar from "@/components/Avatar"

const STAGE_LABEL = {
  pool: "Pool", audience: "Audience", prospect: "Prospect", qualified: "Qualified", member: "Member",
  discovery: "Discovery", proposal: "Proposal", active: "Active",
}
const TYPE_COLOR = { cfo: "#d97706", sponsor: "#a855f7" }

function fmtRel(iso) {
  if (!iso) return "—"
  const d = new Date(iso); const diff = (Date.now() - d) / 86400000
  if (diff < 1) return "today"
  if (diff < 30) return Math.round(diff) + "d ago"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function PipelineView({ type, stage }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState("")
  const [query, setQuery] = useState("")   // committed search term
  const [limit, setLimit] = useState(100)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const color = TYPE_COLOR[type] || "#3b82f6"
  const basePath = `/pipeline/${type}`

  // Reset paging + search when stage or pipeline type changes
  useEffect(function(){
    setQ(""); setQuery(""); setOffset(0)
  }, [type, stage])

  useEffect(function(){
    setLoading(true)
    const params = new URLSearchParams({ type, stage, limit: String(limit), offset: String(offset) })
    if (query) params.set("q", query)
    fetch(`/api/pipeline?${params}`, { cache: "no-store" })
      .then(r => r.json())
      .then(function(d){
        if (d.error) setError(d.error); else { setData(d); setError(null) }
      })
      .catch(e => setError(e.message || String(e)))
      .finally(function(){ setLoading(false) })
  }, [type, stage, limit, offset, query])

  function runSearch() { setOffset(0); setQuery(q.trim()) }
  function clearSearch() { setQ(""); setQuery(""); setOffset(0) }

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  const title = type === "cfo" ? "CFO Pipeline" : "Sponsor Pipeline"
  const list = data.list || []
  const total = data.list_total || 0
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + limit, total)
  const canPrev = offset > 0
  const canNext = offset + limit < total

  const Pager = (
    <div style={{ display: "flex", gap: 6 }}>
      <button disabled={!canPrev} onClick={function(){ setOffset(Math.max(0, offset - limit)) }}
        style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: canPrev ? T.textPrimary : T.textTertiary, cursor: canPrev ? "pointer" : "default", fontFamily: "inherit" }}>
        ← Prev
      </button>
      <button disabled={!canNext} onClick={function(){ setOffset(offset + limit) }}
        style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: canNext ? T.textPrimary : T.textTertiary, cursor: canNext ? "pointer" : "default", fontFamily: "inherit" }}>
        Next →
      </button>
    </div>
  )

  return (
    <main style={{ padding: "26px 32px 64px", maxWidth: 1160 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>{title}</h1>
      <div style={{ fontSize: 13, color: T.textTertiary, marginTop: 4, marginBottom: 22 }}>{data.total.toLocaleString()} people across all stages</div>

      {/* Funnel metrics — always on top, clickable */}
      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        {data.stages.map(function(s){
          const n = data.funnel[s] || 0
          const isCurrent = s === stage
          return (
            <Link key={s} href={`${basePath}/${s}`} style={{ textDecoration: "none", flex: "1 1 0", minWidth: 120 }}>
              <div style={{
                background: isCurrent ? "white" : T.cardBg,
                border: "1px solid " + (isCurrent ? color : T.border),
                borderTop: "3px solid " + color,
                borderRadius: 10, padding: "14px 16px", cursor: "pointer",
                boxShadow: isCurrent ? "0 0 0 1px " + color : "none",
                position: "relative",
              }}>
                <div style={{ fontSize: 24, fontWeight: 600, color: T.textPrimary, lineHeight: 1 }}>{n.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 5 }}>
                  {STAGE_LABEL[s] || s}
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Current stage header */}
      <div style={{ marginBottom: 12, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{STAGE_LABEL[stage] || stage} <span style={{ color: T.textTertiary, fontWeight: 400 }}>· {(data.funnel[stage] || 0).toLocaleString()}</span></div>
      </div>

      {/* Search + page size */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <input value={q} onChange={function(e){ setQ(e.target.value) }} onKeyDown={function(e){ if (e.key === "Enter") runSearch() }}
          placeholder="Search name / company / title…"
          style={{ flex: 1, minWidth: 220, fontSize: 13, padding: "8px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", fontFamily: "inherit", boxSizing: "border-box" }} />
        <button onClick={runSearch}
          style={{ fontSize: 12, padding: "8px 14px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textPrimary, cursor: "pointer", fontFamily: "inherit" }}>
          Search
        </button>
        {query && (
          <button onClick={clearSearch}
            style={{ fontSize: 12, padding: "8px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textTertiary, cursor: "pointer", fontFamily: "inherit" }}>
            Clear
          </button>
        )}
        <select value={limit} onChange={function(e){ setLimit(Number(e.target.value)); setOffset(0) }}
          style={{ fontSize: 12, padding: "8px 8px", borderRadius: 6, border: "1px solid " + T.border, background: "white", fontFamily: "inherit" }}>
          <option value={100}>100 / page</option>
          <option value={500}>500 / page</option>
        </select>
      </div>

      {/* Count + top pager */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: T.textTertiary }}>
          {total === 0 ? "No matches" : <>Showing <b>{from.toLocaleString()}–{to.toLocaleString()}</b> of <b>{total.toLocaleString()}</b></>}
          {loading && <span style={{ marginLeft: 8, opacity: 0.6 }}>updating…</span>}
        </div>
        {Pager}
      </div>

      {/* List */}
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden" }}>
        {list.length === 0 ? (
          <div style={{ padding: 24, color: T.textTertiary, fontSize: 13 }}>
            {query ? `No one in ${STAGE_LABEL[stage] || stage} matches “${query}”.` : `No one in ${STAGE_LABEL[stage] || stage} yet.`}
          </div>
        ) : list.map(function(p, i){
          return (
            <Link key={p.id} href={`/people/${p.id}`} style={{ textDecoration: "none", color: T.textPrimary }}>
              <div style={{ padding: "12px 16px", borderBottom: i < list.length - 1 ? "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)") : "none", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                <Avatar name={p.name} src={p.avatar_url} size={36} />
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

      {/* Bottom pager */}
      {list.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          {Pager}
        </div>
      )}
    </main>
  )
}
