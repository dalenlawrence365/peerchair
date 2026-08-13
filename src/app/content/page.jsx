"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T, FONT_SERIF } from "@/lib/pipelineTheme"

const FORMATS = ["video", "text", "carousel", "image", "poll", "article"]
const DESTINATIONS = [
  { v: "none", label: "No link (reach post)" },
  { v: "assessment", label: "Assessment" },
  { v: "overview", label: "Brochure" },
  { v: "meeting", label: "Meeting" },
  { v: "investment", label: "Investment" },
  { v: "events/august-11-workshop", label: "Event · Aug 11 Workshop" },
]
const DEST_PILL = {
  overview: "Brochure", assessment: "Assessment", meeting: "Meeting",
  investment: "Investment", "events/august-11-workshop": "Aug 11 Event",
}

const STATUS_COLOR = {
  unscheduled: { bg: "rgba(100,116,139,0.13)", fg: "#475569" },
  scheduled:   { bg: "rgba(217,119,6,0.14)",   fg: "#b45309" },
  posted:      { bg: "rgba(22,163,74,0.14)",   fg: "#15803d" },
}

function Pill({ text, bg, fg }) {
  return <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: 999, fontSize: 9.5,
    fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3, background: bg, color: fg, whiteSpace: "nowrap" }}>{text}</span>
}

function fmtDate(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// Read intrinsic image dimensions in the browser before upload, so width/height
// land in media_assets without needing an image lib on the server.
function readDims(file) {
  return new Promise(function (resolve) {
    try {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = function () { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url) }
      img.onerror = function () { resolve({ w: null, h: null }); URL.revokeObjectURL(url) }
      img.src = url
    } catch { resolve({ w: null, h: null }) }
  })
}

// Date helpers for the schedule fields — convert stored ISO <-> local input value.
function toDateInput(iso) { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
function toDTInput(iso) { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
function fromDate(v) { return v ? new Date(v + "T00:00").toISOString() : null }
function fromDT(v) { return v ? new Date(v).toISOString() : null }
const dateWrap = { display: "flex", flexDirection: "column", gap: 3 }
const dateLbl = { fontSize: 10, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }
const dateInp = { padding: "6px 8px", border: "1px solid " + T.border, borderRadius: 6, fontSize: 12.5, fontFamily: "inherit", color: T.textPrimary, background: "white" }

export default function ContentPage() {
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(null)
  const [uploading, setUploading] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  const [title, setTitle] = useState("")
  const [format, setFormat] = useState("video")
  const [destination, setDestination] = useState("assessment")
  const [scheduledFor, setScheduledFor] = useState("")
  const [view, setView] = useState("calendar")
  const [pickedDate, setPickedDate] = useState(null)
  const [editPost, setEditPost] = useState(null)

  async function load() {
    setError(null)
    try {
      const r = await fetch("/api/content")
      const d = await r.json()
      if (d.error) setError(d.error); else setPosts(d.posts)
    } catch (e) { setError(String(e)) }
  }
  useEffect(function () { load() }, [])

  async function create() {
    if (!title.trim()) { setError("Title is required"); return }
    setBusy(true); setError(null)
    try {
      const r = await fetch("/api/content", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, format, destination, status: scheduledFor ? "scheduled" : "draft",
          scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null })
      })
      const d = await r.json()
      if (d.error) setError(d.error)
      else { setTitle(""); setScheduledFor(""); await load() }
    } catch (e) { setError(String(e)) }
    setBusy(false)
  }

  async function patch(id, body) {
    setBusy(true); setError(null)
    try {
      const r = await fetch("/api/content", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ id }, body)) })
      const d = await r.json()
      if (d.error) setError(d.error); else await load()
    } catch (e) { setError(String(e)) }
    setBusy(false)
  }

  async function uploadGraphic(postId, file) {
    setUploading(postId); setError(null)
    try {
      const dims = await readDims(file)
      const fd = new FormData()
      fd.append("file", file)
      fd.append("post_id", postId)
      if (dims.w) fd.append("width", String(dims.w))
      if (dims.h) fd.append("height", String(dims.h))
      const r = await fetch("/api/content/media", { method: "POST", body: fd })
      const d = await r.json()
      if (d.error) setError(d.error); else await load()
    } catch (e) { setError(String(e)) }
    setUploading(null)
  }

  function removeGraphic(postId) { patch(postId, { graphic_asset_id: null }) }

  function copy(url, id) {
    navigator.clipboard.writeText(url)
    setCopied(id); setTimeout(function () { setCopied(null) }, 1600)
  }

  const input = {
    padding: "8px 10px", borderRadius: 7, border: "1px solid " + T.border,
    fontSize: 13, fontFamily: "inherit", color: T.textPrimary, background: "white", minWidth: 0,
  }

  const fileInput = (p) => (
    <input type="file" accept="image/*" style={{ display: "none" }}
      onChange={e => { const f = e.target.files && e.target.files[0]; if (f) uploadGraphic(p.id, f); e.target.value = "" }} />
  )

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "space-between" }}>
        <h1 style={{ fontFamily: FONT_SERIF, fontSize: 30, fontWeight: 400, margin: 0, lineHeight: 1.1 }}>Content</h1>
        <Link href="/content/scripts" style={{ fontSize: 13, fontWeight: 600, color: "white", background: T.accent, textDecoration: "none", padding: "9px 16px", borderRadius: 8, whiteSpace: "nowrap" }}>Script library →</Link>
      </div>
      <p style={{ fontSize: 13, color: T.textSecondary, margin: "6px 0 0", maxWidth: 660 }}>
        Every LinkedIn post, what it linked to, and what it drove. Posts with a destination get a tracking
        link generated automatically — use that link in the post and the traffic ties back here.
      </p>

      {error && <div style={{ color: T.danger, marginTop: 16 }}>⚠ {error}</div>}

      {view === "list" && (
      <section style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 18, marginTop: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px" }}>New post</h2>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.3fr 1.2fr auto", gap: 10, alignItems: "center" }}>
          <input style={input} placeholder="Title or hook" value={title} onChange={e => setTitle(e.target.value)} />
          <select style={input} value={format} onChange={e => setFormat(e.target.value)}>
            {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select style={input} value={destination} onChange={e => setDestination(e.target.value)}>
            {DESTINATIONS.map(d => <option key={d.v} value={d.v}>{d.label}</option>)}
          </select>
          <input style={input} type="date" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} />
          <button onClick={create} disabled={busy} style={{ padding: "9px 16px", borderRadius: 7, border: "none",
            background: T.accent, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {busy ? "…" : "Create"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 10 }}>
          Leave the date blank for a draft. A tracking link is generated only when there's a destination —
          reach posts (no link) are still worth recording, they just have nothing to attribute.
        </div>
      </section>
      )}

      <div style={{ display: "flex", gap: 6, margin: "24px 0 8px" }}>
        <button onClick={function(){ setView("calendar") }} style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid " + T.border, background: view === "calendar" ? T.accent : "white", color: view === "calendar" ? "white" : T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Calendar</button>
        <button onClick={function(){ setView("list") }} style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid " + T.border, background: view === "list" ? T.accent : "white", color: view === "list" ? "white" : T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>List</button>
      </div>

      {view === "calendar" && (<>
        <UnscheduledTray posts={posts || []} onPatch={patch} onEdit={function(p){ setEditPost(p) }} />
        <ContentCalendar posts={posts || []} onPickDate={function(k){ setPickedDate(k) }} onPatch={patch} onEdit={function(p){ setEditPost(p) }} />
      </>)}

      {pickedDate && <NewPostModal date={pickedDate} onClose={function(){ setPickedDate(null) }} onCreated={function(){ setPickedDate(null); load() }} />}

      {editPost && <FullEditModal post={editPost} onClose={function(){ setEditPost(null) }} onPatch={patch} />}

      {view === "list" && (<>
      {!posts && !error && <div style={{ color: T.textTertiary, marginTop: 20 }}>Loading…</div>}

      {posts && posts.length === 0 && (
        <div style={{ color: T.textTertiary, marginTop: 24, fontSize: 13 }}>No posts yet. Create one above.</div>
      )}

      {posts && posts.map(function (p) {
        const sc = STATUS_COLOR[p.status] || STATUS_COLOR.draft
        return (
          <section key={p.id} id={"post-" + p.id} style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginTop: 14, display: "flex", gap: 14, alignItems: "flex-start" }}>

            {/* Graphic thumbnail — click to view full size; the anchor for finding a post visually */}
            <div style={{ flexShrink: 0 }}>
              {p.graphic_url ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", width: 72 }}>
                  <img src={p.graphic_url} alt={p.graphic_title || ""}
                    onClick={() => setLightbox({ url: p.graphic_url, title: p.graphic_title || p.graphic_original_name || p.title, postId: p.id })}
                    style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid " + T.border, cursor: "zoom-in", display: "block" }} />
                  <label style={{ fontSize: 9.5, color: T.textTertiary, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.3 }}>
                    {fileInput(p)}
                    {uploading === p.id ? "…" : "Replace"}
                  </label>
                </div>
              ) : (
                <label style={{ width: 72, height: 72, borderRadius: 8, border: "1px dashed " + T.border, display: "flex",
                  alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 9.5, color: T.textTertiary,
                  cursor: "pointer", lineHeight: 1.2, padding: 4, boxSizing: "border-box" }}>
                  {fileInput(p)}
                  {uploading === p.id ? "Uploading…" : "+ Add graphic"}
                </label>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14, color: T.textPrimary }}>{p.title}</strong>
                <select value={p.status} disabled={busy} title="Status"
                  onChange={e => patch(p.id, { status: e.target.value })}
                  style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "2px 8px", fontFamily: "inherit", cursor: "pointer",
                    color: (STATUS_COLOR[p.status] || STATUS_COLOR.unscheduled).fg,
                    background: (STATUS_COLOR[p.status] || STATUS_COLOR.unscheduled).bg,
                    border: "1px solid " + (STATUS_COLOR[p.status] || STATUS_COLOR.unscheduled).fg + "55" }}>
                  <option value="unscheduled" style={{ color: "#111827" }}>Unscheduled</option>
                  <option value="scheduled" style={{ color: "#111827" }}>Scheduled</option>
                  <option value="posted" style={{ color: "#111827" }}>Posted</option>
                </select>
                <select value={p.format} onChange={e => patch(p.id, { format: e.target.value })} disabled={busy} title="Post type — change anytime"
                  style={{ fontSize: 11, fontWeight: 600, color: "#3b82f6", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.35)", borderRadius: 999, padding: "2px 8px", fontFamily: "inherit", cursor: "pointer" }}>
                  {FORMATS.map(f => <option key={f} value={f} style={{ color: "#111827" }}>{f}</option>)}
                </select>
                {p.destination !== "none" && <Pill text={"→ " + (DEST_PILL[p.destination] || p.destination)} bg="rgba(168,85,247,0.14)" fg="#a855f7" />}
                {p.boosted && <Pill text="boosted" bg="rgba(217,119,6,0.16)" fg="#b45309" />}
                <span style={{ marginLeft: "auto", fontSize: 11, color: T.textTertiary }}>
                  {p.published_at ? "Published " + fmtDate(p.published_at) : p.scheduled_for ? "Scheduled " + fmtDate(p.scheduled_for) : "Draft"}
                </span>
              </div>

              <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                <label style={dateWrap}><span style={dateLbl}>Scheduled on</span>
                  <input type="date" defaultValue={toDateInput(p.scheduled_on)} style={dateInp}
                    onBlur={e => { if (e.target.value !== toDateInput(p.scheduled_on)) patch(p.id, { scheduled_on: fromDate(e.target.value) }) }} /></label>
                <label style={dateWrap}><span style={dateLbl}>Scheduled for</span>
                  <input type="datetime-local" defaultValue={toDTInput(p.scheduled_for)} style={dateInp}
                    onBlur={e => { if (e.target.value !== toDTInput(p.scheduled_for)) patch(p.id, { scheduled_for: fromDT(e.target.value) }) }} /></label>
                <label style={dateWrap}><span style={dateLbl}>Published</span>
                  <input type="datetime-local" defaultValue={toDTInput(p.published_at)} style={dateInp}
                    onBlur={e => { if (e.target.value !== toDTInput(p.published_at)) patch(p.id, { published_at: fromDT(e.target.value) }) }} /></label>
              </div>

              {p.destination_url && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
                  <code style={{ flex: 1, fontSize: 11.5, background: T.bg, border: "1px solid " + T.borderSoft,
                    borderRadius: 6, padding: "8px 10px", color: T.textSecondary, overflowX: "auto", whiteSpace: "nowrap" }}>
                    {p.destination_url}
                  </code>
                  <button onClick={() => copy(p.destination_url, p.id)} style={{ padding: "8px 12px", borderRadius: 6,
                    border: "1px solid " + T.border, background: copied === p.id ? T.successBg : "white",
                    color: copied === p.id ? T.success : T.textPrimary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    {copied === p.id ? "Copied" : "Copy link"}
                  </button>
                </div>
              )}

              <div style={{ display: "flex", gap: 22, marginTop: 14, flexWrap: "wrap" }}>
                <Metric label="Clicks" value={p.clicks} />
                <Metric label="Unique" value={p.unique_visitors} />
                <Metric label="Engaged" value={p.engaged} />
                <Metric label="Assessment reach" value={p.assessment_reach} />
                <Metric label="Clicked to form" value={p.assessment_clicks} strong />
                {p.ctr_pct != null && <Metric label="CTR" value={p.ctr_pct + "%"} />}
                {p.boosted && <Metric label="Organic clicks" value={p.clicks_organic} />}
                {p.boosted && <Metric label="After boost" value={p.clicks_after_boost} />}
                {p.cost_per_assessment_click != null && <Metric label="Cost / form click" value={"$" + p.cost_per_assessment_click} strong />}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                <input style={Object.assign({}, input, { flex: 1, minWidth: 220 })} placeholder="LinkedIn permalink"
                  defaultValue={p.post_url || ""} onBlur={e => { if (e.target.value !== (p.post_url || "")) patch(p.id, { post_url: e.target.value }) }} />
                <input style={Object.assign({}, input, { width: 110 })} placeholder="Impressions" type="number"
                  defaultValue={p.impressions ?? ""} onBlur={e => { if (e.target.value !== String(p.impressions ?? "")) patch(p.id, { impressions: e.target.value }) }} />
                <input style={Object.assign({}, input, { width: 100 })} placeholder="Reactions" type="number"
                  defaultValue={p.reactions ?? ""} onBlur={e => { if (e.target.value !== String(p.reactions ?? "")) patch(p.id, { reactions: e.target.value }) }} />
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.textSecondary, cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={!!p.boosted} disabled={busy}
                    onChange={e => patch(p.id, { boosted: e.target.checked })} />
                  Boosted
                </label>
                {p.boosted && (
                  <input style={Object.assign({}, input, { width: 110 })} placeholder="Spend $" type="number" step="0.01"
                    defaultValue={p.boost_spend_usd ?? ""}
                    onBlur={e => { if (e.target.value !== String(p.boost_spend_usd ?? "")) patch(p.id, { boost_spend_usd: e.target.value }) }} />
                )}
              </div>
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: T.textSecondary, userSelect: "none" }}>
                  Copy &amp; transcript {(p.body || p.transcript) ? "" : "(empty)"}
                </summary>
                <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Post copy</div>
                    <textarea rows={6} defaultValue={p.body || ""} placeholder="The LinkedIn post copy, as published"
                      onBlur={e => { if (e.target.value !== (p.body || "")) patch(p.id, { body: e.target.value }) }}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid " + T.border,
                        fontSize: 13, fontFamily: "inherit", lineHeight: 1.5, color: T.textPrimary, resize: "vertical", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Transcript</div>
                    <textarea rows={8} defaultValue={p.transcript || ""} placeholder="Verbatim video/audio transcript"
                      onBlur={e => { if (e.target.value !== (p.transcript || "")) patch(p.id, { transcript: e.target.value }) }}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid " + T.border,
                        fontSize: 13, fontFamily: "inherit", lineHeight: 1.5, color: T.textPrimary, resize: "vertical", boxSizing: "border-box" }} />
                  </div>
                </div>
              </details>

              {p.boosted && (
                <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 8 }}>
                  Boost started {p.boost_started_at ? new Date(p.boost_started_at).toLocaleString() : "—"}. A boosted post keeps one link,
                  so paid and organic clicks share a tag — the split above is by time, not by source. Clicks before the boost began are organic.
                </div>
              )}
            </div>
          </section>
        )
      })}
      </>)}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.82)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 32, zIndex: 1000, cursor: "zoom-out" }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: 10, cursor: "default" }}>
            <img src={lightbox.url} alt={lightbox.title || ""}
              style={{ maxWidth: "90vw", maxHeight: "78vh", objectFit: "contain", borderRadius: 8, background: "white" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "white", fontSize: 12, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lightbox.title}</span>
              <button onClick={() => { removeGraphic(lightbox.postId); setLightbox(null) }}
                style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 6, border: "none", background: "rgba(220,38,38,0.92)",
                  color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                Remove from post
              </button>
              <button onClick={() => setLightbox(null)}
                style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", background: "transparent",
                  color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

const modalInp = { padding: "8px 10px", borderRadius: 7, border: "1px solid " + T.border, fontSize: 13, fontFamily: "inherit", color: T.textPrimary, background: "white", width: "100%", boxSizing: "border-box" }
function todayInput() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
function NewPostModal({ date, onClose, onCreated }) {
  const [title, setTitle] = useState("")
  const [format, setFormat] = useState("video")
  const [destination, setDestination] = useState("assessment")
  const [shortLabel, setShortLabel] = useState("")
  const [theme, setTheme] = useState("")
  const [schedFor, setSchedFor] = useState(date || "")
  const [schedOn, setSchedOn] = useState(todayInput())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  async function create() {
    if (!title.trim()) { setErr("A title or hook is required"); return }
    setBusy(true); setErr(null)
    try {
      const r = await fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title, format: format, destination: destination,
          status: schedFor ? "scheduled" : "unscheduled",
          short_label: shortLabel, theme: theme,
          scheduled_for: schedFor ? new Date(schedFor + "T09:00").toISOString() : null,
          scheduled_on: schedOn ? new Date(schedOn + "T00:00").toISOString() : null }) })
      const d = await r.json()
      if (d.error) { setErr(d.error); setBusy(false); return }
      onCreated()
    } catch (e) { setErr(String(e)); setBusy(false) }
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1000 }}>
      <div onClick={function(e){ e.stopPropagation() }} style={{ background: "white", borderRadius: 12, padding: 22, width: 420, maxWidth: "92vw", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>New post{date ? " \u00b7 " + new Date(date + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : ""}</div>
        {err && <div style={{ color: T.danger, fontSize: 12, marginBottom: 10 }}>\u26a0 {err}</div>}
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={dateLbl}>Scheduled for</span><input type="date" style={modalInp} value={schedFor} onChange={function(e){ setSchedFor(e.target.value) }} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={dateLbl}>Scheduled on</span><input type="date" style={modalInp} value={schedOn} onChange={function(e){ setSchedOn(e.target.value) }} /></label>
          <input style={modalInp} placeholder="Title or hook" value={title} onChange={function(e){ setTitle(e.target.value) }} autoFocus />
          <input style={modalInp} placeholder="Short label (shown on calendar)" value={shortLabel} onChange={function(e){ setShortLabel(e.target.value) }} />
          <input style={modalInp} placeholder="Theme / purpose (optional)" value={theme} onChange={function(e){ setTheme(e.target.value) }} />
          <select style={modalInp} value={format} onChange={function(e){ setFormat(e.target.value) }}>{FORMATS.map(function(fo){ return <option key={fo} value={fo}>{fo}</option> })}</select>
          <select style={modalInp} value={destination} onChange={function(e){ setDestination(e.target.value) }}>{DESTINATIONS.map(function(dd){ return <option key={dd.v} value={dd.v}>{dd.label}</option> })}</select>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 7, border: "1px solid " + T.border, background: "white", color: T.textSecondary, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button disabled={busy} onClick={create} style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: T.accent, color: "white", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>{busy ? "Creating\u2026" : "Create post"}</button>
        </div>
      </div>
    </div>
  )
}

const calNavBtn = { padding: "5px 11px", borderRadius: 7, border: "1px solid " + T.border, background: "white", color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }
const calActiveBtn = { background: T.accent, color: "white", borderColor: T.accent }

const calInp = { width: "100%", boxSizing: "border-box", border: "1px solid " + T.border, borderRadius: 4, padding: "2px 4px", fontSize: 10.5, fontFamily: "inherit", color: T.textPrimary, background: "white", minWidth: 0 }

function CalCard({ p, onPatch, onEdit }) {
  var ring = p.status === "posted" ? "#15803d" : p.status === "scheduled" ? "#b45309" : "#94a3b8"
  var bg = p.status === "posted" ? "rgba(21,128,61,0.06)" : p.status === "scheduled" ? "rgba(180,83,9,0.05)" : "rgba(148,163,184,0.08)"
  return (
    <div onClick={function(e){ e.stopPropagation() }} style={{ border: "2px solid " + ring, borderRadius: 6, background: bg, padding: 5, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: ring }}>#{p.control_number != null ? p.control_number : "?"}</span>
        <select value={p.format} onChange={function(e){ onPatch(p.id, { format: e.target.value }) }} style={{ fontSize: 9.5, border: "none", background: "transparent", color: T.textTertiary, fontFamily: "inherit", cursor: "pointer", padding: 0, maxWidth: 70 }}>
          {FORMATS.map(function(fo){ return <option key={fo} value={fo}>{fo}</option> })}
        </select>
        <button onClick={function(){ onEdit(p) }} title="Full edit" style={{ marginLeft: "auto", background: "none", border: "none", color: T.textTertiary, cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>{"\u270e"}</button>
      </div>
      <input defaultValue={p.short_label || ""} placeholder="short label" title={p.title || ""}
        onBlur={function(e){ if (e.target.value !== (p.short_label || "")) onPatch(p.id, { short_label: e.target.value }) }}
        style={Object.assign({}, calInp, { fontWeight: 600 })} />
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        <input defaultValue={p.post_url || ""} placeholder="url" onBlur={function(e){ if (e.target.value !== (p.post_url || "")) onPatch(p.id, { post_url: e.target.value }) }} style={calInp} />
        {p.post_url ? <a href={p.post_url} target="_blank" rel="noreferrer" title="Open post" style={{ fontSize: 12, textDecoration: "none", color: "#0a66c2", flexShrink: 0 }}>{"\u2197"}</a> : null}
      </div>
      <input defaultValue={p.theme || ""} placeholder="theme / purpose" onBlur={function(e){ if (e.target.value !== (p.theme || "")) onPatch(p.id, { theme: e.target.value }) }} style={calInp} />
    </div>
  )
}

function UnscheduledTray({ posts, onPatch, onEdit }) {
  var list = posts.filter(function(p){ return p.status === "unscheduled" || (!p.scheduled_for && !p.published_at) })
  return (
    <div style={{ background: T.bg, border: "1px dashed " + T.border, borderRadius: 10, padding: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Unscheduled {list.length ? "\u00b7 " + list.length : ""}</div>
      {list.length === 0 ? (
        <div style={{ fontSize: 12, color: T.textTertiary }}>Nothing unscheduled. Posts with no date land here \u2014 open one and give it a date to schedule it.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
          {list.map(function(p){ return <CalCard key={p.id} p={p} onPatch={onPatch} onEdit={onEdit} /> })}
        </div>
      )}
    </div>
  )
}

function FullEditModal({ post, onClose, onPatch }) {
  var p = post
  function set(k, v) { onPatch(p.id, { [k]: v }) }
  var lbl = { fontSize: 10, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, marginBottom: 3, display: "block" }
  var fld = { width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 7, border: "1px solid " + T.border, fontSize: 13, fontFamily: "inherit", color: T.textPrimary, background: "white" }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1100 }}>
      <div onClick={function(e){ e.stopPropagation() }} style={{ background: "white", borderRadius: 12, padding: 22, width: 560, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>#{p.control_number}</span>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Edit post</div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 20, color: T.textTertiary, cursor: "pointer", lineHeight: 1 }}>{"\u00d7"}</button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div><label style={lbl}>Full title</label><input style={fld} defaultValue={p.title || ""} onBlur={function(e){ if (e.target.value.trim() && e.target.value !== p.title) set("title", e.target.value) }} /></div>
          <div><label style={lbl}>Short label (shown on calendar)</label><input style={fld} defaultValue={p.short_label || ""} onBlur={function(e){ if (e.target.value !== (p.short_label || "")) set("short_label", e.target.value) }} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={lbl}>Format</label><select style={fld} defaultValue={p.format} onChange={function(e){ set("format", e.target.value) }}>{FORMATS.map(function(fo){ return <option key={fo} value={fo}>{fo}</option> })}</select></div>
            <div><label style={lbl}>Status</label><select style={fld} defaultValue={p.status} onChange={function(e){ set("status", e.target.value) }}>{["unscheduled","scheduled","posted"].map(function(st){ return <option key={st} value={st}>{st}</option> })}</select></div>
          </div>
          <div><label style={lbl}>Destination</label><select style={fld} defaultValue={p.destination} onChange={function(e){ set("destination", e.target.value) }}>{DESTINATIONS.map(function(dd){ return <option key={dd.v} value={dd.v}>{dd.label}</option> })}</select></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><label style={lbl}>Scheduled on</label><input type="date" style={fld} defaultValue={toDateInput(p.scheduled_on)} onBlur={function(e){ if (e.target.value !== toDateInput(p.scheduled_on)) set("scheduled_on", fromDate(e.target.value)) }} /></div>
            <div><label style={lbl}>Scheduled for</label><input type="datetime-local" style={fld} defaultValue={toDTInput(p.scheduled_for)} onBlur={function(e){ if (e.target.value !== toDTInput(p.scheduled_for)) set("scheduled_for", fromDT(e.target.value)) }} /></div>
            <div><label style={lbl}>Published</label><input type="datetime-local" style={fld} defaultValue={toDTInput(p.published_at)} onBlur={function(e){ if (e.target.value !== toDTInput(p.published_at)) set("published_at", fromDT(e.target.value)) }} /></div>
          </div>
          <div><label style={lbl}>Theme / purpose</label><input style={fld} defaultValue={p.theme || ""} onBlur={function(e){ if (e.target.value !== (p.theme || "")) set("theme", e.target.value) }} /></div>
          <div><label style={lbl}>Post URL</label><input style={fld} defaultValue={p.post_url || ""} onBlur={function(e){ if (e.target.value !== (p.post_url || "")) set("post_url", e.target.value) }} /></div>
          <div><label style={lbl}>Post copy</label><textarea rows={4} style={Object.assign({}, fld, { lineHeight: 1.5, resize: "vertical" })} defaultValue={p.body || ""} onBlur={function(e){ if (e.target.value !== (p.body || "")) set("body", e.target.value) }} /></div>
          <div><label style={lbl}>Transcript</label><textarea rows={5} style={Object.assign({}, fld, { lineHeight: 1.5, resize: "vertical" })} defaultValue={p.transcript || ""} onBlur={function(e){ if (e.target.value !== (p.transcript || "")) set("transcript", e.target.value) }} /></div>
        </div>
        <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 14 }}>Changes save as you leave each field. Metrics and the graphic image are managed in List view.</div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: T.accent, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
        </div>
      </div>
    </div>
  )
}

function ContentCalendar({ posts, onPickDate, onPatch, onEdit }) {
  const [mode, setMode] = useState("month")
  const [cursor, setCursor] = useState(function(){ var d = new Date(); d.setHours(0,0,0,0); return d })
  function dateFor(p) { return p.published_at || p.scheduled_for || null }
  function keyOf(d) { return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0") }
  function keyOfIso(iso) { if (!iso) return null; return keyOf(new Date(iso)) }
  function mondayOf(d) { var x = new Date(d); var wd = x.getDay(); x.setDate(x.getDate() + (wd === 0 ? -6 : 1 - wd)); x.setHours(0,0,0,0); return x }
  var byDay = {}
  posts.forEach(function(p){ var k = keyOfIso(dateFor(p)); if (k) { (byDay[k] = byDay[k] || []).push(p) } })
  var days = []
  if (mode === "week") {
    var m0 = mondayOf(cursor)
    for (var i = 0; i < 5; i++) { var d = new Date(m0); d.setDate(m0.getDate() + i); days.push(d) }
  } else {
    var first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    var last = new Date(cursor.getFullYear(), cursor.getMonth()+1, 0)
    var wk = mondayOf(first)
    while (wk <= last) {
      for (var j = 0; j < 5; j++) { var dd = new Date(wk); dd.setDate(wk.getDate() + j); days.push(dd) }
      wk = new Date(wk); wk.setDate(wk.getDate() + 7)
    }
  }
  var todayKey = keyOf(new Date())
  function shift(dir) { var d = new Date(cursor); if (mode === "week") { d.setDate(d.getDate() + 7*dir) } else { d.setMonth(d.getMonth() + dir) } setCursor(d) }
  var label = mode === "week"
    ? (days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " \u2013 " + days[4].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))
    : cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  var WD = ["Mon","Tue","Wed","Thu","Fri"]
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={function(){ shift(-1) }} style={calNavBtn}>{"\u2039"}</button>
        <button onClick={function(){ var d = new Date(); d.setHours(0,0,0,0); setCursor(d) }} style={calNavBtn}>Today</button>
        <button onClick={function(){ shift(1) }} style={calNavBtn}>{"\u203a"}</button>
        <strong style={{ fontSize: 15, marginLeft: 6 }}>{label}</strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={function(){ setMode("month") }} style={Object.assign({}, calNavBtn, mode === "month" ? calActiveBtn : {})}>Month</button>
          <button onClick={function(){ setMode("week") }} style={Object.assign({}, calNavBtn, mode === "week" ? calActiveBtn : {})}>Week</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6, marginBottom: 6 }}>
        {WD.map(function(w){ return <div key={w} style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textAlign: "center" }}>{w}</div> })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
        {days.map(function(d, i){
          var k = keyOf(d)
          var inMonth = mode === "week" || d.getMonth() === cursor.getMonth()
          var list = byDay[k] || []
          return (
            <div key={i} onClick={function(){ onPickDate(k) }} style={{ minHeight: mode === "week" ? 260 : 128, minWidth: 0, background: inMonth ? T.cardBg : T.bg, border: "1px solid " + T.border, borderRadius: 8, padding: 6, opacity: inMonth ? 1 : 0.5, cursor: "pointer" }}>
              <div style={{ fontSize: 11, fontWeight: k === todayKey ? 700 : 500, color: k === todayKey ? T.accent : T.textTertiary, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                <span>{d.getDate()}</span>
                {k === todayKey ? <span style={{ fontSize: 9, color: T.accent }}>today</span> : null}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {list.map(function(p){ return <CalCard key={p.id} p={p} onPatch={onPatch} onEdit={onEdit} /> })}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid #15803d", borderRadius: 3, marginRight: 5, verticalAlign: "middle" }} />posted</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid #b45309", borderRadius: 3, marginRight: 5, verticalAlign: "middle" }} />scheduled</span>
        <span style={{ marginLeft: "auto" }}>Click an empty day to add a post. Edit fields inline; the pencil opens full edit.</span>
      </div>
    </div>
  )
}

function Metric({ label, value, strong }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 600, color: strong ? T.success : T.textPrimary, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
    </div>
  )
}
