"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

function fmtDate(s) {
  if (!s) return "—"
  const d = new Date(s)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
         " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function guessNames(fromName, fromAddress) {
  if (fromName) {
    if (fromName.includes(",")) {
      const [last, first] = fromName.split(",").map(s => s.trim())
      return { first_name: first || "", last_name: last || "" }
    }
    const parts = fromName.trim().split(/\s+/)
    if (parts.length === 1) return { first_name: parts[0], last_name: "" }
    const last_name = parts.pop()
    return { first_name: parts.join(" "), last_name }
  }
  // Fallback: parse from local part of email
  const local = (fromAddress || "").split("@")[0] || ""
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length === 0) return { first_name: "", last_name: "" }
  const cap = w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""
  return { first_name: cap(parts[0]), last_name: cap(parts[parts.length - 1]) }
}

function guessCompany(fromAddress) {
  const domain = (fromAddress || "").split("@")[1] || ""
  const root = domain.split(".").slice(-2, -1)[0]
  if (!root) return ""
  // Common public domains — return empty
  if (["gmail","yahoo","hotmail","outlook","aol","icloud","me","protonmail","fastmail"].includes(root.toLowerCase())) return ""
  return root[0].toUpperCase() + root.slice(1)
}

export default function UnmatchedInboxPage() {
  const [status, setStatus] = useState("new")
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  async function load() {
    try {
      const r = await fetch(`/api/inbox/unmatched?status=${status}`, { cache: "no-store" })
      if (!r.ok) throw new Error("HTTP " + r.status)
      const j = await r.json()
      setData(j)
    } catch (e) { setErr(e.message) }
  }
  useEffect(function(){ load() }, [status])

  return (
    <main style={{ padding: "32px 36px", maxWidth: 980 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Unmatched inbox</h1>
      <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 8, marginBottom: 20, maxWidth: 700 }}>
        Emails from senders not yet in PeerChair. Triage each one: add the sender as a new contact, merge into someone who's already in PeerChair under a different email, ignore (keeps the record), archive (out of view, recoverable), or delete (permanent).
      </p>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid " + T.border, marginBottom: 20 }}>
        {[
          { key: "new", label: "Needs triage" },
          { key: "added_to_peerchair", label: "Added" },
          { key: "merged_into_existing", label: "Merged" },
          { key: "archived", label: "Archived" },
          { key: "ignored", label: "Ignored" },
          { key: "all", label: "All" },
        ].map(function(t){
          const isActive = status === t.key
          const count = data && data.counts && (t.key === "all"
            ? Object.values(data.counts).reduce((s, n) => s + n, 0)
            : (data.counts[t.key] || 0))
          return (
            <button key={t.key} onClick={function(){ setStatus(t.key) }}
              style={{
                fontSize: 13, padding: "10px 14px",
                border: "none", background: "transparent",
                borderBottom: isActive ? "2px solid " + T.textPrimary : "2px solid transparent",
                color: isActive ? T.textPrimary : T.textSecondary,
                fontWeight: isActive ? 600 : 400,
                cursor: "pointer", fontFamily: "inherit",
                marginBottom: -1,
              }}>
              {t.label}
              {data && <span style={{ marginLeft: 6, fontSize: 11, color: T.textTertiary }}>{count}</span>}
            </button>
          )
        })}
      </div>

      {err && <div style={{ color: "#dc2626", fontSize: 13 }}>Error: {err}</div>}
      {!data && !err && <div style={{ color: T.textTertiary, fontSize: 13 }}>Loading…</div>}
      {data && data.items.length === 0 && (
        <div style={{ color: T.textTertiary, fontSize: 13, padding: "32px 0", textAlign: "center" }}>
          {status === "new" ? "Nothing to triage. Inbox is clean." : "No items in this tab."}
        </div>
      )}

      {data && data.items.map(function(item){
        return (
          <UnmatchedRow key={item.id} item={item}
            isExpanded={expandedId === item.id}
            onToggle={function(){ setExpandedId(expandedId === item.id ? null : item.id) }}
            onActioned={async function(){ setExpandedId(null); await load() }}
          />
        )
      })}
    </main>
  )
}

function UnmatchedRow({ item, isExpanded, onToggle, onActioned }) {
  const [mode, setMode] = useState(null)  // 'add' | 'merge' | null
  const showActions = item.status === "new"

  return (
    <div style={{
      background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10,
      padding: 16, marginBottom: 10
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>
            {item.from_name || item.from_address}
            {item.from_name && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: T.textTertiary }}>{item.from_address}</span>}
          </div>
          <div style={{ fontSize: 13, color: T.textPrimary, marginTop: 4, fontWeight: 500 }}>
            {item.subject || "(no subject)"}
          </div>
          {item.body_preview && (
            <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 6, lineHeight: 1.5, maxHeight: 60, overflow: "hidden" }}>
              {item.body_preview.slice(0, 280)}{item.body_preview.length > 280 ? "…" : ""}
            </div>
          )}
          <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 8 }}>
            {fmtDate(item.occurred_at)} · {item.direction}
            {item.status !== "new" && <span style={{ marginLeft: 8, padding: "1px 6px", borderRadius: 4, background: "#e7e5e4", color: T.textSecondary }}>{item.status.replace(/_/g, " ")}</span>}
          </div>
        </div>
        {showActions && !isExpanded && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={function(){ setMode("add"); onToggle() }}
              style={btnStyle("#10b981", "white")}>Add to PeerChair</button>
            <button onClick={function(){ setMode("merge"); onToggle() }}
              style={btnStyle("white", T.textPrimary, T.border)}>Already in PeerChair</button>
            <button onClick={async function(){
              if (!confirm("Ignore this message? You can undo by switching to the Ignored tab.")) return
              const r = await fetch(`/api/inbox/unmatched/${item.id}/action`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "ignore" })
              })
              if (!r.ok) { const j = await r.json().catch(()=>({})); alert("Failed: " + (j.error || r.status)); return }
              await onActioned()
            }}
              style={btnStyle("transparent", T.textSecondary)}>Ignore</button>
            <button onClick={async function(){
              const r = await fetch(`/api/inbox/unmatched/${item.id}/action`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "archive" })
              })
              if (!r.ok) { const j = await r.json().catch(()=>({})); alert("Failed: " + (j.error || r.status)); return }
              await onActioned()
            }}
              style={btnStyle("white", "#64748b", "#cbd5e1")}>Archive</button>
            <button onClick={async function(){
              if (!confirm("Hard-delete this row from the database? This is permanent.")) return
              const r = await fetch(`/api/inbox/unmatched/${item.id}/action`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "delete" })
              })
              if (!r.ok) { const j = await r.json().catch(()=>({})); alert("Failed: " + (j.error || r.status)); return }
              await onActioned()
            }}
              style={btnStyle("white", "#b91c1c", "#fecaca")}>Delete</button>
          </div>
        )}
      </div>

      {isExpanded && mode === "add" && (
        <AddPanel item={item} onCancel={function(){ setMode(null); onToggle() }} onDone={onActioned} />
      )}
      {isExpanded && mode === "merge" && (
        <MergePanel item={item} onCancel={function(){ setMode(null); onToggle() }} onDone={onActioned} />
      )}
    </div>
  )
}

function AddPanel({ item, onCancel, onDone }) {
  const guessed = guessNames(item.from_name, item.from_address)
  const [firstName, setFirstName] = useState(guessed.first_name)
  const [lastName, setLastName] = useState(guessed.last_name)
  const [email, setEmail] = useState(item.from_address || "")
  const [role, setRole] = useState("sponsor_contact")
  const [company, setCompany] = useState(guessCompany(item.from_address))
  const [title, setTitle] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!firstName || !lastName) { alert("First name and last name required."); return }
    setBusy(true)
    try {
      const r = await fetch(`/api/inbox/unmatched/${item.id}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_to_peerchair", first_name: firstName, last_name: lastName, email, role, company, title })
      })
      const j = await r.json()
      if (!r.ok) { alert("Failed: " + (j.error || r.status)); return }
      await onDone()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + T.borderSoft }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Add to PeerChair</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <Field label="First name" value={firstName} onChange={setFirstName} />
        <Field label="Last name" value={lastName} onChange={setLastName} />
        <Field label="Email" value={email} onChange={setEmail} />
        <Field label="Title" value={title} onChange={setTitle} />
        <Field label="Company" value={company} onChange={setCompany} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 4 }}>Role</div>
        <select value={role} onChange={e => setRole(e.target.value)}
          style={{ fontSize: 13, padding: "6px 10px", borderRadius: 6, border: "1px solid " + T.border, background: "white", fontFamily: "inherit" }}>
          <option value="cfo">CFO prospect</option>
          <option value="sponsor_contact">Sponsor contact</option>
          <option value="referral_partner">Referral partner</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={busy} style={btnStyle("#10b981", "white")}>
          {busy ? "Adding…" : "Add + link this message"}
        </button>
        <button onClick={onCancel} style={btnStyle("transparent", T.textSecondary)}>Cancel</button>
      </div>
    </div>
  )
}

function MergePanel({ item, onCancel, onDone }) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const timerRef = useRef(null)

  useEffect(function(){
    clearTimeout(timerRef.current)
    if (!query || query.length < 2) { setResults([]); return }
    timerRef.current = setTimeout(async function(){
      try {
        const r = await fetch(`/api/people/search?q=${encodeURIComponent(query)}&limit=8`, { cache: "no-store" })
        if (r.ok) {
          const j = await r.json()
          setResults(j.results || j.people || j || [])
        }
      } catch (e) { /* ignore */ }
    }, 200)
    return function(){ clearTimeout(timerRef.current) }
  }, [query])

  async function submit() {
    if (!selected) return
    setBusy(true)
    try {
      const r = await fetch(`/api/inbox/unmatched/${item.id}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge_into_existing", person_id: selected.id })
      })
      const j = await r.json()
      if (!r.ok) { alert("Failed: " + (j.error || r.status)); return }
      await onDone()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + T.borderSoft }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Already in PeerChair as…</div>
      <input value={query} onChange={e => { setQuery(e.target.value); setSelected(null) }}
        placeholder="Search by name or email…"
        autoFocus
        style={{ fontSize: 13, padding: "8px 12px", borderRadius: 6, border: "1px solid " + T.border, width: "100%", fontFamily: "inherit", boxSizing: "border-box" }} />
      {results.length > 0 && !selected && (
        <div style={{ marginTop: 6, border: "1px solid " + T.border, borderRadius: 6, maxHeight: 240, overflow: "auto" }}>
          {results.map(function(r){
            return (
              <div key={r.id} onClick={function(){ setSelected(r); setQuery(r.full_name) }}
                style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid " + T.borderSoft }}>
                <div style={{ fontWeight: 500 }}>{r.full_name}</div>
                <div style={{ fontSize: 11, color: T.textTertiary }}>{r.email || "(no email)"} · {(r.roles || []).join(", ") || "(no role)"}</div>
              </div>
            )
          })}
        </div>
      )}
      {selected && (
        <div style={{ marginTop: 10, padding: 10, background: "rgba(16,185,129,0.08)", borderRadius: 6, fontSize: 12, color: T.textPrimary }}>
          → Will merge into <strong>{selected.full_name}</strong> ({selected.email || "no email on file"}). This message will appear on their timeline.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={submit} disabled={!selected || busy} style={btnStyle(selected ? "#3b82f6" : "#9ca3af", "white")}>
          {busy ? "Merging…" : "Merge"}
        </button>
        <button onClick={onCancel} style={btnStyle("transparent", T.textSecondary)}>Cancel</button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 4 }}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)}
        style={{ fontSize: 13, padding: "6px 10px", borderRadius: 6, border: "1px solid " + T.border, width: "100%", boxSizing: "border-box", fontFamily: "inherit" }} />
    </div>
  )
}

function btnStyle(bg, fg, border) {
  return {
    fontSize: 12, padding: "6px 12px", borderRadius: 6,
    border: border ? "1px solid " + border : "none",
    background: bg, color: fg, cursor: "pointer", fontFamily: "inherit", fontWeight: 500, whiteSpace: "nowrap"
  }
}
