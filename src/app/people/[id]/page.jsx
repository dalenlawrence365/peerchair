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

// Tag pickers — known choices are offered as one-tap quick-adds; the free-text box adds anything on the fly.
// Status = mutable state (set/removed). Action = point-in-time event (audit trail, runs supersession).
const STATUS_TAG_CHOICES = ["do_not_contact", "not_a_fit", "opted_out", "snoozed", "reserve"]
const ACTION_TAG_CHOICES = ["connection_sent", "connection_accepted", "first_meeting", "reply_received", "brochure_sent", "cfo_survey_sent", "fit_call_scheduled", "fit_call_completed", "event_invite_sent", "event_rsvp_confirmed"]
const QUICK_ADD_STYLE = { padding: "3px 8px", fontSize: 11, borderRadius: 4, border: "1px dashed " + T.border, background: "transparent", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }
function addBtnStyle(val) { const on = !!(val && val.trim()); return { padding: "5px 12px", fontSize: 12, borderRadius: 6, border: "1px solid " + T.border, background: on ? "#3b82f6" : "white", color: on ? "white" : T.textTertiary, cursor: on ? "pointer" : "not-allowed", fontFamily: "inherit" } }

function fmtDate(iso) {
  if (!iso) return ""
  try { return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) } catch(e) { return iso }
}
function fmtShort(iso) {
  if (!iso) return ""
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) } catch(e) { return iso }
}

// Normalize the inconsistently-cased channel values into clean filter buckets.
const TIMELINE_TYPES = [
  { key: "email",    label: "Email",     color: "#0ea5e9" },
  { key: "linkedin", label: "LinkedIn",  color: "#0a66c2" },
  { key: "meeting",  label: "Meetings",  color: "#16a34a" },
  { key: "note",     label: "Notes",     color: "#d97706" },
  { key: "system",   label: "System",    color: "#94a3b8" },
]
const TIMELINE_COLOR = TIMELINE_TYPES.reduce(function(m, t){ m[t.key] = t.color; return m }, {})
function timelineType(c) {
  const ch = (c.channel || "").toLowerCase()
  const sl = (c.step_label || "").toLowerCase()
  if (ch.includes("note") || sl === "note" || c.direction === "INTERNAL") return "note"
  if (ch.includes("email")) return "email"
  if (ch.includes("linkedin") || ch.includes("inmail")) return "linkedin"
  if (ch.includes("calendly") || ch.includes("phone") || ch.includes("person") || ch.includes("meeting") || ch.includes("call")) return "meeting"
  return "system"
}

// Display-only: turn a notes blob into readable lines. Respects real line
// breaks first; otherwise splits on sentence boundaries, protecting common
// abbreviations so "incl. Exxon" / "Inc." / "e.g." don't fragment. Never
// mutates the stored value.
function formatNoteLines(text) {
  if (!text) return []
  const paras = String(text).split(/\n+/).map(function(s){ return s.trim() }).filter(Boolean)
  const ABBR = /\b(incl|approx|est|no|vs|etc|e\.g|i\.e|Inc|Corp|Ltd|Co|St|Mr|Mrs|Ms|Dr|Jr|Sr|U\.S|a\.k\.a)\.$/i
  const out = []
  paras.forEach(function(para){
    // tentative split on ". " before a capital letter, dollar sign, or digit
    const chunks = para.split(/(?<=[.!?])\s+(?=[A-Z$0-9])/)
    let buf = ""
    chunks.forEach(function(c){
      const piece = (buf ? buf + " " : "") + c
      // if this chunk ended on a protected abbreviation, keep accumulating
      if (ABBR.test(c.trim())) { buf = piece }
      else { out.push(piece.trim()); buf = "" }
    })
    if (buf) out.push(buf.trim())
  })
  return out.filter(Boolean)
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
  const [newStatusTag, setNewStatusTag] = useState("")
  const [newActionTag, setNewActionTag] = useState("")
  const [showStateMenu, setShowStateMenu] = useState(false)
  const [showAvatarEdit, setShowAvatarEdit] = useState(false)
  const [avatarInput, setAvatarInput] = useState("")
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [timelineFilter, setTimelineFilter] = useState("all")

  async function uploadAvatarFile(file) {
    if (!file) return
    if (!/^image\//.test(file.type)) { setError("Please drop an image file (JPG, PNG, WEBP, or GIF)."); return }
    setUploading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const r = await fetch(`/api/people/${id}/avatar`, { method: "POST", body: fd })
      const j = await r.json()
      if (!r.ok) { setError(j.error || "Upload failed") }
      else { setShowAvatarEdit(false) }
    } catch(e) { setError(e.message || String(e)) }
    setUploading(false)
    reload()
  }

  // For images dragged straight off a web page (e.g. LinkedIn): the browser
  // gives us a URL, not a file. Send the URL; the server fetches + stores it.
  async function uploadAvatarFromUrl(url) {
    if (!url) return
    setUploading(true); setError(null)
    try {
      const r = await fetch(`/api/people/${id}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: url }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || "Upload failed") }
      else { setShowAvatarEdit(false) }
    } catch(e) { setError(e.message || String(e)) }
    setUploading(false)
    reload()
  }

  // Pull an image URL out of a drop that carried no file.
  function urlFromDrop(dt) {
    let u = (dt.getData("text/uri-list") || "").split("\n").find(function(s){ return s && !s.startsWith("#") })
    if (!u) {
      const html = dt.getData("text/html")
      const m = html && html.match(/<img[^>]+src=["']([^"']+)["']/i)
      if (m) u = m[1]
    }
    if (!u) { const t = dt.getData("text/plain"); if (/^https?:\/\//i.test(t)) u = t.trim() }
    return u || ""
  }

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

  function addStatusTag(tag) {
    const t = (tag || "").trim()
    if (!t) return
    postAction({ action: "add_tag", tag: t })
    setNewStatusTag("")
  }
  function addActionTag(tag) {
    const t = (tag || "").trim()
    if (!t) return
    const d = new Date()
    const asof = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    postAction({ action: "action_tag", action_type: t, as_of_date: asof })
    setNewActionTag("")
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
              {/* Stage stepper — click any stage to move the primary role up or down a level */}
              {primaryRole && STATE_OPTIONS[primaryRole] && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", width: "100%", marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginRight: 4 }}>Stage</span>
                  {STATE_OPTIONS[primaryRole].map(function(s, i){
                    const stages = STATE_OPTIONS[primaryRole]
                    const cur = p[STATE_FIELD[primaryRole]]
                    const curIdx = stages.indexOf(cur)
                    const isCur = s === cur
                    const isPast = curIdx >= 0 && i < curIdx
                    const isAdjacent = curIdx >= 0 && Math.abs(i - curIdx) === 1
                    const rc = ROLE_COLOR[primaryRole] || "#475569"
                    return (
                      <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {i > 0 && <span style={{ color: T.border, fontSize: 12 }}>›</span>}
                        <button disabled={busy || isCur}
                          onClick={function(){ if (!isCur) postAction({ action: "set_state", role: primaryRole, state: s }) }}
                          title={isCur ? "Current stage" : (curIdx >= 0 && i < curIdx ? "Move back to " + s : "Advance to " + s)}
                          style={{
                            fontSize: 11, padding: "4px 10px", borderRadius: 999, fontFamily: "inherit",
                            fontWeight: isCur ? 700 : 500,
                            cursor: isCur ? "default" : (busy ? "not-allowed" : "pointer"),
                            background: isCur ? rc : (isPast ? rc + "22" : "white"),
                            color: isCur ? "white" : (isPast ? rc : T.textSecondary),
                            border: "1px solid " + (isCur ? rc : (isAdjacent ? rc + "88" : T.border)),
                            textTransform: "capitalize"
                          }}>{s}</button>
                      </span>
                    )
                  })}
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
            {/* Drag & drop / click to upload */}
            <label
              onDragOver={function(e){ e.preventDefault(); setDragOver(true) }}
              onDragLeave={function(){ setDragOver(false) }}
              onDrop={function(e){ e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { uploadAvatarFile(f); return } const u = urlFromDrop(e.dataTransfer); if (u) { uploadAvatarFromUrl(u); return } setError("Couldn't read that drop. Try dragging the image file from your desktop, or click to choose a file.") }}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "24px", border: "2px dashed " + (dragOver ? "#3b82f6" : T.border),
                borderRadius: 10, background: dragOver ? "#eff6ff" : T.bg, cursor: "pointer", textAlign: "center"
              }}>
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={function(e){ const f = e.target.files && e.target.files[0]; if (f) uploadAvatarFile(f) }} />
              <div style={{ fontSize: 22 }}>{uploading ? "⏳" : "📷"}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary }}>
                {uploading ? "Uploading…" : "Drag a photo here, or click to choose"}
              </div>
              <div style={{ fontSize: 11, color: T.textTertiary }}>Drag straight from LinkedIn, or a file · JPG/PNG/WEBP/GIF · up to 5MB</div>
            </label>

            {/* URL fallback */}
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>or paste URL</span>
              <input value={avatarInput} onChange={function(e){ setAvatarInput(e.target.value) }}
                placeholder="https://…"
                style={{ flex: 1, maxWidth: 420, padding: "7px 10px", fontSize: 12, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
              <button disabled={busy || !avatarInput.trim()} onClick={function(){ postAction({ action: "set_avatar", avatar_url: avatarInput }); setShowAvatarEdit(false); setAvatarInput("") }}
                style={{ padding: "7px 12px", fontSize: 12, borderRadius: 6, border: "1px solid " + T.border, background: avatarInput.trim() ? "#3b82f6" : "white", color: avatarInput.trim() ? "white" : T.textTertiary, cursor: avatarInput.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>Set</button>
            </div>
            {p.avatar_url && (
              <button onClick={function(){ postAction({ action: "set_avatar", avatar_url: "" }); setShowAvatarEdit(false) }}
                style={{ marginTop: 10, padding: "5px 10px", fontSize: 11, borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.danger, cursor: "pointer", fontFamily: "inherit" }}>Remove photo</button>
            )}
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
              <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Call notes</div>
              <ul style={{ margin: 0, paddingLeft: 18, maxWidth: 760, listStyle: "disc" }}>
                {formatNoteLines(p.firmographics.notes).map(function(line, i){
                  return <li key={i} style={{ fontSize: 13, color: T.textPrimary, lineHeight: 1.55, marginBottom: 7 }}>{line}</li>
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Status & action tags — split: Status (left) · Activity (right). Each: quick-add choices + custom on the fly. */}
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Tags</div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>

          {/* ── STATUS (left) ── */}
          <div style={{ flex: "1 1 260px", minWidth: 240, borderRight: "1px solid " + T.border, paddingRight: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#0f3d6e", display: "inline-block" }} /> STATUS
              <span style={{ fontWeight: 400, color: T.textTertiary }}>· current state</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", minHeight: 22 }}>
              {data.status_tags.map(function(t){
                return (
                  <span key={"s_" + t.tag} title={`Set ${fmtDate(t.set_at)}${t.notes ? " — " + t.notes : ""}`} style={{
                    fontSize: 11, padding: "3px 6px 3px 9px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500,
                    background: t.tag === "needs_role_review" ? "#fef3c7" : "#eaf0f8",
                    border: "1px solid " + (t.tag === "needs_role_review" ? "#fcd34d" : "#c7d5ea"),
                    color: t.tag === "needs_role_review" ? "#92400e" : "#1e3a5f"
                  }}>
                    {t.tag}
                    <span onClick={function(){ postAction({ action: "remove_tag", tag: t.tag }) }} style={{ cursor: "pointer", opacity: 0.5, fontWeight: 700 }} title="Remove tag">×</span>
                  </span>
                )
              })}
              {data.status_tags.length === 0 && <span style={{ fontSize: 12, color: T.textTertiary }}>None</span>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {STATUS_TAG_CHOICES.filter(function(c){ return !data.status_tags.some(function(t){ return t.tag === c }) }).map(function(c){
                return <button key={c} disabled={busy} onClick={function(){ addStatusTag(c) }} style={QUICK_ADD_STYLE}>+ {c}</button>
              })}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input value={newStatusTag} onChange={function(e){ setNewStatusTag(e.target.value) }}
                onKeyDown={function(e){ if (e.key === "Enter") addStatusTag(newStatusTag) }}
                placeholder="custom status…"
                style={{ flex: 1, padding: "5px 9px", fontSize: 12, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
              <button disabled={!newStatusTag.trim() || busy} onClick={function(){ addStatusTag(newStatusTag) }} style={addBtnStyle(newStatusTag)}>Add</button>
            </div>
          </div>

          {/* ── ACTIVITY / ACTION (right) ── */}
          <div style={{ flex: "1 1 260px", minWidth: 240 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#15803d", display: "inline-block" }} /> ACTIVITY
              <span style={{ fontWeight: 400, color: T.textTertiary }}>· logged events</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", minHeight: 22 }}>
              {data.action_tags.map(function(t, i){
                return (
                  <span key={"a_" + i} title={`${fmtDate(t.set_at)}${t.notes ? " — " + t.notes : ""}`} style={{
                    fontSize: 11, padding: "3px 9px", borderRadius: 4, fontWeight: 500,
                    background: "#e9f3ec", border: "1px solid #c3e0cc", color: "#1b5e36"
                  }}>{t.action_type}{t.as_of_date ? " · " + fmtShort(t.as_of_date) : ""}</span>
                )
              })}
              {data.action_tags.length === 0 && <span style={{ fontSize: 12, color: T.textTertiary }}>None</span>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {ACTION_TAG_CHOICES.filter(function(c){ return !data.action_tags.some(function(t){ return t.action_type === c }) }).map(function(c){
                return <button key={c} disabled={busy} onClick={function(){ addActionTag(c) }} style={QUICK_ADD_STYLE}>+ {c}</button>
              })}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input value={newActionTag} onChange={function(e){ setNewActionTag(e.target.value) }}
                onKeyDown={function(e){ if (e.key === "Enter") addActionTag(newActionTag) }}
                placeholder="custom activity…"
                style={{ flex: 1, padding: "5px 9px", fontSize: 12, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
              <button disabled={!newActionTag.trim() || busy} onClick={function(){ addActionTag(newActionTag) }} style={addBtnStyle(newActionTag)}>Add</button>
            </div>
            <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 6, lineHeight: 1.4 }}>Logged as of today. Activity is an audit trail — e.g. logging a completion auto-clears its scheduled tag.</div>
          </div>

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
        ) : (() => {
          // Tag each row with its normalized type, then filter
          const tagged = data.communications.map(function(c){ return { ...c, _type: timelineType(c) } })
          const counts = tagged.reduce(function(m, c){ m[c._type] = (m[c._type] || 0) + 1; return m }, {})
          const shown = timelineFilter === "all" ? tagged : tagged.filter(function(c){ return c._type === timelineFilter })
          return (
          <>
            {/* Filter chips */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              <Chip active={timelineFilter === "all"} color="#475569" label={"All"} count={tagged.length} onClick={function(){ setTimelineFilter("all") }} />
              {TIMELINE_TYPES.filter(function(t){ return counts[t.key] }).map(function(t){
                return <Chip key={t.key} active={timelineFilter === t.key} color={t.color} label={t.label} count={counts[t.key]} onClick={function(){ setTimelineFilter(t.key) }} />
              })}
            </div>

            {shown.length === 0 ? (
              <div style={{ color: T.textTertiary, fontSize: 13, padding: "8px 0" }}>No {timelineFilter} activity.</div>
            ) : shown.map(function(c){
            const isOut = c.direction === "OUT" || c.direction === "outbound"
            const isIn = c.direction === "IN" || c.direction === "inbound"
            const isNote = c._type === "note"
            const accent = TIMELINE_COLOR[c._type] || "#888"
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
          })}
          </>
          )
        })()}
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

function Chip({ active, color, label, count, onClick }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 12, padding: "4px 11px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
      border: "1px solid " + (active ? color : "#d1d5db"),
      background: active ? color : "white",
      color: active ? "white" : "#475569", fontWeight: active ? 600 : 400,
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      {label}
      <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 400 }}>{count}</span>
    </button>
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
