"use client"
import { useState, useRef, useEffect } from "react"
import { G, T, BG2, BG3 } from "@/lib/appShared"

var TYPE_LABEL = {
  CFO_PROSPECT:    { label: "CFO",      color: T.gold },
  SPONSOR_CONTACT: { label: "Sponsor",  color: T.purple },
  REFERRAL_PARTNER:{ label: "Referral", color: T.green },
}

export default function GlobalSearch({ onSelectContact, onSelectCompany }) {
  var [q,        setQ]        = useState("")
  var [results,  setResults]  = useState(null)
  var [loading,  setLoading]  = useState(false)
  var [open,     setOpen]     = useState(false)
  var timer     = useRef(null)
  var inputRef  = useRef(null)
  var boxRef    = useRef(null)

  // Debounced search
  useEffect(function() {
    if (!q || q.length < 2) { setResults(null); setOpen(false); return }
    clearTimeout(timer.current)
    setLoading(true)
    timer.current = setTimeout(async function() {
      try {
        var res = await fetch("/api/search?q=" + encodeURIComponent(q))
        var d   = await res.json()
        setResults(d)
        setOpen(true)
      } catch(e) {}
      setLoading(false)
    }, 250)
    return function() { clearTimeout(timer.current) }
  }, [q])

  // Close on outside click
  useEffect(function() {
    function handle(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return function() { document.removeEventListener("mousedown", handle) }
  }, [])

  var hasResults = results && (results.contacts.length > 0 || results.companies.length > 0)

  function selectContact(c) {
    setQ("")
    setOpen(false)
    if (onSelectContact) onSelectContact(c)
  }

  function selectCompany(co) {
    setQ("")
    setOpen(false)
    if (onSelectCompany) onSelectCompany(co)
  }

  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%", maxWidth: 400 }}>
      {/* Input */}
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: T.dim, pointerEvents: "none" }}>⌕</span>
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => q.length >= 2 && setOpen(true)}
          placeholder="Search contacts, sponsors, companies..."
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "8px 12px 8px 32px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 7, color: T.text, fontSize: 13,
            outline: "none", fontFamily: "inherit",
            transition: "border-color 0.15s"
          }}
        />
        {loading && (
          <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: T.dim }}>…</span>
        )}
        {q && !loading && (
          <span onClick={() => { setQ(""); setOpen(false) }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: T.dim, cursor: "pointer" }}>×</span>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 1000,
          background: BG3, border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          overflow: "hidden", maxHeight: 360, overflowY: "auto"
        }}>
          {!hasResults && (
            <div style={{ padding: "14px 16px", fontSize: 13, color: T.dim }}>No results for "{q}"</div>
          )}

          {results?.contacts.length > 0 && (
            <>
              <div style={{ padding: "8px 14px 4px", fontSize: 9, letterSpacing: 2, color: T.dim, textTransform: "uppercase" }}>Contacts</div>
              {results.contacts.map(c => {
                var tl = TYPE_LABEL[c.type] || { label: c.type, color: T.muted }
                return (
                  <div key={c.id} onClick={() => selectContact(c)}
                    style={{ padding: "9px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(240,200,74,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: G, flexShrink: 0 }}>
                      {(c.name || "?")[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: T.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}{c.company ? " · " + c.company : ""}</div>
                    </div>
                    <div style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: tl.color, flexShrink: 0 }}>{tl.label}</div>
                  </div>
                )
              })}
            </>
          )}

          {results?.companies.length > 0 && (
            <>
              <div style={{ padding: "8px 14px 4px", borderTop: results?.contacts.length > 0 ? "1px solid rgba(255,255,255,0.06)" : "none", fontSize: 9, letterSpacing: 2, color: T.dim, textTransform: "uppercase" }}>Sponsor Companies</div>
              {results.companies.map(co => (
                <div key={co.id} onClick={() => selectCompany(co)}
                  style={{ padding: "9px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(155,89,182,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: T.purple, flexShrink: 0 }}>
                    {(co.name || "?")[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{co.name}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{co.type}</div>
                  </div>
                  <div style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "rgba(155,89,182,0.1)", color: T.purple, flexShrink: 0 }}>Sponsor Co.</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
