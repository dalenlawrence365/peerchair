"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

// LinkedIn Messaging — read-only view of EVERY LinkedIn message PeerChair has captured,
// merged across communications + the thread sync. Left: people, most recent message first.
// Right: the full chronological thread (both directions) for the selected person.

const ROLE_COLOR = { cfo: "#d97706", sponsor_contact: "#a855f7", referral_partner: "#10b981" }
const FILTERS = [
  { key: "all", label: "All" },
  { key: "last_in", label: "Last msg from them" },
  { key: "inbound", label: "Has inbound" },
]

function fmtRel(iso) {
  if (!iso) return ""
  const d = new Date(iso); const diff = (Date.now() - d) / 60000
  if (diff < 1) return "just now"
  if (diff < 60) return Math.round(diff) + "m"
  if (diff < 1440) return Math.round(diff / 60) + "h"
  if (diff < 10080) return Math.round(diff / 1440) + "d"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "2-digit" })
}
function fmtFull(iso) {
  if (!iso) return "no date"
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}
function dayKey(iso) { return iso ? new Date(iso).toDateString() : "no date" }

function Chip({ children, bg, color, title }) {
  return <span title={title} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: bg || T.poolBg, color: color || T.poolText, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>
}

export default function LinkedInMessaging() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [thread, setThread] = useState(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")

  useEffect(function () {
    fetch("/api/linkedin-messaging").then(function (r) { return r.json() }).then(function (d) {
      if (d.error) setError(d.error)
      else { setData(d); if (d.people && d.people.length > 0) setSelectedId(d.people[0].id) }
    }).catch(function (e) { setError(e.message || String(e)) })
  }, [])

  useEffect(function () {
    if (!selectedId) return
    setLoadingThread(true); setThread(null)
    fetch("/api/linkedin-messaging/" + selectedId).then(function (r) { return r.json() }).then(function (d) {
      setThread(d.error ? { error: d.error } : d); setLoadingThread(false)
    }).catch(function (e) { setThread({ error: e.message || String(e) }); setLoadingThread(false) })
  }, [selectedId])

  const visible = useMemo(function () {
    if (!data) return []
    const q = query.trim().toLowerCase()
    return data.people.filter(function (p) {
      if (filter === "last_in" && p.last_direction !== "in") return false
      if (filter === "inbound" && p.inbound === 0) return false
      if (!q) return true
      return (p.name + " " + (p.company || "") + " " + (p.title || "")).toLowerCase().indexOf(q) !== -1
    })
  }, [data, query, filter])

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading every captured LinkedIn message…</div></main>

  const s = data.summary
  const selected = data.people.find(function (p) { return p.id === selectedId })
  const months = Object.keys(s.by_month).sort()
  const maxMonth = Math.max.apply(null, months.map(function (m) { return s.by_month[m] }).concat([1]))

  return (
    <main style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* People list */}
      <div style={{ width: 400, borderRight: "1px solid " + T.border, overflowY: "auto", flexShrink: 0 }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid " + T.border, position: "sticky", top: 0, background: T.bg, zIndex: 1 }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>LinkedIn Messaging</h1>
          <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 3 }}>
            {s.total.toLocaleString()} messages · {data.people_count.toLocaleString()} people · {s.inbound.toLocaleString()} in / {s.outbound.toLocaleString()} out
          </div>
          <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 2 }}>
            {s.first_at ? fmtFull(s.first_at).split(",")[0] + ", " + new Date(s.first_at).getFullYear() : "—"} → {s.last_at ? fmtFull(s.last_at).split(",")[0] + ", " + new Date(s.last_at).getFullYear() : "—"}
            {s.unattached > 0 ? " · " + s.unattached + " not linked to a person" : ""}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
            {Object.keys(s.by_source).sort(function (a, b) { return s.by_source[b] - s.by_source[a] }).map(function (k) {
              return <Chip key={k} title="Where the message was captured from">{k} · {s.by_source[k]}</Chip>
            })}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 34, marginTop: 10 }} title="Messages captured per month">
            {months.map(function (m) {
              return <div key={m} title={m + ": " + s.by_month[m]} style={{ flex: 1, minWidth: 3, height: Math.max(2, Math.round(34 * s.by_month[m] / maxMonth)), background: "#93c5fd", borderRadius: 1 }} />
            })}
          </div>
          <input value={query} onChange={function (e) { setQuery(e.target.value) }} placeholder="Search name or company…"
            style={{ width: "100%", boxSizing: "border-box", marginTop: 10, padding: "7px 10px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 6, background: T.cardBg }} />
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {FILTERS.map(function (f) {
              const on = filter === f.key
              return <button key={f.key} onClick={function () { setFilter(f.key) }} style={{
                fontSize: 11, padding: "3px 9px", borderRadius: 12, cursor: "pointer",
                border: "1px solid " + (on ? T.accent : T.border), background: on ? "#dbeafe" : T.cardBg, color: on ? "#1e40af" : T.textSecondary, fontWeight: on ? 600 : 500,
              }}>{f.label}</button>
            })}
            <span style={{ fontSize: 11, color: T.textTertiary, alignSelf: "center" }}>{visible.length} shown</span>
          </div>
        </div>

        {visible.map(function (p) {
          const isSel = p.id === selectedId
          const role = (p.roles && p.roles[0]) || null
          return (
            <div key={p.id} onClick={function () { setSelectedId(p.id) }} style={{
              padding: "11px 14px", borderBottom: "1px solid " + T.borderSoft, cursor: "pointer",
              background: isSel ? "rgba(59,130,246,0.06)" : "transparent",
              borderLeft: isSel ? "3px solid #3b82f6" : "3px solid transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: p.last_direction === "in" ? 600 : 500, color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>{fmtRel(p.last_at)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                {role && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: ROLE_COLOR[role] || "#888", color: "white", fontWeight: 600 }}>{role === "cfo" ? "CFO" : role === "sponsor_contact" ? "SPNR" : "REF"}</span>}
                <span style={{ fontSize: 11, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[p.title, p.company].filter(Boolean).join(" · ")}</span>
              </div>
              <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ color: p.last_direction === "in" ? "#1e40af" : T.textTertiary, fontWeight: 600 }}>{p.last_direction === "in" ? "Them: " : "You: "}</span>{p.last_preview || "(no text)"}
              </div>
              <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 3 }}>{p.total} msgs · {p.inbound} in / {p.outbound} out</div>
            </div>
          )
        })}
        {visible.length === 0 && <div style={{ padding: 24, fontSize: 13, color: T.textSecondary }}>No one matches.</div>}
      </div>

      {/* Thread */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 64px" }}>
        {!selected ? (
          <div style={{ color: T.textTertiary, fontSize: 13, padding: 24 }}>Select a person to see every captured message.</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 6 }}>
              <div>
                <Link href={"/people/" + selected.id} style={{ fontSize: 22, fontWeight: 600, color: T.textPrimary, textDecoration: "none" }}>{selected.name}</Link>
                <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 3 }}>{[selected.title, selected.company].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {selected.linkedin_url && <a href={selected.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, background: "#0a66c2", color: "white", textDecoration: "none", fontWeight: 500 }}>LinkedIn ↗</a>}
                <Link href={"/people/" + selected.id} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid " + T.border, color: T.textPrimary, textDecoration: "none", fontWeight: 500 }}>Profile →</Link>
              </div>
            </div>
            <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: 16 }}>
              {selected.total} captured messages · {selected.inbound} from them · {selected.outbound} from you — oldest first
            </div>

            {loadingThread && <div style={{ color: T.textTertiary, fontSize: 13 }}>Loading thread…</div>}
            {thread && thread.error && <div style={{ color: T.danger, fontSize: 13 }}>⚠ {thread.error}</div>}
            {thread && thread.messages && thread.messages.map(function (m, i) {
              const showDay = i === 0 || dayKey(thread.messages[i - 1].at) !== dayKey(m.at)
              const mine = m.direction === "out"
              const other = m.direction !== "in" && m.direction !== "out"
              return (
                <div key={m.key}>
                  {showDay && <div style={{ textAlign: "center", fontSize: 11, color: T.textTertiary, margin: "14px 0 8px" }}>{m.at ? new Date(m.at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "no date"}</div>}
                  <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                    <div style={{ maxWidth: "72%", background: mine ? "#eff6ff" : other ? T.warningBg : T.cardBg, border: "1px solid " + (mine ? "#bfdbfe" : T.border), borderRadius: 10, padding: "9px 12px" }}>
                      {m.subject && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{m.subject}</div>}
                      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, lineHeight: 1.55 }}>{m.body || "(no text)"}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginTop: 7 }}>
                        <span style={{ fontSize: 10, color: T.textTertiary }}>{mine ? "You" : other ? m.direction : (m.sender_name || "Them")} · {fmtFull(m.at)}</span>
                        {m.sources.map(function (src, j) { return <Chip key={j} title="Captured from">{src}</Chip> })}
                        {m.channel === "inmail" && <Chip bg="#fef3c7" color="#92400e">InMail</Chip>}
                        {m.step_label && <Chip bg="#ede9fe" color="#5b21b6" title="Sequence step">{m.step_label}</Chip>}
                        {m.sequence_key && <Chip bg="#ecfdf5" color="#065f46" title="Sequence">{m.sequence_key}</Chip>}
                        {m.send_status && <Chip bg={m.send_status === "sent" ? T.successBg : T.warningBg} color={m.send_status === "sent" ? T.success : T.warning} title="Send status">{m.send_status}</Chip>}
                        {m.logged_by && <Chip title="Logged by">{m.logged_by}</Chip>}
                        {m.tables.length > 1 && <Chip bg="#f1f5f9" color="#475569" title="This message exists in both tables; shown once">in both tables</Chip>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            {thread && thread.messages && thread.messages.length === 0 && <div style={{ color: T.textTertiary, fontSize: 13 }}>No captured messages for this person.</div>}
          </>
        )}
      </div>
    </main>
  )
}
