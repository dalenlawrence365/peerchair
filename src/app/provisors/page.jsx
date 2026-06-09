"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

function Pill({ bg, fg, text }) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 999,
      fontSize: 9.5, fontWeight: 600,
      background: bg, color: fg, whiteSpace: "nowrap",
    }}>{text}</span>
  )
}

const ROLE_PILL = {
  cfo:               { bg: "rgba(59,130,246,0.12)", fg: "#3b82f6", label: "CFO" },
  sponsor_contact:   { bg: "rgba(22,163,74,0.14)",  fg: "#15803d", label: "Sponsor" },
  referral_partner:  { bg: "rgba(59,130,246,0.10)", fg: "#1d4ed8", label: "Referral" },
}

// Short labels for Dalen's ProVisors groups
const GROUP_LABEL = {
  "Middle Market Affinity Group": "Middle Market",
  "M$A/Capital Formation Group": "M&A Capital",
  "Transactions & Transitions": "T&T",
  "Valley Distributors & Manufacturers": "Valley D&M",
}

const AVATAR_COLORS = ["#3b82f6", "#15803d", "#a855f7", "#ea580c", "#0891b2", "#db2777", "#ca8a04", "#4f46e5"]

function Avatar({ name, src, size = 38 }) {
  const clean = (name || "").trim()
  const initials =
    clean.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join("").toUpperCase() || "?"
  let h = 0
  for (let i = 0; i < clean.length; i++) h = (h * 31 + clean.charCodeAt(i)) >>> 0
  const bg = AVATAR_COLORS[h % AVATAR_COLORS.length]
  if (src) {
    return (
      <img src={src} alt="" referrerPolicy="no-referrer"
        style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", flexShrink: 0, background: "#eee" }} />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 999, background: bg, color: "white",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 600, flexShrink: 0, letterSpacing: 0.2,
    }}>{initials}</div>
  )
}

function fmtRel(iso) {
  if (!iso) return "—"
  const days = (Date.now() - new Date(iso)) / 86400000
  if (days < 1) return "today"
  if (days < 30) return Math.round(days) + "d ago"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function ProvisorsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [busy, setBusy] = useState(null)

  async function load() {
    try {
      const r = await fetch("/api/provisors")
      const j = await r.json()
      if (j.error) setError(j.error); else setData(j)
    } catch (e) { setError(e.message || String(e)) }
  }
  useEffect(() => { load() }, [])

  async function unflag(id) {
    setBusy(id)
    try {
      await fetch(`/api/provisors/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provisors_member: false }),
      })
      await load()
    } finally { setBusy(null) }
  }

  async function flagFromSearch(id) {
    setBusy(id)
    try {
      await fetch(`/api/provisors/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provisors_member: true }),
      })
      setQuery("")
      setSearchResults([])
      setSearchOpen(false)
      await load()
    } finally { setBusy(null) }
  }

  async function runSearch(q) {
    setQuery(q)
    if (q.length < 2) { setSearchResults([]); return }
    try {
      const r = await fetch(`/api/people/search?q=${encodeURIComponent(q)}&limit=8`)
      const j = await r.json()
      setSearchResults(j.results || [])
    } catch { setSearchResults([]) }
  }

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>ProVisors</h1>
        <button onClick={() => setSearchOpen(v => !v)}
          style={{
            fontSize: 12, padding: "6px 12px", borderRadius: 6,
            background: searchOpen ? T.textPrimary : "white", color: searchOpen ? "white" : T.textPrimary,
            border: "1px solid " + T.border, cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
          }}>
          {searchOpen ? "Cancel" : "+ Add ProVisor"}
        </button>
      </div>
      <div style={{ fontSize: 13, color: T.textTertiary, marginTop: 4, marginBottom: 22 }}>
        Primary warm network for sponsor prospecting and referral partner development.
      </div>

      {/* Search to add */}
      {searchOpen && (
        <div style={{ marginBottom: 18, padding: 12, background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10 }}>
          <input
            type="text" placeholder="Search PeerChair by name or company…" autoFocus
            value={query} onChange={(e) => runSearch(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid " + T.border, borderRadius: 6, fontSize: 13, fontFamily: "inherit" }}
          />
          {searchResults.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: 280, overflow: "auto" }}>
              {searchResults.map(p => (
                <div key={p.id} onClick={() => flagFromSearch(p.id)}
                  style={{
                    padding: "8px 10px", borderBottom: "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)"),
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                    opacity: busy === p.id ? 0.5 : 1,
                  }}>
                  <div style={{ flex: 1, fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim()}</span>
                    {p.title && <span style={{ color: T.textTertiary, marginLeft: 6 }}>· {p.title}</span>}
                    {p.company && <span style={{ color: T.textTertiary, marginLeft: 6 }}>· {p.company}</span>}
                  </div>
                  <span style={{ fontSize: 11, color: "#15803d" }}>+ Flag</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 8 }}>
            Click a person to mark them as a ProVisor. Anyone in PeerChair can be flagged — CFOs, sponsors, referral partners, or unroled.
          </div>
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 24 }}>
        <Tile label="Total ProVisors" value={data.stats.total} color="#0891b2" />
        <Tile label="Connected on LinkedIn" value={data.stats.connected ?? 0} color="#0a66c2" sub={`/${data.stats.total} total`} />
        <Tile label="CFOs" value={data.stats.by_role.cfo} color="#3b82f6" />
        <Tile label="Sponsors" value={data.stats.by_role.sponsor} color="#15803d" />
        <Tile label="Touched 30d" value={data.stats.touched_last_30d} color="#a855f7" sub={`/${data.stats.total} total`} />
      </div>

      {/* People list */}
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid " + T.border, fontSize: 12, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>
          ProVisor list <span style={{ color: T.textPrimary, marginLeft: 6, fontWeight: 500 }}>· {data.people.length.toLocaleString()}</span>
        </div>
        {data.people.length === 0 ? (
          <div style={{ padding: 32, color: T.textTertiary, fontSize: 13, textAlign: "center" }}>
            No ProVisors flagged yet. Click <strong>+ Add ProVisor</strong> above to start.
          </div>
        ) : (
          data.people.map((p, i) => (
            <ProvisorRow key={p.id} p={p} isLast={i === data.people.length - 1}
              busy={busy === p.id} onUnflag={() => unflag(p.id)} />
          ))
        )}
      </div>

      <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 18, lineHeight: 1.5 }}>
        <strong>How auto-tagging works:</strong> when any meeting or email involves a flagged ProVisor, the meeting will pick up the <em>provisors</em> and <em>networking</em> tags automatically (via attendee role-walking in sync-calendar). You don't need to manually tag each meeting.
      </div>
    </main>
  )
}

function Tile({ label, value, color, sub }) {
  return (
    <div style={{
      background: T.cardBg, border: "1px solid " + T.border,
      borderTop: "3px solid " + color, borderRadius: 10, padding: "16px 14px",
    }}>
      <div style={{ fontSize: 28, fontWeight: 600, color: T.textPrimary, lineHeight: 1 }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function ProvisorRow({ p, isLast, busy, onUnflag }) {
  return (
    <div style={{
      padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 12,
      borderBottom: isLast ? "none" : "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)"),
      opacity: busy ? 0.5 : 1,
    }}>
      <Avatar name={p.name} src={p.photo_url} />

      <Link href={`/people/${p.id}`} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: T.textPrimary }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</span>
          {(p.roles || []).map(r => {
            const m = ROLE_PILL[r]
            if (!m) return null
            return <Pill key={r} bg={m.bg} fg={m.fg} text={m.label} />
          })}
          {p.linkedin_connected === true && (
            <Pill bg="rgba(10,102,194,0.12)" fg="#0a66c2" text="✓ 1st" />
          )}
          {p.linkedin_connected === false && (
            <Pill bg="rgba(0,0,0,0.05)" fg={T.textTertiary} text="not connected" />
          )}
        </div>
        <div style={{ fontSize: 12, color: T.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: (p.groups && p.groups.length) ? 5 : 0 }}>
          {[p.title, p.company].filter(Boolean).join(" · ") || "—"}
        </div>
        {p.groups && p.groups.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {p.groups.map(g => (
              <Pill key={g} bg="rgba(168,85,247,0.12)" fg="#7c3aed" text={GROUP_LABEL[g] || g} />
            ))}
          </div>
        )}
      </Link>

      <div style={{ textAlign: "right", whiteSpace: "nowrap", fontSize: 11, color: T.textTertiary, lineHeight: 1.55, paddingTop: 1, minWidth: 130 }}>
        <div>Last touch {fmtRel(p.last_touch)}</div>
        {p.email && (
          <div>
            <a href={`mailto:${p.email}`} style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 500 }}>
              ✉ {p.email.length > 22 ? p.email.slice(0, 20) + "…" : p.email}
            </a>
          </div>
        )}
        {p.linkedin_url && (
          <div>
            <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer"
               style={{ color: "#0a66c2", textDecoration: "none", fontWeight: 500 }}>
              in&nbsp;LinkedIn ↗
            </a>
          </div>
        )}
      </div>

      <button onClick={onUnflag} disabled={busy}
        style={{
          background: "transparent", border: "1px solid " + (T.borderSoft || "rgba(0,0,0,0.1)"),
          color: T.textTertiary, padding: "4px 8px", borderRadius: 6, fontSize: 10,
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }} title="Remove ProVisor flag">
        ✕ Unflag
      </button>
    </div>
  )
}
