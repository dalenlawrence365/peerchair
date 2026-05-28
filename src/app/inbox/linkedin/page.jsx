"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

const ROLE_COLOR = { cfo: "#d97706", sponsor_contact: "#a855f7", referral_partner: "#10b981" }

function fmtRel(iso) {
  if (!iso) return ""
  const d = new Date(iso); const diff = (Date.now() - d) / 60000
  if (diff < 1) return "just now"
  if (diff < 60) return Math.round(diff) + "m"
  if (diff < 1440) return Math.round(diff / 60) + "h"
  if (diff < 10080) return Math.round(diff / 1440) + "d"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function LinkedInInbox() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedThread, setSelectedThread] = useState(null)
  const [loadingThread, setLoadingThread] = useState(false)

  useEffect(function(){
    fetch("/api/inbox/linkedin").then(r => r.json()).then(function(d){
      if (d.error) setError(d.error)
      else {
        setData(d)
        if (d.people && d.people.length > 0) setSelectedId(d.people[0].id)
      }
    }).catch(e => setError(e.message || String(e)))
  }, [])

  useEffect(function(){
    if (!selectedId) return
    setLoadingThread(true)
    fetch(`/api/people/${selectedId}`).then(r => r.json()).then(function(d){
      setSelectedThread(d.person ? d.person.linkedin_thread_snapshot : null)
      setLoadingThread(false)
    }).catch(function(){ setLoadingThread(false) })
  }, [selectedId])

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  const selected = (data.people || []).find(p => p.id === selectedId)

  return (
    <main style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Thread list */}
      <div style={{ width: 380, borderRight: "1px solid " + T.border, overflowY: "auto", flexShrink: 0 }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid " + T.border, position: "sticky", top: 0, background: T.bg, zIndex: 1 }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>LinkedIn inbox</h1>
          <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 3 }}>
            {data.count} threads · <span style={{ color: data.unread_count > 0 ? "#1e40af" : T.textTertiary, fontWeight: data.unread_count > 0 ? 600 : 400 }}>{data.unread_count} unread</span>
          </div>
        </div>
        {data.people.length === 0 ? (
          <div style={{ padding: 24, color: T.textSecondary, fontSize: 13 }}>
            No LinkedIn threads captured yet. Threads populate from LinkedHelper "replied" webhook events going forward.
          </div>
        ) : (
          data.people.map(function(p){
            const isSel = p.id === selectedId
            const role = (p.roles && p.roles[0]) || null
            return (
              <div key={p.id} onClick={function(){ setSelectedId(p.id) }} style={{
                padding: "12px 14px", borderBottom: "1px solid " + (T.borderSoft || "rgba(0,0,0,0.04)"),
                cursor: "pointer", background: isSel ? (T.sidebarActiveBg || "rgba(59,130,246,0.06)") : "transparent",
                borderLeft: isSel ? "3px solid #3b82f6" : "3px solid transparent",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: p.has_unread ? 600 : 500, color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>{fmtRel(p.updated_at)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                  {role && (
                    <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: ROLE_COLOR[role] || "#888", color: "white", fontWeight: 600 }}>
                      {role === "cfo" ? "CFO" : role === "sponsor_contact" ? "SPNR" : "REF"}
                    </span>
                  )}
                  {p.has_unread && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#dbeafe", color: "#1e40af", fontWeight: 600 }}>UNREAD</span>}
                  <span style={{ fontSize: 11, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[p.title, p.company].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Thread detail */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 64px" }}>
        {!selected ? (
          <div style={{ color: T.textTertiary, fontSize: 13, padding: 24 }}>Select a thread to view.</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
              <div>
                <Link href={`/people/${selected.id}`} style={{ fontSize: 22, fontWeight: 600, color: T.textPrimary, textDecoration: "none" }}>{selected.name}</Link>
                <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 3 }}>
                  {[selected.title, selected.company].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {selected.linkedin_url && (
                  <a href={selected.linkedin_url} target="_blank" rel="noopener noreferrer" style={{
                    fontSize: 12, padding: "6px 12px", borderRadius: 6,
                    background: "#0a66c2", color: "white", textDecoration: "none", fontWeight: 500
                  }}>LinkedIn ↗</a>
                )}
                <Link href={`/people/${selected.id}`} style={{
                  fontSize: 12, padding: "6px 12px", borderRadius: 6,
                  border: "1px solid " + T.border, color: T.textPrimary, textDecoration: "none", fontWeight: 500
                }}>Profile →</Link>
              </div>
            </div>

            {loadingThread ? (
              <div style={{ color: T.textTertiary, fontSize: 13 }}>Loading thread…</div>
            ) : selectedThread ? (
              <pre style={{
                whiteSpace: "pre-wrap", wordBreak: "break-word",
                fontFamily: "inherit", fontSize: 13, lineHeight: 1.6,
                background: T.cardBg, border: "1px solid " + T.border,
                padding: 18, borderRadius: 10, margin: 0
              }}>{selectedThread}</pre>
            ) : (
              <div style={{ color: T.textTertiary, fontSize: 13, padding: 16, background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10 }}>
                No thread snapshot captured yet. LinkedHelper sends the full thread on the next "replied" event under the updated parser — until then, no thread to display.
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
