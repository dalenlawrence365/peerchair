"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

const ROLE_LABEL = { cfo: "CFO", sponsor_contact: "Sponsor Contact", referral_partner: "Referral Partner" }
const ROLE_COLOR = { cfo: "#d97706", sponsor_contact: "#a855f7", referral_partner: "#10b981" }

const CHANNEL_COLOR = { LinkedIn: "#0a66c2", Calendly: "#006bff", Email: "#16a34a", Note: "#6b7280", Phone: "#f97316" }

function fmtDate(iso) {
  if (!iso) return ""
  try { return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) } catch(e) { return iso }
}
function fmtShort(iso) {
  if (!iso) return ""
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) } catch(e) { return iso }
}

export default function PersonProfile() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(function(){
    if (!id) return
    setLoading(true); setError(null)
    fetch(`/api/people/${id}`)
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j } }) })
      .then(function(res){
        if (!res.ok) { setError(res.j.error || "Failed to load"); setLoading(false); return }
        setData(res.j); setLoading(false)
      })
      .catch(function(e){ setError(e.message || String(e)); setLoading(false) })
  }, [id])

  if (loading) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>
  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return null

  const p = data.person
  const stage = p.cfo_state || p.sponsor_state || p.referral_state
  const primaryRole = (p.roles || [])[0]
  const backLink = primaryRole === "sponsor_contact" && p.sponsor_state ? `/pipeline/sponsor/${p.sponsor_state}` :
                   primaryRole === "cfo" && p.cfo_state ? `/pipeline/cfo/${p.cfo_state}` :
                   "/pipeline/cfo/prospect"

  return (
    <main style={{ padding: "24px 28px 64px", maxWidth: 1080 }}>

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.textTertiary, marginBottom: 14 }}>
        <Link href={backLink} style={{ color: T.textTertiary, textDecoration: "none" }}>← Back to pipeline</Link>
      </div>

      {/* Header */}
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 14, padding: 24, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>{p.full_name || "(no name)"}</h1>
            <div style={{ fontSize: 14, color: T.textSecondary, marginTop: 4 }}>
              {[p.title, p.company].filter(Boolean).join(" · ") || "—"}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(p.roles || []).map(function(r){
                return (
                  <span key={r} style={{
                    fontSize: 11, padding: "3px 9px", borderRadius: 999,
                    background: ROLE_COLOR[r] || "#888", color: "white", fontWeight: 600
                  }}>{ROLE_LABEL[r] || r}</span>
                )
              })}
              {stage && (
                <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, border: "1px solid " + T.border, color: T.textSecondary }}>
                  {stage}
                </span>
              )}
            </div>
          </div>
          {p.linkedin_url && (
            <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" style={{
              fontSize: 12, padding: "7px 12px", borderRadius: 6,
              background: "#0a66c2", color: "white", textDecoration: "none", fontWeight: 500,
              whiteSpace: "nowrap"
            }}>Open in LinkedIn ↗</a>
          )}
        </div>

        {/* Key fields */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 20, paddingTop: 18, borderTop: "1px solid " + T.borderSoft }}>
          <Field label="Email" value={p.email} />
          <Field label="Phone" value={p.phone || p.mobile} />
          <Field label="Location" value={p.location} />
          <Field label="Source" value={p.source} />
        </div>
      </div>

      {/* Status & action tags */}
      {(data.status_tags.length > 0 || data.action_tags.length > 0) && (
        <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Tags</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data.status_tags.map(function(t){
              return (
                <span key={"s_" + t.tag} title={`Set ${fmtDate(t.set_at)}${t.notes ? " — " + t.notes : ""}`} style={{
                  fontSize: 11, padding: "3px 9px", borderRadius: 4,
                  background: t.tag === "needs_role_review" ? "#fef3c7" : T.bg,
                  border: "1px solid " + T.border,
                  color: t.tag === "needs_role_review" ? "#92400e" : T.textSecondary
                }}>{t.tag}</span>
              )
            })}
            {data.action_tags.map(function(t, i){
              return (
                <span key={"a_" + i} title={`${fmtDate(t.set_at)}${t.notes ? " — " + t.notes : ""}`} style={{
                  fontSize: 11, padding: "3px 9px", borderRadius: 4,
                  background: T.bg, border: "1px solid " + T.border, color: T.textSecondary
                }}>{t.action_type}{t.as_of_date ? " · " + fmtShort(t.as_of_date) : ""}</span>
              )
            })}
          </div>
        </div>
      )}

      {/* LinkedIn thread snapshot if present */}
      {p.linkedin_thread_snapshot && (
        <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>LinkedIn Thread</div>
            <div style={{ fontSize: 11, color: T.textTertiary }}>Updated {fmtShort(p.linkedin_thread_updated_at)}</div>
          </div>
          <pre style={{
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            fontFamily: "inherit", fontSize: 13, lineHeight: 1.55,
            background: T.bg, padding: 14, borderRadius: 8,
            margin: 0, maxHeight: 480, overflowY: "auto"
          }}>{p.linkedin_thread_snapshot}</pre>
        </div>
      )}

      {/* Communications timeline */}
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Activity Timeline</div>
        {data.communications.length === 0 ? (
          <div style={{ color: T.textTertiary, fontSize: 13, padding: "8px 0" }}>No activity yet.</div>
        ) : (
          data.communications.map(function(c){
            const isOut = c.direction === "OUT" || c.direction === "outbound"
            const isIn = c.direction === "IN" || c.direction === "inbound"
            const isNote = c.channel === "Note" || c.direction === "INTERNAL"
            const accent = CHANNEL_COLOR[c.channel] || "#888"
            return (
              <div key={c.id} style={{ paddingTop: 12, paddingBottom: 12, borderBottom: "1px solid " + T.borderSoft, borderLeft: "3px solid " + accent, paddingLeft: 12, marginBottom: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>
                    <span style={{ color: accent }}>{c.channel || "—"}</span>
                    <span style={{ color: T.textTertiary, fontWeight: 400 }}>
                      {" "}· {isNote ? "NOTE" : isOut ? "→ outgoing" : isIn ? "← incoming" : c.direction}
                      {c.step_label ? " · " + c.step_label : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>{fmtDate(c.occurred_at)}</div>
                </div>
                {c.subject && (
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>{c.subject}</div>
                )}
                {c.body && (
                  <div style={{ fontSize: 13, color: T.textPrimary, marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {c.body.length > 600 ? c.body.slice(0, 600) + "…" : c.body}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

    </main>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: value ? T.textPrimary : T.textTertiary }}>{value || "—"}</div>
    </div>
  )
}
