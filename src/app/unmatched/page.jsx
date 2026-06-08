"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

const STATE_COLOR = { audience: "#3b82f6", prospect: "#b45309", qualified: "#a855f7", member: "#15803d" }

function Pill({ bg, fg, text, upper }) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 999,
      fontSize: 9.5, fontWeight: 600,
      textTransform: upper ? "uppercase" : "none", letterSpacing: upper ? 0.3 : 0,
      background: bg, color: fg, whiteSpace: "nowrap",
    }}>{text}</span>
  )
}

function fmtRel(iso) {
  if (!iso) return null
  const days = (Date.now() - new Date(iso)) / 86400000
  if (days < 1) return "today"
  if (days < 30) return Math.round(days) + "d ago"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function UnmatchedPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null) // id currently being resolved

  function load() {
    fetch("/api/unmatched").then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else setData(d)
    }).catch(e => setError(e.message || String(e)))
  }

  useEffect(() => { load() }, [])

  async function resolve(id, disposition, name) {
    if (disposition === "delete") {
      if (!confirm(`Hard-delete ${name}? This wipes their record entirely.`)) return
    }
    setBusy(id)
    try {
      const res = await fetch(`/api/unmatched/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disposition }),
      })
      const json = await res.json()
      if (json.error) { alert(json.error); return }
      // Optimistically remove from list
      setData(d => ({ ...d, people: d.people.filter(p => p.id !== id), count: d.count - 1 }))
    } catch (e) {
      alert("Failed: " + (e.message || e))
    } finally {
      setBusy(null)
    }
  }

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 1180 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Unmatched</h1>
      <div style={{ fontSize: 13, color: T.textTertiary, marginTop: 4, marginBottom: 22 }}>
        {data.count} people flagged for individual review. Pick a disposition for each.
      </div>

      {data.people.length === 0 ? (
        <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 32, textAlign: "center", color: T.textTertiary }}>
          🎉 Inbox zero. All unmatched people have been resolved.
        </div>
      ) : (
        <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden" }}>
          {data.people.map((p, i) => (
            <UnmatchedRow
              key={p.id} p={p}
              isLast={i === data.people.length - 1}
              busy={busy === p.id}
              onResolve={(disp) => resolve(p.id, disp, p.name)}
            />
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 22, lineHeight: 1.5 }}>
        <strong>Dispositions:</strong> <em>CFO prospect</em> sets cfo_state=prospect and adds 'cfo' role ·{" "}
        <em>Sponsor</em> sets sponsor_state=pool and adds 'sponsor_contact' role ·{" "}
        <em>Referral</em> sets referral_state=audience and adds 'referral_partner' role ·{" "}
        <em>Not a fit</em> adds the not_a_fit status_tag, keeps person but no role assignment ·{" "}
        <em>Delete</em> hard-deletes the person and all FK references.
      </div>
    </main>
  )
}

function UnmatchedRow({ p, isLast, busy, onResolve }) {
  const stateColor = STATE_COLOR[p.cfo_state] || "#64748b"
  return (
    <div style={{
      padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12,
      borderBottom: isLast ? "none" : "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)"),
      opacity: busy ? 0.5 : 1, pointerEvents: busy ? "none" : "auto",
    }}>
      {/* Left: identity + context */}
      <Link href={`/people/${p.id}`} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: T.textPrimary }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</span>
          {p.activity.replied  && <Pill bg="rgba(22,163,74,0.14)"  fg="#15803d" text="Reply" />}
          {p.activity.connected && <Pill bg="rgba(10,102,194,0.13)" fg="#0a66c2" text="Connected" />}
          {p.activity.brochure_sent   && <Pill bg="rgba(59,130,246,0.12)" fg="#3b82f6" text="Brochure" />}
          {p.activity.assessment_sent && <Pill bg="rgba(168,85,247,0.14)" fg="#a855f7" text="Assessment" />}
        </div>
        <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>
          {[p.title, p.company].filter(Boolean).join(" · ") || "—"}
        </div>
      </Link>

      {/* Middle: links column (LinkedIn + email) */}
      <div style={{ textAlign: "right", whiteSpace: "nowrap", fontSize: 11, color: T.textTertiary, lineHeight: 1.55, paddingTop: 2, minWidth: 130 }}>
        {p.linkedin_url && (
          <div>
            <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer"
               style={{ color: "#0a66c2", textDecoration: "none", fontWeight: 500 }}>
              in&nbsp;LinkedIn ↗
            </a>
          </div>
        )}
        {p.email && (
          <div>
            <a href={`mailto:${p.email}`} style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 500 }}>
              ✉ {p.email.length > 22 ? p.email.slice(0, 20) + "…" : p.email}
            </a>
          </div>
        )}
        {p.last_touch && <div>Last touch {fmtRel(p.last_touch)}</div>}
      </div>

      {/* Right: action buttons */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 320 }}>
        <ActionBtn onClick={() => onResolve("cfo_prospect")} bg="#fff7ed" fg="#b45309" border="#fed7aa">CFO prospect</ActionBtn>
        <ActionBtn onClick={() => onResolve("sponsor")}      bg="#f0fdf4" fg="#15803d" border="#bbf7d0">Sponsor</ActionBtn>
        <ActionBtn onClick={() => onResolve("referral")}     bg="#eff6ff" fg="#1d4ed8" border="#bfdbfe">Referral</ActionBtn>
        <ActionBtn onClick={() => onResolve("not_a_fit")}    bg="#f8fafc" fg="#64748b" border="#e2e8f0">Not a fit</ActionBtn>
        <ActionBtn onClick={() => onResolve("delete")}       bg="#fef2f2" fg="#b91c1c" border="#fecaca">Delete</ActionBtn>
      </div>
    </div>
  )
}

function ActionBtn({ children, onClick, bg, fg, border }) {
  return (
    <button onClick={onClick}
      style={{
        background: bg, color: fg, border: "1px solid " + border,
        borderRadius: 6, padding: "5px 9px", fontSize: 11, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
      }}>
      {children}
    </button>
  )
}
