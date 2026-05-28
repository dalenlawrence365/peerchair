"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { T } from "@/lib/pipelineTheme"

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
  const router = useRouter()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState("")
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const color = TYPE_COLOR[type] || "#3b82f6"
  const basePath = `/pipeline/${type}`

  useEffect(function(){
    setData(null); setError(null); setQ(""); setResults(null)
    fetch(`/api/pipeline?type=${type}&stage=${stage}`).then(r => r.json()).then(function(d){
      if (d.error) setError(d.error); else setData(d)
    }).catch(e => setError(e.message || String(e)))
  }, [type, stage])

  // Search within the pipeline (used for big stages)
  useEffect(function(){
    if (q.trim().length < 2) { setResults(null); return }
    setSearching(true)
    const t = setTimeout(async function(){
      try {
        const r = await fetch("/api/search?q=" + encodeURIComponent(q))
        const d = await r.json()
        // Only people of this pipeline's role, ideally — but show all people matches
        setResults((d.contacts || []))
      } catch(e) { setResults([]) }
      setSearching(false)
    }, 200)
    return function(){ clearTimeout(t) }
  }, [q])

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  const isListable = data.listable.indexOf(stage) >= 0
  const title = type === "cfo" ? "CFO Pipeline" : "Sponsor Pipeline"

  return (
    <main style={{ padding: "26px 32px 64px", maxWidth: 1160 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>{title}</h1>
      <div style={{ fontSize: 13, color: T.textTertiary, marginTop: 4, marginBottom: 22 }}>{data.total.toLocaleString()} people across all stages</div>

      {/* Funnel metrics — always on top, clickable */}
      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        {data.stages.map(function(s, i){
          const n = data.funnel[s] || 0
          const isCurrent = s === stage
          const listable = data.listable.indexOf(s) >= 0
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
                {!listable && <div style={{ fontSize: 9, color: T.textTertiary, marginTop: 2, opacity: 0.7 }}>search only</div>}
                {listable && <div style={{ fontSize: 9, color: color, marginTop: 2, fontWeight: 600 }}>workable</div>}
              </div>
            </Link>
          )
        })}
      </div>

      {/* Current stage panel */}
      <div style={{ marginBottom: 10, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{STAGE_LABEL[stage] || stage} <span style={{ color: T.textTertiary, fontWeight: 400 }}>· {(data.funnel[stage] || 0).toLocaleString()}</span></div>
      </div>

      {isListable ? (
        // Small/actionable stage → show the list
        <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden" }}>
          {(!data.list || data.list.length === 0) ? (
            <div style={{ padding: 24, color: T.textTertiary, fontSize: 13 }}>No one in {STAGE_LABEL[stage] || stage} yet.</div>
          ) : data.list.map(function(p, i){
            return (
              <Link key={p.id} href={`/people/${p.id}`} style={{ textDecoration: "none", color: T.textPrimary }}>
                <div style={{ padding: "12px 16px", borderBottom: i < data.list.length - 1 ? "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)") : "none", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
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
      ) : (
        // Big stage → search bar only, no list
        <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 14 }}>
            {(data.funnel[stage] || 0).toLocaleString()} people in {STAGE_LABEL[stage] || stage} — too many to list. Search to find someone:
          </div>
          <input
            value={q}
            onChange={function(e){ setQ(e.target.value) }}
            placeholder={`Search ${STAGE_LABEL[stage] || stage}…`}
            autoFocus
            style={{ width: "100%", maxWidth: 480, padding: "10px 14px", fontSize: 14, border: "1px solid " + T.border, borderRadius: 8, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
          />
          <div style={{ marginTop: 14 }}>
            {searching && <div style={{ color: T.textTertiary, fontSize: 13 }}>Searching…</div>}
            {!searching && results && results.length === 0 && q.trim().length >= 2 && (
              <div style={{ color: T.textTertiary, fontSize: 13 }}>No matches for &quot;{q}&quot;.</div>
            )}
            {!searching && results && results.map(function(r){
              return (
                <Link key={r.id} href={`/people/${r.id}`} style={{ textDecoration: "none", color: T.textPrimary }}>
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)"), display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: T.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[r.title, r.company, r.stage].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </main>
  )
}
