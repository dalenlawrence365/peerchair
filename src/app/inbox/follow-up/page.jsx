"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

const ROLE_COLOR = { cfo: "#d97706", sponsor_contact: "#a855f7", referral_partner: "#10b981" }

function fmtRel(iso) {
  if (!iso) return ""
  const d = new Date(iso); const diff = (Date.now() - d) / 60000
  if (diff < 1) return "just now"
  if (diff < 60) return Math.round(diff) + "m ago"
  if (diff < 1440) return Math.round(diff / 60) + "h ago"
  if (diff < 10080) return Math.round(diff / 1440) + "d ago"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function FollowUpQueue() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(function(){
    fetch("/api/inbox/follow-up").then(r => r.json()).then(function(d){
      if (d.error) setError(d.error); else setData(d)
    }).catch(e => setError(e.message || String(e)))
  }, [])

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  return (
    <main style={{ padding: "26px 32px 64px", maxWidth: 1080 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Follow-up queue</h1>
      <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 6, marginBottom: 22, maxWidth: 720 }}>
        People with an active <code style={{ background: T.bg, padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>reply_received</code> tag — they responded and haven't been actioned yet. Open the profile, read the message, decide what to do.
      </p>

      {data.people.length === 0 ? (
        <Card>
          <div style={{ color: T.textSecondary, padding: 18, textAlign: "center" }}>✓ Inbox zero. No outstanding replies.</div>
        </Card>
      ) : (
        data.people.map(function(p){
          const role = (p.roles && p.roles[0]) || null
          return (
            <Link key={p.id} href={`/people/${p.id}`} style={{ textDecoration: "none", color: T.textPrimary }}>
              <div style={{
                background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10,
                padding: 16, marginBottom: 10, cursor: "pointer"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div>
                      {role && (
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: ROLE_COLOR[role] || "#888", color: "white", fontWeight: 600 }}>
                          {role === "cfo" ? "CFO" : role === "sponsor_contact" ? "SPNR" : "REF"}
                        </span>
                      )}
                      {p.stage && (
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, border: "1px solid " + T.border, color: T.textSecondary }}>{p.stage}</span>
                      )}
                      {p.has_unread && (
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "#dbeafe", color: "#1e40af", fontWeight: 600 }}>UNREAD</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 6 }}>
                      {[p.title, p.company].filter(Boolean).join(" · ") || "—"}
                    </div>
                    {p.latest_body && (
                      <div style={{ fontSize: 13, color: T.textPrimary, background: T.bg, padding: "8px 12px", borderRadius: 6, lineHeight: 1.5,
                        display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden"
                      }}>{p.latest_body}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>{fmtRel(p.replied_at)}</div>
                </div>
              </div>
            </Link>
          )
        })
      )}
    </main>
  )
}

function Card({ children }) {
  return <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12 }}>{children}</div>
}
