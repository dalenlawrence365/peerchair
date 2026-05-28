"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

// /queue/review — confirm or correct the role of people who were auto-created
// from an inbound Calendly booking (flagged needs_role_review).

const ROLE_OPTIONS = [
  { key: "cfo", label: "CFO", state: "prospect" },
  { key: "sponsor_contact", label: "Sponsor", state: "discovery" },
  { key: "referral_partner", label: "Referral Partner", state: "audience" },
]

export default function ReviewQueuePage() {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const r = await fetch("/api/queue/review")
      const d = await r.json()
      if (!r.ok) { setError(d.error || "Failed to load"); setLoading(false); return }
      setPeople(d.people || [])
    } catch(e) { setError(e.message || String(e)) }
    setLoading(false)
  }
  useEffect(function(){ load() }, [])

  async function resolve(person_id, action, role, state) {
    setBusyId(person_id)
    try {
      await fetch("/api/queue/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id, action, role, state })
      })
      setPeople(function(prev){ return prev.filter(p => p.id !== person_id) })
    } catch(e) { setError(e.message || String(e)) }
    setBusyId(null)
  }

  function currentRole(p) { return (p.roles && p.roles[0]) || "—" }

  return (
    <main style={{ padding: "24px 28px 48px", maxWidth: 980 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.textTertiary, marginBottom: 14 }}>
        <Link href="/" style={{ color: T.textTertiary, textDecoration: "none" }}>Dashboard</Link>
        <span>›</span><span style={{ color: T.textPrimary }}>Review queue</span>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5, marginBottom: 6 }}>Review queue</h1>
      <p style={{ color: T.textSecondary, fontSize: 14, marginBottom: 24, maxWidth: 720 }}>
        People auto-created from an inbound Calendly booking where the role was guessed from
        the event type. Confirm the guess, or set the correct role. Resolving clears the flag.
      </p>

      {error && (
        <div style={{ background: T.dangerBg, border: "1px solid " + T.danger, borderRadius: 10, padding: "12px 16px", color: T.danger, marginBottom: 16, fontSize: 13 }}>⚠ {error}</div>
      )}

      {loading ? (
        <div style={{ color: T.textTertiary, fontSize: 14 }}>Loading…</div>
      ) : people.length === 0 ? (
        <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 32, textAlign: "center", color: T.textSecondary }}>
          ✓ Nothing to review. New inbound bookings from unknown people will show up here.
        </div>
      ) : (
        people.map(function(p){
          const busy = busyId === p.id
          return (
            <div key={p.id} style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 20, marginBottom: 14, opacity: busy ? 0.5 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{p.name || "(no name)"}</div>
                  <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>
                    {[p.company, p.email].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, background: T.bg, color: T.textSecondary, whiteSpace: "nowrap" }}>
                  guessed: {currentRole(p)}
                </span>
              </div>

              {p.booking_note && (
                <div style={{ fontSize: 12, color: T.textSecondary, background: T.bg, borderRadius: 8, padding: "8px 12px", marginBottom: 12, lineHeight: 1.45 }}>
                  {p.booking_note}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: T.textTertiary, marginRight: 4 }}>Confirm as:</span>
                {ROLE_OPTIONS.map(function(opt){
                  const isCurrent = currentRole(p) === opt.key
                  return (
                    <button key={opt.key} disabled={busy}
                      onClick={function(){ resolve(p.id, isCurrent ? "confirm" : "set_role", opt.key, opt.state) }}
                      style={{ padding: "6px 14px", fontSize: 13, borderRadius: 6, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit",
                        border: "1px solid " + (isCurrent ? T.success : T.border),
                        background: isCurrent ? T.success : "white",
                        color: isCurrent ? "white" : T.textPrimary, fontWeight: isCurrent ? 600 : 400 }}>
                      {opt.label}{isCurrent ? " ✓" : ""}
                    </button>
                  )
                })}
                <Link href={`/people/${p.id}`} style={{ marginLeft: "auto", fontSize: 12, color: T.accent, textDecoration: "none" }}>Open profile →</Link>
              </div>
            </div>
          )
        })
      )}
    </main>
  )
}
