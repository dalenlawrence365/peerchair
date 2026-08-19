"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { T, FONT_SERIF } from "@/lib/pipelineTheme"
import { FORMATS, DESTINATIONS, DEST_PILL, STAGES, STAGE_BY_VALUE, STATUS_COLOR } from "@/lib/contentMeta"

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
  const router = useRouter()
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(null)
  const [uploading, setUploading] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [view, setView] = useState("calendar")
  const [lastDeleted, setLastDeleted] = useState(null)

  function openPost(p) { router.push("/content/post/" + p.id) }

  async function load() {
    setError(null)
    try {
      const r = await fetch("/api/content")
      const d = await r.json()
      if (d.error) { setError(d.error); return null }
      setPosts(d.posts); return d.posts
    } catch (e) { setError(String(e)); return null }
  }
  useEffect(function () { load() }, [])
  useEffect(function () { if (!lastDeleted) return; var t = setTimeout(function () { setLastDeleted(null) }, 12000); return function () { clearTimeout(t) } }, [lastDeleted])

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

  // Clicking a calendar day now creates a post for that date and opens it in the
  // full edit form (one form for create + edit). Accidental clicks can be removed
  // with the Delete button in that form.
  async function createForDate(k) {
    setBusy(true); setError(null)
    try {
      const r = await fetch("/api/content", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", format: "video", status: "scheduled",
          scheduled_for: new Date(k + "T09:00").toISOString(),
          scheduled_on: new Date(todayInput() + "T00:00").toISOString() })
      })
      const d = await r.json()
      if (d.error) { setError(d.error); setBusy(false); return }
      setBusy(false)
      router.push("/content/post/" + d.id)
    } catch (e) { setError(String(e)); setBusy(false) }
  }

  async function deletePost(id) {
    setBusy(true); setError(null)
    var gone = (posts || []).find(function (p) { return p.id === id }) || { id: id }
    try {
      const r = await fetch("/api/content?id=" + encodeURIComponent(id), { method: "DELETE" })
      const d = await r.json()
      if (d.error) { setError(d.error); setBusy(false); return }
      setLastDeleted(gone); await load()
    } catch (e) { setError(String(e)) }
    setBusy(false)
  }

  async function restorePost(id) {
    setLastDeleted(null)
    await patch(id, { deleted_at: null })
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
        <Link href="/content/post/new" style={{ fontSize: 13, fontWeight: 600, color: "white", background: T.accent, textDecoration: "none", padding: "9px 16px", borderRadius: 8, whiteSpace: "nowrap" }}>+ Start a post</Link>
      </div>
      <p style={{ fontSize: 13, color: T.textSecondary, margin: "6px 0 0", maxWidth: 660 }}>
        Every LinkedIn post, what it linked to, and what it drove. Posts with a destination get a tracking
        link generated automatically — use that link in the post and the traffic ties back here.
      </p>

      {error && <div style={{ color: T.danger, marginTop: 16 }}>⚠ {error}</div>}

      <div style={{ display: "flex", gap: 6, margin: "24px 0 8px" }}>
        <button onClick={function(){ setView("calendar") }} style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid " + T.border, background: view === "calendar" ? T.accent : "white", color: view === "calendar" ? "white" : T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Calendar</button>
        <button onClick={function(){ setView("list") }} style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid " + T.border, background: view === "list" ? T.accent : "white", color: view === "list" ? "white" : T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>List</button>
      </div>

      {view === "calendar" && (<>
        <UnscheduledTray posts={posts || []} onPatch={patch} onEdit={openPost} onDelete={deletePost} />
        <ContentCalendar posts={posts || []} onPickDate={function(k){ createForDate(k) }} onPatch={patch} onEdit={openPost} onDelete={deletePost} />
      </>)}


      {lastDeleted && (
        <div style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", background: "#0f172a", color: "white", padding: "11px 16px", borderRadius: 10, display: "flex", alignItems: "center", gap: 16, zIndex: 1300, boxShadow: "0 8px 30px rgba(0,0,0,0.35)" }}>
          <span style={{ fontSize: 13 }}>Deleted {"\u201c" + (lastDeleted.short_label || lastDeleted.title || "post") + "\u201d"}</span>
          <button onClick={function(){ restorePost(lastDeleted.id) }} style={{ padding: "5px 14px", borderRadius: 7, border: "none", background: "white", color: "#0f172a", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Undo</button>
          <button onClick={function(){ setLastDeleted(null) }} title="Dismiss" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 0 }}>{"\u00d7"}</button>
        </div>
      )}

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
                <select value={p.status} disabled={busy} title="Production stage"
                  onChange={e => patch(p.id, { status: e.target.value })}
                  style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "2px 8px", fontFamily: "inherit", cursor: "pointer",
                    color: (STATUS_COLOR[p.status] || STATUS_COLOR.draft).fg,
                    background: (STATUS_COLOR[p.status] || STATUS_COLOR.draft).bg,
                    border: "1px solid " + (STATUS_COLOR[p.status] || STATUS_COLOR.draft).fg + "55" }}>
                  {STAGES.map(function(st){ return <option key={st.v} value={st.v} style={{ color: "#111827" }}>{st.label}</option> })}
                </select>
                <button onClick={function(){ openPost(p) }} style={{ fontSize: 11, fontWeight: 600, color: T.accent, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>Open →</button>
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

function todayInput() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const calNavBtn = { padding: "5px 11px", borderRadius: 7, border: "1px solid " + T.border, background: "white", color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }
const calActiveBtn = { background: T.accent, color: "white", borderColor: T.accent }

const calInp = { width: "100%", boxSizing: "border-box", border: "1px solid " + T.border, borderRadius: 4, padding: "2px 4px", fontSize: 10.5, fontFamily: "inherit", color: T.textPrimary, background: "white", minWidth: 0 }

function CalCard({ p, onPatch, onEdit, onDelete }) {
  const [zoom, setZoom] = useState(false)
  var stageColor = (STATUS_COLOR[p.status] || STATUS_COLOR.draft)
  var ring = stageColor.fg
  var bg = stageColor.bg.replace(/0\.1[34]\)/, "0.06)")
  return (
    <div onClick={function(e){ e.stopPropagation() }} style={{ border: "2px solid " + ring, borderRadius: 6, background: bg, padding: 5, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: ring }}>#{p.control_number != null ? p.control_number : "?"}</span>
        <select value={p.format} onChange={function(e){ onPatch(p.id, { format: e.target.value }) }} style={{ fontSize: 9.5, border: "none", background: "transparent", color: T.textTertiary, fontFamily: "inherit", cursor: "pointer", padding: 0, maxWidth: 70 }}>
          {FORMATS.map(function(fo){ return <option key={fo} value={fo}>{fo}</option> })}
        </select>
        {p.graphic_url ? <img src={p.graphic_url} alt="" title="Click to view full image" onClick={function(e){ e.stopPropagation(); setZoom(true) }} style={{ width: 14, height: 14, borderRadius: 3, objectFit: "cover", marginLeft: "auto", cursor: "zoom-in" }} /> : null}
        <button onClick={function(){ onEdit(p) }} title="Full edit" style={{ marginLeft: p.graphic_url ? 4 : "auto", background: "none", border: "none", color: T.textTertiary, cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>{"\u270e"}</button>
        {onDelete ? <button onClick={function(e){ e.stopPropagation(); onDelete(p.id) }} title="Delete post" style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>{"\u00d7"}</button> : null}
      </div>
      <input defaultValue={p.short_label || ""} placeholder="short label" title={p.title || ""}
        onBlur={function(e){ if (e.target.value !== (p.short_label || "")) onPatch(p.id, { short_label: e.target.value }) }}
        style={Object.assign({}, calInp, { fontWeight: 600 })} />
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        <input defaultValue={p.post_url || ""} placeholder="url" onBlur={function(e){ if (e.target.value !== (p.post_url || "")) onPatch(p.id, { post_url: e.target.value }) }} style={calInp} />
        {p.post_url ? <a href={p.post_url} target="_blank" rel="noreferrer" title="Open post" style={{ fontSize: 12, textDecoration: "none", color: "#0a66c2", flexShrink: 0 }}>{"\u2197"}</a> : null}
      </div>
      <input defaultValue={p.theme || ""} placeholder="theme / purpose" onBlur={function(e){ if (e.target.value !== (p.theme || "")) onPatch(p.id, { theme: e.target.value }) }} style={calInp} />
      {zoom && p.graphic_url ? (
        <div onClick={function(e){ e.stopPropagation(); setZoom(false) }} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1200, cursor: "zoom-out" }}>
          <div onClick={function(e){ e.stopPropagation() }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, maxWidth: "92vw", maxHeight: "92vh" }}>
            <img src={p.graphic_url} alt={p.short_label || p.title || ""} style={{ maxWidth: "92vw", maxHeight: "82vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 10px 40px rgba(0,0,0,0.4)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "white", fontSize: 12, opacity: 0.85 }}>{("#" + (p.control_number != null ? p.control_number : "?")) + (p.short_label ? "  ·  " + p.short_label : "")}</span>
              <button onClick={function(e){ e.stopPropagation(); setZoom(false) }} style={{ padding: "5px 14px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.4)", background: "transparent", color: "white", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// Production tray — everything with no firm date yet, grouped by stage so it
// reads like the old Scripts board (draft -> ready to shoot -> shot -> edited),
// except it's the same post record all the way through, not a separate object.
var TRAY_STAGES = ["draft", "ready_to_shoot", "shot", "edited"]
function UnscheduledTray({ posts, onPatch, onEdit, onDelete }) {
  var list = posts.filter(function(p){ return TRAY_STAGES.indexOf(p.status) !== -1 || (!p.scheduled_for && !p.published_at) })
  var byStage = {}
  list.forEach(function(p){ var k = TRAY_STAGES.indexOf(p.status) !== -1 ? p.status : "draft"; (byStage[k] = byStage[k] || []).push(p) })
  return (
    <div style={{ background: T.bg, border: "1px dashed " + T.border, borderRadius: 10, padding: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>In production {list.length ? "\u00b7 " + list.length : ""}</div>
      {list.length === 0 ? (
        <div style={{ fontSize: 12, color: T.textTertiary }}>Nothing in production. Posts with no date land here \u2014 give one a date to schedule it.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {TRAY_STAGES.filter(function(st){ return byStage[st] && byStage[st].length }).map(function(st){
            return (
              <div key={st}>
                <div style={{ fontSize: 10, fontWeight: 700, color: (STATUS_COLOR[st] || {}).fg, marginBottom: 5 }}>{(STAGE_BY_VALUE[st] || {}).label || st} \u00b7 {byStage[st].length}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
                  {byStage[st].map(function(p){ return <CalCard key={p.id} p={p} onPatch={onPatch} onEdit={onEdit} onDelete={onDelete} /> })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


function ContentCalendar({ posts, onPickDate, onPatch, onEdit, onDelete }) {
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
                {list.map(function(p){ return <CalCard key={p.id} p={p} onPatch={onPatch} onEdit={onEdit} onDelete={onDelete} /> })}
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
