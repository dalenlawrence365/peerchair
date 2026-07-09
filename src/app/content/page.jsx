"use client"
import { useEffect, useState } from "react"
import { T, FONT_SERIF } from "@/lib/pipelineTheme"

const FORMATS = ["video", "text", "carousel", "image", "poll", "article"]
const DESTINATIONS = [
  { v: "none", label: "No link (reach post)" },
  { v: "assessment", label: "Assessment" },
  { v: "overview", label: "Brochure" },
  { v: "meeting", label: "Meeting" },
]

const STATUS_COLOR = {
  draft:     { bg: "rgba(100,116,139,0.13)", fg: "#475569" },
  scheduled: { bg: "rgba(217,119,6,0.14)",   fg: "#b45309" },
  published: { bg: "rgba(22,163,74,0.14)",   fg: "#15803d" },
}

function Pill({ text, bg, fg }) {
  return <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: 999, fontSize: 9.5,
    fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3, background: bg, color: fg, whiteSpace: "nowrap" }}>{text}</span>
}

function fmtDate(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function ContentPage() {
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(null)

  const [title, setTitle] = useState("")
  const [format, setFormat] = useState("video")
  const [destination, setDestination] = useState("assessment")
  const [scheduledFor, setScheduledFor] = useState("")

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

  function copy(url, id) {
    navigator.clipboard.writeText(url)
    setCopied(id); setTimeout(function () { setCopied(null) }, 1600)
  }

  const input = {
    padding: "8px 10px", borderRadius: 7, border: "1px solid " + T.border,
    fontSize: 13, fontFamily: "inherit", color: T.textPrimary, background: "white", minWidth: 0,
  }

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 1100 }}>
      <h1 style={{ fontFamily: FONT_SERIF, fontSize: 30, fontWeight: 400, margin: 0, lineHeight: 1.1 }}>Content</h1>
      <p style={{ fontSize: 13, color: T.textSecondary, margin: "6px 0 0", maxWidth: 660 }}>
        Every LinkedIn post, what it linked to, and what it drove. Posts with a destination get a tracking
        link generated automatically — use that link in the post and the traffic ties back here.
      </p>

      {error && <div style={{ color: T.danger, marginTop: 16 }}>⚠ {error}</div>}

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

      {!posts && !error && <div style={{ color: T.textTertiary, marginTop: 20 }}>Loading…</div>}

      {posts && posts.length === 0 && (
        <div style={{ color: T.textTertiary, marginTop: 24, fontSize: 13 }}>No posts yet. Create one above.</div>
      )}

      {posts && posts.map(function (p) {
        const sc = STATUS_COLOR[p.status] || STATUS_COLOR.draft
        return (
          <section key={p.id} style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14, color: T.textPrimary }}>{p.title}</strong>
              <Pill text={p.status} bg={sc.bg} fg={sc.fg} />
              <Pill text={p.format} bg="rgba(59,130,246,0.12)" fg="#3b82f6" />
              {p.destination !== "none" && <Pill text={"→ " + p.destination} bg="rgba(168,85,247,0.14)" fg="#a855f7" />}
              <span style={{ marginLeft: "auto", fontSize: 11, color: T.textTertiary }}>
                {p.published_at ? "Published " + fmtDate(p.published_at) : p.scheduled_for ? "Scheduled " + fmtDate(p.scheduled_for) : "Draft"}
              </span>
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
              <Metric label="Assessment reach" value={p.assessment_reach} strong />
              {p.ctr_pct != null && <Metric label="CTR" value={p.ctr_pct + "%"} />}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              {p.status !== "published" && (
                <button onClick={() => patch(p.id, { status: "published" })} disabled={busy}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: T.success,
                    color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Mark published
                </button>
              )}
              <input style={Object.assign({}, input, { flex: 1, minWidth: 220 })} placeholder="LinkedIn permalink"
                defaultValue={p.post_url || ""} onBlur={e => { if (e.target.value !== (p.post_url || "")) patch(p.id, { post_url: e.target.value }) }} />
              <input style={Object.assign({}, input, { width: 110 })} placeholder="Impressions" type="number"
                defaultValue={p.impressions ?? ""} onBlur={e => { if (e.target.value !== String(p.impressions ?? "")) patch(p.id, { impressions: e.target.value }) }} />
              <input style={Object.assign({}, input, { width: 100 })} placeholder="Reactions" type="number"
                defaultValue={p.reactions ?? ""} onBlur={e => { if (e.target.value !== String(p.reactions ?? "")) patch(p.id, { reactions: e.target.value }) }} />
            </div>
          </section>
        )
      })}
    </main>
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
