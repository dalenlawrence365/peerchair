"use client"
import { useState, useEffect, useRef } from "react"
import { T } from "@/lib/pipelineTheme"

// Attaches a todo (or anything) to either a person OR a company via typeahead.
// Calls onSelect({ kind: "person"|"company", id, name, subtitle }) when chosen,
// or onSelect(null) when cleared.
//
// Initial selection can be hydrated via `value` prop (same shape as the
// onSelect payload). Pass null/undefined to start empty.
export default function PersonCompanyPicker({ value, onSelect, placeholder = "Search a person or company…" }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState(null)
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(-1)
  const wrapRef = useRef(null)

  // Debounced search
  useEffect(() => {
    if (!q || q.trim().length < 2) { setResults(null); setOpen(false); return }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const d = await r.json()
        const merged = [
          ...((d.contacts  || []).map(p => ({ kind: "person",  id: p.id, name: p.name, subtitle: [p.title, p.company].filter(Boolean).join(" · ") }))),
          ...((d.companies || []).map(c => ({ kind: "company", id: c.id, name: c.name, subtitle: c.type || c.sponsor_type || "Company" }))),
        ]
        setResults(merged); setOpen(true); setFocusIdx(merged.length > 0 ? 0 : -1)
      } catch (e) { /* ignore — UI just stays empty */ }
    }, 180)
    return () => clearTimeout(t)
  }, [q])

  // Close on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  function pick(r) {
    onSelect(r); setQ(""); setResults(null); setOpen(false); setFocusIdx(-1)
  }

  function onKeyDown(e) {
    if (!open || !results || results.length === 0) return
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx(i => Math.min(results.length - 1, i + 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx(i => Math.max(0, i - 1)) }
    else if (e.key === "Enter") { e.preventDefault(); if (focusIdx >= 0) pick(results[focusIdx]) }
    else if (e.key === "Escape") { setOpen(false) }
  }

  // Already-selected chip mode
  if (value) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)", borderRadius: 999, padding: "4px 4px 4px 10px", fontSize: 12, color: T.textPrimary }}>
        <span style={{ fontSize: 10, color: "#3b82f6", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {value.kind === "person" ? "Person" : "Company"}
        </span>
        <span style={{ fontWeight: 500 }}>{value.name}</span>
        <button onClick={() => onSelect(null)} title="Detach"
          style={{ background: "rgba(0,0,0,0.06)", border: "none", color: T.textSecondary, width: 18, height: 18, borderRadius: 999, cursor: "pointer", padding: 0, fontSize: 11, lineHeight: 1, marginLeft: 2 }}>
          ×
        </button>
      </div>
    )
  }

  // Search mode
  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block", minWidth: 280 }}>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => { if (results && results.length > 0) setOpen(true) }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "6px 10px", fontSize: 12,
          border: "1px solid " + T.border, borderRadius: 6,
          fontFamily: "inherit", outline: "none", boxSizing: "border-box",
          background: "white",
        }}
      />
      {open && results && results.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
          background: "white", border: "1px solid " + T.border, borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)", maxHeight: 280, overflowY: "auto",
        }}>
          {results.map((r, i) => (
            <div key={r.kind + ":" + r.id}
              onClick={() => pick(r)}
              onMouseEnter={() => setFocusIdx(i)}
              style={{
                padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                background: focusIdx === i ? "rgba(59, 130, 246, 0.06)" : "transparent",
              }}>
              <div style={{
                width: 22, height: 22, borderRadius: 4,
                background: r.kind === "person" ? "rgba(217, 119, 6, 0.12)" : "rgba(168, 85, 247, 0.12)",
                color:      r.kind === "person" ? "#d97706"                : "#a855f7",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>
                {r.kind === "person" ? "P" : "Co"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary }}>{r.name}</div>
                {r.subtitle && <div style={{ fontSize: 11, color: T.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.subtitle}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {open && results && results.length === 0 && q.trim().length >= 2 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
          background: "white", border: "1px solid " + T.border, borderRadius: 8,
          padding: "10px 12px", fontSize: 12, color: T.textTertiary,
        }}>
          No matches for "{q}"
        </div>
      )}
    </div>
  )
}
