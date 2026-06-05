"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { T } from "@/lib/pipelineTheme"
import Avatar from "@/components/Avatar"

// SidebarSearch — find any person from any page in the new app.
// Routes to the right pipeline view + person query param so the workbench
// opens to that person in their current stage. Same chrome on pipeline,
// pool, and queue layouts.

export default function SidebarSearch() {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [results, setResults] = useState(null)   // null = idle, [] = empty, [...] = results
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(-1)
  const wrapRef = useRef(null)
  const debounceRef = useRef(null)

  // Debounced fetch
  useEffect(function(){
    if (q.trim().length < 2) { setResults(null); setLoading(false); return }
    setLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async function(){
      try {
        const r = await fetch("/api/search?q=" + encodeURIComponent(q))
        const d = await r.json()
        const combined = [
          ...((d.contacts || []).map(c => ({ kind: "person", ...c }))),
          ...((d.companies || []).map(c => ({ kind: "company", ...c })))
        ]
        setResults(combined)
        setFocusIdx(combined.length > 0 ? 0 : -1)
      } catch(e) { setResults([]) }
      setLoading(false)
    }, 200)
  }, [q])

  // Close on outside click
  useEffect(function(){
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return function() { document.removeEventListener("mousedown", onDocClick) }
  }, [])

  function routeFor(r) {
    if (r.kind === "person") return `/people/${r.id}`
    if (r.kind === "company") return `/companies/${r.id}`
    return null
  }

  function selectResult(r) {
    const url = routeFor(r)
    if (url) {
      setOpen(false); setQ(""); setResults(null)
      router.push(url)
    }
  }

  function onKeyDown(e) {
    if (!open || !results || results.length === 0) return
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx(i => Math.min((results.length - 1), i + 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx(i => Math.max(0, i - 1)) }
    else if (e.key === "Enter") { e.preventDefault(); if (focusIdx >= 0) selectResult(results[focusIdx]) }
    else if (e.key === "Escape") { setOpen(false) }
  }

  function typeBadge(r) {
    if (r.kind === "company") return { label: "Co", color: T.accent || "#3b82f6" }
    switch (r.type) {
      case "CFO": case "CFO_PROSPECT": return { label: "CFO", color: "#d97706" }
      case "Sponsor contact": case "SPONSOR_CONTACT": return { label: "SPNR", color: "#a855f7" }
      case "Referral partner": case "REFERRAL_PARTNER": return { label: "REF", color: "#10b981" }
      case "CFO + Sponsor": return { label: "CFO+", color: "#d97706" }
      default: return { label: "•", color: T.textTertiary || "#888" }
    }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", padding: "0 8px 12px" }}>
      <input
        type="text"
        value={q}
        onChange={function(e){ setQ(e.target.value); setOpen(true) }}
        onFocus={function(){ if (q.trim().length >= 2) setOpen(true) }}
        onKeyDown={onKeyDown}
        placeholder="Find a person…"
        style={{
          width: "100%", padding: "8px 12px",
          fontSize: 13, fontFamily: "inherit",
          color: "white",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 7, outline: "none",
        }}
      />
      {open && (loading || results) && (
        <div style={{
          position: "absolute", top: "100%", left: 8, right: 8,
          marginTop: 4, maxHeight: 380, overflowY: "auto",
          background: "white", color: T.textPrimary || "#111",
          border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 50,
          fontSize: 13,
        }}>
          {loading && <div style={{ padding: "10px 12px", color: "#888" }}>Searching…</div>}
          {!loading && results && results.length === 0 && (
            <div style={{ padding: "10px 12px", color: "#888" }}>No matches for "{q}".</div>
          )}
          {!loading && results && results.map(function(r, i){
            const badge = typeBadge(r)
            const active = i === focusIdx
            return (
              <div key={r.kind + ":" + r.id}
                onMouseEnter={function(){ setFocusIdx(i) }}
                onClick={function(){ selectResult(r) }}
                style={{
                  padding: "8px 12px", cursor: "pointer",
                  background: active ? "#f5f5f5" : "white",
                  borderBottom: "1px solid #f0f0f0",
                  display: "flex", alignItems: "center", gap: 10
                }}>
                <span style={{
                  fontSize: 10, padding: "2px 6px", borderRadius: 4,
                  background: badge.color, color: "white", fontWeight: 600,
                  flexShrink: 0, minWidth: 32, textAlign: "center"
                }}>{badge.label}</span>
                {r.kind === "person" && <Avatar name={r.name} src={r.avatar_url} size={26} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[r.title, r.company, r.stage].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
