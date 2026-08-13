"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T, FONT_SERIF } from "@/lib/pipelineTheme"

const STAGES = ["draft", "ready_to_shoot", "shot", "edited", "posted"]
const STAGE_LABEL = { draft: "Draft", ready_to_shoot: "Ready to shoot", shot: "Shot", edited: "Edited", posted: "Posted" }
const STAGE_COLOR = {
  draft: { fg: "#6b7280", bg: "rgba(107,114,128,0.12)" },
  ready_to_shoot: { fg: "#b45309", bg: "rgba(180,83,9,0.12)" },
  shot: { fg: "#7c3aed", bg: "rgba(124,58,237,0.12)" },
  edited: { fg: "#0a66c2", bg: "rgba(10,102,194,0.12)" },
  posted: { fg: "#15803d", bg: "rgba(21,128,61,0.12)" },
}
function fmtDate(v) { if (!v) return ""; try { return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) } catch (e) { return v } }

export default function ScriptsPage() {
  const [scripts, setScripts] = useState([])
  const [posts, setPosts] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState("")
  const [text, setText] = useState("")

  async function load() {
    setError(null)
    try {
      const [s, c] = await Promise.all([
        fetch("/api/scripts").then(r => r.json()),
        fetch("/api/content").then(r => r.json()),
      ])
      if (s.error) setError(s.error); else setScripts(s.scripts || [])
      if (!c.error) setPosts(c.posts || [])
    } catch (e) { setError(String(e)) }
  }
  useEffect(function () { load() }, [])

  async function add() {
    if (!title.trim()) { setError("A title or hook is required"); return }
    setBusy(true); setError(null)
    try {
      const r = await fetch("/api/scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, script_text: text }) })
      const d = await r.json()
      if (d.error) setError(d.error); else { setTitle(""); setText(""); await load() }
    } catch (e) { setError(String(e)) }
    setBusy(false)
  }
  async function patch(id, body) {
    setBusy(true); setError(null)
    try {
      const r = await fetch("/api/scripts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ id }, body)) })
      const d = await r.json(); if (d.error) setError(d.error); else await load()
    } catch (e) { setError(String(e)) }
    setBusy(false)
  }
  async function del(id) {
    if (!confirm("Delete this script? This can't be undone.")) return
    setBusy(true)
    try { await fetch("/api/scripts?id=" + id, { method: "DELETE" }); await load() } catch (e) { setError(String(e)) }
    setBusy(false)
  }

  const input = { padding: "8px 10px", borderRadius: 7, border: "1px solid " + T.border, fontSize: 13, fontFamily: "inherit", color: T.textPrimary, background: "white", minWidth: 0 }

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <h1 style={{ fontFamily: FONT_SERIF, fontSize: 30, fontWeight: 400, margin: 0, lineHeight: 1.1 }}>Scripts</h1>
        <Link href="/content" style={{ fontSize: 13, color: T.accent, textDecoration: "none" }}>← Content / posts</Link>
      </div>
      <p style={{ fontSize: 13, color: T.textSecondary, margin: "6px 0 0", maxWidth: 680 }}>
        Your script library. Deposit one at a time, move it through production, and link it to the post it becomes.
        The full history is readable by an AI at <code>/api/scripts</code> so you can check you&rsquo;re not repeating yourself.
      </p>

      {error && <div style={{ color: T.danger, marginTop: 16 }}>⚠ {error}</div>}

      <section style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 18, marginTop: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px" }}>New script</h2>
        <input style={Object.assign({}, input, { width: "100%", boxSizing: "border-box", marginBottom: 10 })} placeholder="Title or hook" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea rows={6} placeholder="Paste or write your script here…" value={text} onChange={e => setText(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13.5, fontFamily: "inherit", lineHeight: 1.55, color: T.textPrimary, resize: "vertical" }} />
        <div style={{ marginTop: 10 }}>
          <button onClick={add} disabled={busy} style={{ padding: "9px 18px", borderRadius: 7, border: "none", background: T.accent, color: "white", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>Add script</button>
        </div>
      </section>

      <div style={{ fontSize: 12, color: T.textTertiary, margin: "22px 0 10px" }}>{scripts.length} script{scripts.length === 1 ? "" : "s"} in the library</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {scripts.map(function (s) {
          const sc = STAGE_COLOR[s.stage] || STAGE_COLOR.draft
          return (
            <div key={s.id} style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input defaultValue={s.title} onBlur={e => { if (e.target.value.trim() && e.target.value !== s.title) patch(s.id, { title: e.target.value }) }}
                  style={Object.assign({}, input, { flex: 1, minWidth: 200, fontWeight: 600, fontSize: 14 })} />
                <select value={s.stage} onChange={e => patch(s.id, { stage: e.target.value })} disabled={busy} title="Production stage"
                  style={{ fontSize: 11.5, fontWeight: 600, color: sc.fg, background: sc.bg, border: "1px solid " + sc.fg + "55", borderRadius: 999, padding: "3px 9px", fontFamily: "inherit", cursor: "pointer" }}>
                  {STAGES.map(st => <option key={st} value={st} style={{ color: "#111827" }}>{STAGE_LABEL[st]}</option>)}
                </select>
                <button onClick={() => del(s.id)} title="Delete script" style={{ background: "transparent", border: "none", color: T.textTertiary, fontSize: 16, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                <span style={{ fontSize: 11, color: T.textTertiary }}>Linked post:</span>
                <select value={s.linked_post_id || ""} onChange={e => patch(s.id, { linked_post_id: e.target.value || null })} disabled={busy}
                  style={Object.assign({}, input, { fontSize: 12.5, maxWidth: 340 })}>
                  <option value="">— not linked —</option>
                  {posts.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                {s.linked_post_id && (
                  <span style={{ fontSize: 11.5, color: T.textTertiary }}>
                    {s.published_at ? "Published " + fmtDate(s.published_at) : s.scheduled_for ? "Scheduled " + fmtDate(s.scheduled_for) : (s.linked_post_status || "linked")}
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 11, color: T.textTertiary }}>Added {fmtDate(s.created_at)}</span>
              </div>

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: T.textSecondary, userSelect: "none" }}>Script text {s.script_text ? "" : "(empty)"}</summary>
                <textarea rows={8} defaultValue={s.script_text || ""} placeholder="Paste or write your script here…"
                  onBlur={e => { if (e.target.value !== (s.script_text || "")) patch(s.id, { script_text: e.target.value }) }}
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13.5, fontFamily: "inherit", lineHeight: 1.55, color: T.textPrimary, resize: "vertical" }} />
              </details>
            </div>
          )
        })}
        {scripts.length === 0 && <div style={{ fontSize: 13, color: T.textTertiary, padding: "8px 0" }}>No scripts yet. Add your first one above.</div>}
      </div>
    </main>
  )
}
