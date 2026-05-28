"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"
import Avatar from "@/components/Avatar"

const ROLE_LABEL = { cfo: "CFO", sponsor_contact: "Sponsor Contact", referral_partner: "Referral Partner" }
const ROLE_COLOR = { cfo: "#d97706", sponsor_contact: "#a855f7", referral_partner: "#10b981" }
const STATE_OPTIONS = {
  cfo: ["pool", "audience", "prospect", "qualified", "member"],
  sponsor_contact: ["pool", "audience", "discovery", "proposal", "active"],
  referral_partner: ["pool", "audience", "active"],
}
const STATE_FIELD = { cfo: "cfo_state", sponsor_contact: "sponsor_state", referral_partner: "referral_state" }

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

  // Action UI state
  const [noteText, setNoteText] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newTag, setNewTag] = useState("")
  const [showStateMenu, setShowStateMenu] = useState(false)
  const [showAvatarEdit, setShowAvatarEdit] = useState(false)
  const [avatarInput, setAvatarInput] = useState("")

  function reload() {
    fetch(`/api/people/${id}`)
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j } }) })
      .then(function(res){
        if (!res.ok) { setError(res.j.error || "Failed to load"); setLoading(false); return }
        setData(res.j); setLoading(false)
      })
      .catch(function(e){ setError(e.message || String(e)); setLoading(false) })
  }

  useEffect(function(){
    if (!id) return
    setLoading(true); setError(null); reload()
  }, [id])

  async function postAction(payload) {
    setBusy(true)
    try {
      const r = await fetch(`/api/people/${id}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || "Action failed") }
    } catch(e) { setError(e.message || String(e)) }
    setBusy(false)
    reload()
  }

  async function saveNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    await postAction({ action: "note", body: noteText.trim() })
    setNoteText(""); setSavingNote(false)
  }

  if (loading) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>
  if (error && !data) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
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

      {error && (
        <div onClick={function(){ setError(null) }} style={{ background: T.dangerBg || "#fee", border: "1px solid " + T.danger, color: T.danger, borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, cursor: "pointer" }}>⚠ {error} (click to dismiss)</div>
      )}

      {/* Header */}
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 14, padding: 24, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
            <div onClick={function(){ setShowAvatarEdit(!showAvatarEdit) }} title="Click to change photo"
              style={{ position: "relative", cursor: "pointer", flexShrink: 0 }}>
              <Avatar name={p.full_name} src={p.avatar_url} size={56} />
              <div style={{ position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: "50%", background: "#3b82f6", border: "2px solid white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "white" }}>✎</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>{p.full_name || "(no name)"}</h1>
            <div style={{ fontSize: 14, color: T.textSecondary, marginTop: 4 }}>
              {[p.title, p.company].filter(Boolean).join(" · ") || "—"}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {(p.roles || []).map(function(r){
                return (
                  <span key={r} style={{
                    fontSize: 11, padding: "3px 9px", borderRadius: 999,
                    background: ROLE_COLOR[r] || "#888", color: "white", fontWeight: 600
                  }}>{ROLE_LABEL[r] || r}</span>
                )
              })}
              {/* Interactive stage dropdown for the primary role */}
              {primaryRole && STATE_OPTIONS[primaryRole] && (
                <div style={{ position: "relative" }}>
                  <button onClick={function(){ setShowStateMenu(!showStateMenu) }} disabled={busy} style={{
                    fontSize: 11, padding: "3px 10px", borderRadius: 999,
                    border: "1px solid " + T.border, color: T.textPrimary, background: "white",
                    cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit"
                  }}>
                    {p[STATE_FIELD[primaryRole]] || "set stage"} ▾
                  </button>
                  {showStateMenu && (
                    <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "white", border: "1px solid " + T.border, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 10, minWidth: 140, overflow: "hidden" }}>
                      {STATE_OPTIONS[primaryRole].map(function(s){
                        const current = p[STATE_FIELD[primaryRole]] === s
                        return (
                          <div key={s} onClick={function(){ setShowStateMenu(false); if (!current) postAction({ action: "set_state", role: primaryRole, state: s }) }}
                            style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", background: current ? T.bg : "white", fontWeight: current ? 600 : 400 }}>
                            {s}{current ? " ✓" : ""}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
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

        {/* Avatar editor — toggled by clicking the photo */}
        {showAvatarEdit && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid " + T.borderSoft }}>
            <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Photo URL</div>
            <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: 8 }}>
              Paste an image URL (right-click their LinkedIn photo → &quot;Copy image address&quot;). Leave blank and save to clear.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={avatarInput} onChange={function(e){ setAvatarInput(e.target.value) }}
                placeholder={p.avatar_url || "https://…"}
                style={{ flex: 1, maxWidth: 520, padding: "8px 12px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
              <button disabled={busy} onClick={function(){ postAction({ action: "set_avatar", avatar_url: avatarInput }); setShowAvatarEdit(false); setAvatarInput("") }}
                style={{ padding: "8px 16px", fontSize: 12, borderRadius: 6, border: "none", background: "#3b82f6", color: "white", cursor: busy ? "not-allowed" : "pointer", fontWeight: 500, fontFamily: "inherit" }}>Save photo</button>
              <button onClick={function(){ setShowAvatarEdit(false); setAvatarInput("") }}
                style={{ padding: "8px 14px", fontSize: 12, borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Firmographics — captured on the fit call */}
      {p.firmographics && (
        <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>Firmographics</div>
            {p.firmographics.last_fit_call && <div style={{ fontSize: 11, color: T.textTertiary }}>Fit call {fmtShort(p.firmographics.last_fit_call)}</div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 14 }}>
            <Field label="Revenue" value={p.firmographics.revenue} />
            <Field label="Employees" value={p.firmographics.employees} />
            <Field label="Finance team" value={p.firmographics.finance_team} />
            <Field label="Ownership" value={p.firmographics.ownership} />
            <Field label="Reports to" value={p.firmographics.reports_to} />
            <Field label="Industry" value={p.firmographics.industry} />
          </div>
          <ChipRow label="Pressure points" items={p.firmographics.pressure_points} color="#3b82f6" />
          <ChipRow label="Buying cues" items={p.firmographics.buying_cues} color="#16a34a" />
          <ChipRow label="Red flags" items={p.firmographics.red_flags} color="#dc2626" />
          {p.firmographics.notes && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + T.borderSoft }}>
              <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Call notes</div>
              <div style={{ fontSize: 13, color: T.textPrimary, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{p.firmographics.notes}</div>
            </div>
          )}
        </div>
      )}

      {/* Status & action tags — always visible (editable) */}
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Tags</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {data.status_tags.map(function(t){
            return (
              <span key={"s_" + t.tag} title={`Set ${fmtDate(t.set_at)}${t.notes ? " — " + t.notes : ""}`} style={{
                fontSize: 11, padding: "3px 6px 3px 9px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 6,
                background: t.tag === "needs_role_review" ? "#fef3c7" : T.bg,
                border: "1px solid " + T.border,
                color: t.tag === "needs_role_review" ? "#92400e" : T.textSecondary
              }}>
                {t.tag}
                <span onClick={function(){ postAction({ action: "remove_tag", tag: t.tag }) }} style={{ cursor: "pointer", opacity: 0.5, fontWeight: 700 }} title="Remove tag">×</span>
              </span>
            )
          })}
          {data.action_tags.map(function(t, i){
            return (
              <span key={"a_" + i} title={`${fmtDate(t.set_at)}${t.notes ? " — " + t.notes : ""}`} style={{
                fontSize: 11, padding: "3px 9px", borderRadius: 4,
                background: T.bg, border: "1px solid " + T.border, color: T.textSecondary, opacity: 0.85
              }}>{t.action_type}{t.as_of_date ? " · " + fmtShort(t.as_of_date) : ""}</span>
            )
          })}
          {data.status_tags.length === 0 && data.action_tags.length === 0 && (
            <span style={{ fontSize: 12, color: T.textTertiary }}>No tags yet.</span>
          )}
        </div>
        {/* Add status tag */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input value={newTag} onChange={function(e){ setNewTag(e.target.value) }}
            onKeyDown={function(e){ if (e.key === "Enter" && newTag.trim()) { postAction({ action: "add_tag", tag: newTag.trim() }); setNewTag("") } }}
            placeholder="Add a status tag (e.g. do_not_contact, hot_lead)…"
            style={{ flex: 1, maxWidth: 360, padding: "6px 10px", fontSize: 12, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
          <button disabled={!newTag.trim() || busy} onClick={function(){ if (newTag.trim()) { postAction({ action: "add_tag", tag: newTag.trim() }); setNewTag("") } }}
            style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, border: "1px solid " + T.border, background: newTag.trim() ? "#3b82f6" : "white", color: newTag.trim() ? "white" : T.textTertiary, cursor: newTag.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>Add</button>
        </div>
      </div>

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

        {/* Note composer */}
        <div style={{ marginBottom: 16 }}>
          <textarea value={noteText} onChange={function(e){ setNoteText(e.target.value) }}
            placeholder="Log a note about this person…"
            rows={noteText ? 3 : 1}
            style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 8, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.5 }} />
          {noteText.trim() && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button onClick={function(){ setNoteText("") }} style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button disabled={savingNote} onClick={saveNote} style={{ padding: "6px 16px", fontSize: 12, borderRadius: 6, border: "none", background: "#3b82f6", color: "white", cursor: savingNote ? "not-allowed" : "pointer", fontWeight: 500, fontFamily: "inherit" }}>{savingNote ? "Saving…" : "Save note"}</button>
            </div>
          )}
        </div>

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

function ChipRow({ label, items, color }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {items.map(function(it, i){
          return <span key={i} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 6, background: color + "15", color: color, border: "1px solid " + color + "40" }}>{it}</span>
        })}
      </div>
    </div>
  )
}
