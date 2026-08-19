"use client"
import { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { T, FONT_SERIF } from "@/lib/pipelineTheme"
import { FORMATS, DESTINATIONS, STAGES } from "@/lib/contentMeta"

// One real page for both "start a post" (id === "new") and editing an existing
// one — replaces the old edit popup, which could vanish with a stray click
// outside its box. Full width, real scroll, nothing to accidentally dismiss.
//
// Workflow this matches: write the script/idea first with no regard for
// scheduling (Draft), move it through Ready to shoot / Shot / Edited as you
// produce it, and only when you pick "Scheduled" do date fields even appear.
// "Posted" is the last, quiet step — the publish date and URL fields only show
// once you've actually flipped it to Posted, so you fill those in after the
// fact, not while you're still drafting.

function readDims(file) {
  return new Promise(function (resolve) {
    try {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = function () { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url) }
      img.onerror = function () { resolve({ w: null, h: null }); URL.revokeObjectURL(url) }
      img.src = url
    } catch (e) { resolve({ w: null, h: null }) }
  })
}
function toDateInput(iso) { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
function toDTInput(iso) { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
function fromDate(v) { return v ? new Date(v + "T00:00").toISOString() : null }
function fromDT(v) { return v ? new Date(v).toISOString() : null }

const lbl = { fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, marginBottom: 5, display: "block" }
const fld = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 14, fontFamily: "inherit", color: T.textPrimary, background: "white" }

export default function PostEditorPage() {
  const params = useParams()
  const router = useRouter()
  const rawId = params && params.id
  const isNew = rawId === "new"

  const [id, setId] = useState(isNew ? null : rawId)
  const [post, setPost] = useState(null)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const bodyRef = useRef(null)
  const [copiedBody, setCopiedBody] = useState(false)
  const scriptRef = useRef(null)
  const [copiedScript, setCopiedScript] = useState(false)

  const load = useCallback(function (theId) {
    fetch("/api/content", { cache: "no-store" }).then(function (r) { return r.json() }).then(function (d) {
      if (d.error) { setError(d.error); return }
      const found = (d.posts || []).find(function (p) { return p.id === theId })
      if (found) setPost(found); else setError("Post not found.")
    }).catch(function (e) { setError(String(e)) })
  }, [])

  // "new": create a blank draft immediately, then swap the URL to its real id
  // so a refresh or the back button never creates a second one.
  useEffect(function () {
    if (!isNew) return
    fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", format: "video", status: "draft" }) })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.error) { setError(d.error); return }
        setId(d.id)
        router.replace("/content/post/" + d.id)
        load(d.id)
      }).catch(function (e) { setError(String(e)) })
  }, [isNew])

  useEffect(function () { if (!isNew && id) load(id) }, [isNew, id])

  function set(k, v) {
    if (!id) return
    setSaved(false)
    fetch("/api/content", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ id: id }, (function () { var o = {}; o[k] = v; return o })())) })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.error) { setError(d.error); return }
        setSaved(true); setTimeout(function () { setSaved(false) }, 1400)
        load(id)
      }).catch(function (e) { setError(String(e)) })
  }

  function uploadGraphic(file) {
    if (!id) return
    setUploading(true); setError(null)
    readDims(file).then(function (dims) {
      const fd = new FormData()
      fd.append("file", file); fd.append("post_id", id)
      if (dims.w) fd.append("width", String(dims.w))
      if (dims.h) fd.append("height", String(dims.h))
      return fetch("/api/content/media", { method: "POST", body: fd })
    }).then(function (r) { return r.json() }).then(function (d) {
      if (d.error) setError(d.error); else load(id)
    }).catch(function (e) { setError(String(e)) }).finally(function () { setUploading(false) })
  }
  function removeGraphic() { set("graphic_asset_id", null) }

  function deletePost() {
    if (!id) return
    if (typeof window !== "undefined" && !window.confirm("Delete this post? You'll get an Undo on the Content page right after.")) return
    fetch("/api/content?id=" + encodeURIComponent(id), { method: "DELETE" })
      .then(function (r) { return r.json() })
      .then(function (d) { if (d.error) { setError(d.error); return } router.push("/content") })
      .catch(function (e) { setError(String(e)) })
  }

  function copyBody() {
    var v = bodyRef.current ? bodyRef.current.value : ((post && post.body) || "")
    try { navigator.clipboard.writeText(v || "") } catch (e) {}
    setCopiedBody(true); setTimeout(function () { setCopiedBody(false) }, 1500)
  }

  function copyScript() {
    var v = scriptRef.current ? scriptRef.current.value : ((post && post.transcript) || "")
    try { navigator.clipboard.writeText(v || "") } catch (e) {}
    setCopiedScript(true); setTimeout(function () { setCopiedScript(false) }, 1500)
  }

  if (error) {
    return (
      <main style={{ padding: "26px 32px 80px", maxWidth: 900 }}>
        <Link href="/content" style={{ fontSize: 13, color: T.accent, textDecoration: "none" }}>← Back to Content</Link>
        <div style={{ color: T.danger, marginTop: 16 }}>⚠ {error}</div>
      </main>
    )
  }
  if (!post) {
    return (
      <main style={{ padding: "26px 32px 80px", maxWidth: 900 }}>
        <div style={{ color: T.textTertiary }}>{isNew ? "Starting a new post…" : "Loading…"}</div>
      </main>
    )
  }

  const p = post
  const st = p.status
  const showScheduleFields = st === "scheduled"
  const showPostedFields = st === "posted"
  const showScript = p.format === "video"

  return (
    <main style={{ padding: "26px 32px 100px", maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <Link href="/content" style={{ fontSize: 13, color: T.accent, textDecoration: "none", fontWeight: 600 }}>← Back to Content</Link>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary }}>#{p.control_number != null ? p.control_number : "?"}</span>
        {saved ? <span style={{ fontSize: 12, color: "#15803d" }}>Saved</span> : null}
        <button onClick={deletePost} style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600, color: "#b91c1c", background: "transparent", border: "1px solid " + T.border, borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" }}>Delete post</button>
      </div>
      <h1 style={{ fontFamily: FONT_SERIF, fontSize: 26, fontWeight: 400, margin: "4px 0 20px" }}>{isNew ? "Start a post" : "Edit post"}</h1>

      {/* Production stage — big, first thing you see. Dates and the posted URL
          only appear once the stage actually calls for them. */}
      <div style={{ marginBottom: 22 }}>
        <label style={lbl}>Status</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STAGES.map(function (stg) {
            var active = st === stg.v
            return (
              <button key={stg.v} type="button" onClick={function () { set("status", stg.v) }}
                style={{ padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  border: "1px solid " + (active ? stg.fg : T.border), background: active ? stg.fg : "white", color: active ? "white" : T.textSecondary }}>
                {stg.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        <div>
          <label style={lbl}>Full title</label>
          <input style={Object.assign({}, fld, { fontSize: 17 })} defaultValue={p.title === "Untitled post" ? "" : (p.title || "")} placeholder="Title or hook"
            onBlur={function (e) { var v = e.target.value.trim(); if (v && v !== p.title) set("title", v) }} />
        </div>

        <div>
          <label style={lbl}>Short label <span style={{ textTransform: "none", fontWeight: 400 }}>(shown on the calendar)</span></label>
          <input style={fld} defaultValue={p.short_label || ""} onBlur={function (e) { if (e.target.value !== (p.short_label || "")) set("short_label", e.target.value) }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={lbl}>Format</label>
            <select style={fld} defaultValue={p.format} onChange={function (e) { set("format", e.target.value) }}>
              {FORMATS.map(function (fo) { return <option key={fo} value={fo}>{fo}</option> })}
            </select>
          </div>
          <div>
            <label style={lbl}>Destination</label>
            <select style={fld} defaultValue={p.destination} onChange={function (e) { set("destination", e.target.value) }}>
              {DESTINATIONS.map(function (dd) { return <option key={dd.v} value={dd.v}>{dd.label}</option> })}
            </select>
          </div>
        </div>

        <div>
          <label style={lbl}>Image</label>
          {p.graphic_url ? (
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <img src={p.graphic_url} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid " + T.border }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "7px 14px", border: "1px solid " + T.border, borderRadius: 7, cursor: "pointer", fontSize: 12.5, color: T.textSecondary }}>
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={function (e) { var fl = e.target.files && e.target.files[0]; if (fl) uploadGraphic(fl); e.target.value = "" }} />
                  {uploading ? "Uploading…" : "Replace"}
                </label>
                <button onClick={removeGraphic} style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid " + T.border, background: "white", color: "#b91c1c", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Remove image</button>
              </div>
            </div>
          ) : (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 18px", border: "1px dashed " + T.border, borderRadius: 8, cursor: "pointer", fontSize: 13.5, color: T.textSecondary }}>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={function (e) { var fl = e.target.files && e.target.files[0]; if (fl) uploadGraphic(fl); e.target.value = "" }} />
              {uploading ? "Uploading…" : "+ Attach image"}
            </label>
          )}
        </div>

        {showScheduleFields ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: 10, padding: 14 }}>
            <div><label style={lbl}>Scheduled on</label><input type="date" style={fld} defaultValue={toDateInput(p.scheduled_on)} onBlur={function (e) { if (e.target.value !== toDateInput(p.scheduled_on)) set("scheduled_on", fromDate(e.target.value)) }} /></div>
            <div><label style={lbl}>Scheduled for</label><input type="datetime-local" style={fld} defaultValue={toDTInput(p.scheduled_for)} onBlur={function (e) { if (e.target.value !== toDTInput(p.scheduled_for)) set("scheduled_for", fromDT(e.target.value)) }} /></div>
          </div>
        ) : null}

        {showPostedFields ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.25)", borderRadius: 10, padding: 14 }}>
            <div><label style={lbl}>Published</label><input type="datetime-local" style={fld} defaultValue={toDTInput(p.published_at)} onBlur={function (e) { if (e.target.value !== toDTInput(p.published_at)) set("published_at", fromDT(e.target.value)) }} /></div>
            <div><label style={lbl}>Post URL</label><input style={fld} defaultValue={p.post_url || ""} onBlur={function (e) { if (e.target.value !== (p.post_url || "")) set("post_url", e.target.value) }} /></div>
          </div>
        ) : null}

        <div>
          <label style={lbl}>Theme / purpose</label>
          <input style={fld} defaultValue={p.theme || ""} onBlur={function (e) { if (e.target.value !== (p.theme || "")) set("theme", e.target.value) }} />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 5 }}>
            <label style={Object.assign({}, lbl, { marginBottom: 0 })}>Post copy</label>
            <button type="button" onClick={copyBody} title="Copy the full post copy to paste into LinkedIn" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 6, border: "1px solid " + (copiedBody ? "#15803d" : T.border), background: copiedBody ? "#dcfce7" : "white", color: copiedBody ? "#15803d" : T.textSecondary, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{copiedBody ? "✓ Copied" : "⎘ Copy all"}</button>
          </div>
          <textarea ref={bodyRef} rows={7} style={Object.assign({}, fld, { lineHeight: 1.55, resize: "vertical" })} defaultValue={p.body || ""} onBlur={function (e) { if (e.target.value !== (p.body || "")) set("body", e.target.value) }} />
        </div>

        {showScript ? (
          <div>
            <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 5 }}>
              <label style={Object.assign({}, lbl, { marginBottom: 0 })}>Script</label>
              <button type="button" onClick={copyScript} title="Copy the script to paste into your teleprompter" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 6, border: "1px solid " + (copiedScript ? "#15803d" : T.border), background: copiedScript ? "#dcfce7" : "white", color: copiedScript ? "#15803d" : T.textSecondary, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{copiedScript ? "✓ Copied" : "⎘ Copy all"}</button>
            </div>
            <textarea ref={scriptRef} rows={12} style={Object.assign({}, fld, { lineHeight: 1.55, resize: "vertical" })} defaultValue={p.transcript || ""} placeholder="Write the script here as you go — no date required."
              onBlur={function (e) { if (e.target.value !== (p.transcript || "")) set("transcript", e.target.value) }} />
          </div>
        ) : null}
      </div>

      <div style={{ fontSize: 11.5, color: T.textTertiary, marginTop: 20 }}>Everything saves as you leave each field. Metrics (impressions, reactions, boost) are still managed in List view.</div>
    </main>
  )
}
