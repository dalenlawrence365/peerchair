"use client"
import { useEffect, useRef, useState } from "react"
import { T } from "@/lib/pipelineTheme"

function Chip({ children, tone }) {
  const tones = {
    cfo: { bg: "#eef2ff", fg: "#3730a3", bd: "#c7d2fe" },
    sponsor: { bg: "#fff7ed", fg: "#9a3412", bd: "#fed7aa" },
  }
  const c = tones[tone] || { bg: T.borderSoft, fg: T.textSecondary, bd: T.border }
  return <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: c.bg, color: c.fg, border: "1px solid " + c.bd }}>{children}</span>
}

export default function PeopleSearchPage() {
  const [q, setQ] = useState("")
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)

  useEffect(function () {
    if (timer.current) clearTimeout(timer.current)
    const term = q.trim()
    if (term.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    timer.current = setTimeout(async function () {
      try {
        const r = await fetch("/api/people/search?q=" + encodeURIComponent(term), { cache: "no-store" })
        const j = await r.json().catch(function () { return { results: [] } })
        setResults(j.results || [])
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 250)
    return function () { if (timer.current) clearTimeout(timer.current) }
  }, [q])

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "4px 2px 12px" }}>People</h1>
      <input
        className="m-input"
        value={q}
        onChange={function (e) { setQ(e.target.value) }}
        placeholder="Search name, company, email…"
        autoComplete="off" autoCorrect="off" autoCapitalize="none"
        style={{ marginBottom: 12 }}
      />

      {loading && <div style={{ color: T.textTertiary, fontSize: 13, padding: "6px 4px" }}>Searching…</div>}
      {!loading && q.trim().length >= 2 && results.length === 0 && (
        <div style={{ color: T.textTertiary, fontSize: 14, padding: "16px 4px" }}>No matches for “{q.trim()}”.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {results.map(function (p) {
          const isCfo = Array.isArray(p.roles) && p.roles.includes("cfo")
          const isSponsor = Array.isArray(p.roles) && p.roles.includes("sponsor_contact")
          return (
            <a key={p.id} href={"/m/people/" + p.id} className="m-card" style={{ display: "block", padding: "13px 14px", textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25 }}>{p.name || p.full_name}</div>
                  {(p.title || p.company) && (
                    <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[p.title, p.company].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
                    {isCfo && <Chip tone="cfo">CFO</Chip>}
                    {isSponsor && <Chip tone="sponsor">Sponsor</Chip>}
                  </div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.textTertiary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
