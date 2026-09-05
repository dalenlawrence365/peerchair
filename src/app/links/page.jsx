"use client"
import { useEffect, useState } from "react"
import { T } from "@/lib/pipelineTheme"

// /links — self-service link library. Dalen adds/renames/retires links
// here (a workshop RSVP page, an assessment link, a recording, etc.) and
// Draft Email / Draft DM pick up active rows immediately as KNOWN LINKS —
// no code change, no redeploy. See named_links table comment and
// src/lib/draftLinksContext.js for how the drafting prompts consume this.

const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid " + T.border, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }

export default function LinksPage() {
  const [links, setLinks] = useState(null)
  const [err, setErr] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  async function load() {
    try {
      const r = await fetch("/api/named-links", { cache: "no-store" })
      if (!r.ok) throw new Error("HTTP " + r.status)
      const j = await r.json()
      setLinks(j.links || [])
    } catch (e) { setErr(e.message) }
  }
  useEffect(function () { load() }, [])

  return (
    <main style={{ padding: "32px 36px", maxWidth: 880 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Links</h1>
        <button onClick={function () { setShowAdd(true) }}
          style={{ fontSize: 13, padding: "8px 14px", borderRadius: 6, border: "none", background: T.accent, color: "white", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>
          + Add link
        </button>
      </div>
      <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 8, marginBottom: 24, maxWidth: 640, lineHeight: 1.5 }}>
        Named links Draft Email and Draft DM can reach for automatically. The label is just the display text a
        reader sees — it's "When to use this" that does the actual matching, since how you describe a link out loud
        ("the web page," "the signup link") usually won't be the same words as the label. Rename or retire a link
        here any time; every future draft picks it up immediately.
      </p>

      {err && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 16 }}>Error: {err}</div>}
      {links === null && !err && <div style={{ color: T.textTertiary, fontSize: 13 }}>Loading…</div>}
      {links && links.length === 0 && !showAdd && (
        <div style={{ color: T.textTertiary, fontSize: 13 }}>No links yet — add your first one above.</div>
      )}

      {showAdd && (
        <LinkForm
          onCancel={function () { setShowAdd(false) }}
          onSave={async function (payload) {
            const r = await fetch("/api/named-links", {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
            })
            const j = await r.json().catch(function () { return {} })
            if (!r.ok) { alert(j.error || "Couldn't save."); return false }
            setShowAdd(false)
            await load()
            return true
          }}
        />
      )}

      {links && links.map(function (l) {
        return <LinkRow key={l.id} link={l} onChange={load} />
      })}
    </main>
  )
}

function LinkForm({ initial, onSave, onCancel }) {
  const [label, setLabel] = useState((initial && initial.label) || "")
  const [url, setUrl] = useState((initial && initial.url) || "")
  const [useFor, setUseFor] = useState((initial && initial.use_for) || "")
  const [saving, setSaving] = useState(false)
  const canSave = label.trim() && url.trim() && useFor.trim()

  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Label (what the reader sees)</div>
      <input value={label} onChange={function (e) { setLabel(e.target.value) }}
        placeholder='e.g. "CFO Circle Los Angeles"' style={{ ...inputStyle, marginBottom: 10 }} />
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>URL</div>
      <input value={url} onChange={function (e) { setUrl(e.target.value) }}
        placeholder="https://…" style={{ ...inputStyle, marginBottom: 10 }} />
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>When to use this (required — this is what Claude actually matches on)</div>
      <input value={useFor} onChange={function (e) { setUseFor(e.target.value) }}
        placeholder={'e.g. "Use whenever Dalen says the web page, our site, or CFO Circle\'s website"'} style={{ ...inputStyle, marginBottom: 14 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={saving || !canSave} onClick={async function () {
          setSaving(true)
          const ok = await onSave({ label: label.trim(), url: url.trim(), use_for: useFor.trim() })
          setSaving(false)
          if (!ok) return
        }}
          style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: T.accent, color: "white", fontSize: 13, cursor: (saving || !canSave) ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: (saving || !canSave) ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button disabled={saving} onClick={onCancel}
          style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textTertiary, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function LinkRow({ link, onChange }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  async function patch(fields) {
    setBusy(true)
    try {
      const r = await fetch("/api/named-links/" + link.id, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields),
      })
      const j = await r.json().catch(function () { return {} })
      if (!r.ok) { alert(j.error || "Couldn't save."); return }
      await onChange()
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!confirm('Delete "' + link.label + '"? Drafts will no longer be able to reference it.')) return
    setBusy(true)
    try {
      const r = await fetch("/api/named-links/" + link.id, { method: "DELETE" })
      if (!r.ok) { const j = await r.json().catch(function () { return {} }); alert(j.error || "Couldn't delete."); return }
      await onChange()
    } finally { setBusy(false) }
  }

  if (editing) {
    return (
      <LinkForm
        initial={link}
        onCancel={function () { setEditing(false) }}
        onSave={async function (payload) { await patch(payload); setEditing(false); return true }}
      />
    )
  }

  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 16, marginBottom: 12, opacity: link.active ? 1 : 0.55 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary, display: "flex", alignItems: "center", gap: 8 }}>
            {link.label}
            {!link.active && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: T.borderSoft || "#e5e7eb", color: T.textTertiary, fontWeight: 500 }}>RETIRED</span>}
          </div>
          <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.accent, wordBreak: "break-all" }}>{link.url}</a>
          <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 6, lineHeight: 1.4 }}>
            <span style={{ fontWeight: 600, color: T.textTertiary }}>Use when: </span>{link.use_for}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button disabled={busy} onClick={function () { setEditing(true) }}
            style={{ fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textPrimary, cursor: "pointer", fontFamily: "inherit" }}>
            Edit
          </button>
          <button disabled={busy} onClick={function () { patch({ active: !link.active }) }}
            style={{ fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }}>
            {link.active ? "Retire" : "Reactivate"}
          </button>
          <button disabled={busy} onClick={remove}
            style={{ fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: "#dc2626", cursor: "pointer", fontFamily: "inherit" }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
