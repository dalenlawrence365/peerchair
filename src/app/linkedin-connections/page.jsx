"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"
import PersonBadges from "@/components/PersonBadges"

// Role filters == the pills. Sourced from people.linkedin_connected (first-degree).
const ROLES = [
  { key: "all",        label: "All",         color: "#0a66c2" },
  { key: "provisor",   label: "ProVisor",    color: "#7c3aed" },
  { key: "sponsor",    label: "Sponsor",     color: "#0d9488" },
  { key: "cfo",        label: "CFO",         color: "#f97316" },
  { key: "referral",   label: "Referral",    color: "#3b82f6" },
  { key: "cfo_circle", label: "CFO Circle",  color: "#ea580c" },
  { key: "none",       label: "No role",     color: "#64748b" },
  { key: "hospitality", label: "Hospitality/Restaurant", color: "#854d0e" },
]

export default function LinkedInConnectionsPage() {
  const [role, setRole] = useState("all")
  const [q, setQ] = useState("")
  const [limit, setLimit] = useState(100)
  const [offset, setOffset] = useState(0)
  const [reload, setReload] = useState(0)
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ role, limit: String(limit), offset: String(offset) })
      if (q) params.set("q", q)
      const r = await fetch(`/api/linkedin-connections?${params}`, { cache: "no-store" })
      if (!r.ok) throw new Error("HTTP " + r.status)
      setData(await r.json())
      setErr(null)
    } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }
  useEffect(function(){ load() }, [role, limit, offset, reload])

  function pickRole(k) { setRole(k); setOffset(0) }
  function runSearch() { setOffset(0); setReload(x => x + 1) }

  const total = data ? data.total_filtered : 0
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + limit, total)
  const canPrev = offset > 0
  const canNext = offset + limit < total

  return (
    <main style={{ padding: "32px 36px", maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>First-degree connections</h1>
          <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 8, marginBottom: 20, maxWidth: 720 }}>
            Everyone marked as a first-degree LinkedIn connection. Each row is a person in PeerChair — click the name to open their profile. Filter by role using the pills below.
          </p>
        </div>
        <Link href="/linkedin-connections/import"
          style={{ fontSize: 13, padding: "9px 16px", borderRadius: 8, background: T.textPrimary, color: "white", textDecoration: "none", fontWeight: 500, whiteSpace: "nowrap" }}>
          Import CSV →
        </Link>
      </div>

      {/* Role filter pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {ROLES.map(function(r){
          const active = role === r.key
          const count = data && data.counts ? data.counts[r.key] : undefined
          return (
            <button key={r.key} onClick={function(){ pickRole(r.key) }}
              style={{
                fontSize: 12, padding: "6px 11px", borderRadius: 16,
                border: "1px solid " + (active ? r.color : T.border),
                background: active ? r.color : "white",
                color: active ? "white" : T.textPrimary,
                cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 600 : 400, whiteSpace: "nowrap",
              }}>
              {r.label}{count !== undefined && <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>{count.toLocaleString()}</span>}
            </button>
          )
        })}
      </div>

      {/* Search + page size */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") runSearch() }}
          placeholder="Search name / company / title…"
          style={{ flex: 1, minWidth: 220, fontSize: 13, padding: "7px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", fontFamily: "inherit", boxSizing: "border-box" }} />
        <button onClick={runSearch}
          style={{ fontSize: 12, padding: "7px 14px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textPrimary, cursor: "pointer", fontFamily: "inherit" }}>
          Search
        </button>
        <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setOffset(0) }}
          style={{ fontSize: 12, padding: "7px 8px", borderRadius: 6, border: "1px solid " + T.border, background: "white", fontFamily: "inherit" }}>
          <option value={100}>100 / page</option>
          <option value={500}>500 / page</option>
        </select>
      </div>

      {err && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>Error: {err}</div>}
      {data === null && !err && <div style={{ color: T.textTertiary, fontSize: 13 }}>Loading…</div>}

      {data && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: T.textTertiary }}>
            {total === 0 ? "No matches" : <>Showing <b>{from.toLocaleString()}–{to.toLocaleString()}</b> of <b>{total.toLocaleString()}</b></>}
            {loading && <span style={{ marginLeft: 8, opacity: 0.6 }}>updating…</span>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - limit))}
              style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: canPrev ? T.textPrimary : T.textTertiary, cursor: canPrev ? "pointer" : "default", fontFamily: "inherit" }}>
              ← Prev
            </button>
            <button disabled={!canNext} onClick={() => setOffset(offset + limit)}
              style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: canNext ? T.textPrimary : T.textTertiary, cursor: canNext ? "pointer" : "default", fontFamily: "inherit" }}>
              Next →
            </button>
          </div>
        </div>
      )}

      {data && data.items.length === 0 && !loading && (
        <div style={{ color: T.textTertiary, fontSize: 13, padding: "32px 0", textAlign: "center" }}>
          No first-degree connections match the current filter.
        </div>
      )}

      {data && data.items.length > 0 && (
        <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, overflow: "hidden" }}>
          {data.items.map(function(p, idx){
            return (
              <div key={p.id} style={{
                padding: "12px 16px",
                borderBottom: idx < data.items.length - 1 ? "1px solid " + T.borderSoft : "none",
                display: "flex", flexDirection: "column", gap: 2,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Link href={`/people/${p.id}`}
                    style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, textDecoration: "none" }}>
                    {p.full_name || "(no name)"}
                  </Link>
                  <PersonBadges person={p} />
                </div>
                {(p.title || p.company) && (
                  <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>
                    {[p.title, p.company].filter(Boolean).join(" · ")}
                  </div>
                )}
                {p.location && <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 3 }}>{p.location}</div>}
              </div>
            )
          })}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 12 }}>
          <button disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - limit))}
            style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: canPrev ? T.textPrimary : T.textTertiary, cursor: canPrev ? "pointer" : "default", fontFamily: "inherit" }}>
            ← Prev
          </button>
          <button disabled={!canNext} onClick={() => setOffset(offset + limit)}
            style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: canNext ? T.textPrimary : T.textTertiary, cursor: canNext ? "pointer" : "default", fontFamily: "inherit" }}>
            Next →
          </button>
        </div>
      )}
    </main>
  )
}
