"use client"
import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"
import { TAG_LABEL, TAG_VOCABULARY, NETWORKING_TAGS } from "@/lib/meetingTags"

// Filter chips on the meetings page surface key tag-based slices.
const FILTER_CHIPS = [
  { key: null,                 label: "All" },
  { key: "fit_call",           label: "Fit calls" },
  { key: "sponsor_discovery",  label: "Sponsor discovery" },
  { key: "call",               label: "Calls" },
  { key: "networking",         label: "Networking" },
  { key: "chapter_peer",       label: "Chapter peer" },
  { key: "personal",           label: "Personal" },
]

function fmtDateTime(s, all_day) {
  if (!s) return "—"
  const d = new Date(s)
  if (all_day) return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " · all day"
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}
function dayKey(s) {
  const d = new Date(s)
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })
}
function isToday(s) {
  const d = new Date(s); const now = new Date()
  return d.toDateString() === now.toDateString()
}
function isTomorrow(s) {
  const d = new Date(s); const t = new Date(); t.setDate(t.getDate() + 1)
  return d.toDateString() === t.toDateString()
}
function dayLabel(s) {
  if (isToday(s)) return "Today · " + new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  if (isTomorrow(s)) return "Tomorrow · " + new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  return dayKey(s)
}

export default function MeetingsPage() {
  const [range, setRange] = useState("upcoming")
  const [typeFilter, setTypeFilter] = useState(null)
  const [showPersonal, setShowPersonal] = useState(true)
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  async function load() {
    try {
      const qs = new URLSearchParams({ range })
      if (typeFilter) qs.set("tag", typeFilter)
      if (!showPersonal) qs.set("include_personal", "false")
      const r = await fetch(`/api/meetings?${qs.toString()}`, { cache: "no-store" })
      if (!r.ok) throw new Error("HTTP " + r.status)
      const j = await r.json()
      setData(j)
    } catch (e) { setErr(e.message) }
  }
  useEffect(function(){ load() }, [range, typeFilter, showPersonal])

  // Group by day
  const grouped = useMemo(function(){
    if (!data) return []
    const groups = []
    let currentKey = null
    let currentGroup = null
    for (const m of data.items) {
      const k = dayLabel(m.starts_at)
      if (k !== currentKey) {
        currentKey = k
        currentGroup = { day: k, items: [] }
        groups.push(currentGroup)
      }
      currentGroup.items.push(m)
    }
    return groups
  }, [data])

  return (
    <main style={{ padding: "32px 36px", maxWidth: 1040 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Meetings</h1>
        {data && data.upcoming_7d !== undefined && (
          <div style={{ fontSize: 13, color: T.textSecondary }}>
            <strong style={{ color: T.textPrimary }}>{data.upcoming_7d}</strong> in next 7 days
          </div>
        )}
      </div>
      <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 8, marginBottom: 20, maxWidth: 720 }}>
        Everything on your calendar — Outlook + anything Calendly auto-books. Synced every 30 minutes. Click a person to jump to their profile.
      </p>

      <div style={{ display: "flex", gap: 14, alignItems: "center", borderBottom: "1px solid " + T.border, marginBottom: 16, paddingBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { key: "upcoming", label: "Upcoming" },
            { key: "past",     label: "Past" },
            { key: "all",      label: "All" },
          ].map(function(t){
            const isActive = range === t.key
            return (
              <button key={t.key} onClick={function(){ setRange(t.key) }}
                style={{
                  fontSize: 13, padding: "6px 12px",
                  border: "1px solid " + (isActive ? T.textPrimary : T.border),
                  background: isActive ? T.textPrimary : "white",
                  color: isActive ? "white" : T.textSecondary,
                  borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
                }}>{t.label}</button>
            )
          })}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTER_CHIPS.map(function(chip){
            const isActive = typeFilter === chip.key
            if (!showPersonal && chip.key === "personal") return null
            const meta = chip.key ? TAG_LABEL[chip.key] : null
            return (
              <button key={chip.key || "all"} onClick={function(){ setTypeFilter(chip.key) }}
                style={{
                  fontSize: 11, padding: "4px 10px",
                  borderRadius: 14,
                  border: "1px solid " + (isActive ? (meta?.color || T.textPrimary) : T.border),
                  background: isActive ? (meta?.color || T.textPrimary) : "white",
                  color: isActive ? "white" : T.textSecondary,
                  cursor: "pointer", fontFamily: "inherit",
                }}>{chip.label}</button>
            )
          })}
        </div>

        <label style={{ fontSize: 12, color: T.textSecondary, cursor: "pointer", marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={showPersonal} onChange={function(e){ setShowPersonal(e.target.checked) }} />
          Show personal
        </label>
      </div>

      {err && <div style={{ color: "#dc2626", fontSize: 13 }}>Error: {err}</div>}
      {!data && !err && <div style={{ color: T.textTertiary, fontSize: 13 }}>Loading…</div>}
      {data && grouped.length === 0 && (
        <div style={{ color: T.textTertiary, fontSize: 13, padding: "32px 0", textAlign: "center" }}>
          {range === "upcoming" ? "Nothing on the calendar yet. Sync runs every 30 min — first events should appear after the next tick." : "No meetings in this view."}
        </div>
      )}

      {grouped.map(function(g){
        return (
          <div key={g.day} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>{g.day}</div>
            {g.items.map(function(m){ return <MeetingRow key={m.id} m={m} onChanged={load} /> })}
          </div>
        )
      })}
    </main>
  )
}

function MeetingRow({ m, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const tags = Array.isArray(m.tags) && m.tags.length > 0 ? m.tags : ["other"]
  const isCanceled = m.status === "canceled"
  const primaryColor = TAG_LABEL[tags[0]]?.color || "#94a3b8"

  async function patch(payload) {
    setBusy(true)
    try {
      const r = await fetch(`/api/meetings/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await r.json()
      if (!r.ok) { alert("Failed: " + (j.error || r.status)); return }
      if (onChanged) await onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div style={{
      background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10,
      padding: 14, marginBottom: 8, opacity: isCanceled ? 0.55 : 1,
      borderLeft: "3px solid " + primaryColor,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, textDecoration: isCanceled ? "line-through" : "none" }}>
              {fmtDateTime(m.starts_at, m.all_day)}
              {m.ends_at && !m.all_day && <span style={{ color: T.textTertiary, fontWeight: 400 }}>–{fmtDateTime(m.ends_at, false)}</span>}
            </div>
            {isCanceled && <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 10, background: "#e7e5e4", color: T.textSecondary, fontWeight: 600, textTransform: "uppercase" }}>Canceled</span>}
            {m.status === "tentative" && <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 10, background: "#fef3c7", color: "#92400e", fontWeight: 600, textTransform: "uppercase" }}>Tentative</span>}
            {m.tags_manually_edited && <span title="Tags manually edited — sync will not overwrite" style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "#f1f5f9", color: T.textTertiary, fontWeight: 600 }}>✎</span>}
          </div>

          {/* Tag pill row — clickable, opens inline editor */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6, alignItems: "center" }}>
            {tags.map(t => {
              const meta = TAG_LABEL[t] || { label: t, color: "#94a3b8", bg: "rgba(148,163,184,0.13)" }
              return (
                <span key={t} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: 999,
                  fontSize: 10.5, fontWeight: 600,
                  background: meta.bg, color: meta.color, whiteSpace: "nowrap",
                }}>
                  {meta.label}
                  {editing && t !== "other" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); patch({ remove: [t] }) }}
                      disabled={busy}
                      style={{ background: "transparent", border: "none", color: meta.color, cursor: "pointer", padding: 0, marginLeft: 2, fontSize: 11, lineHeight: 1, fontFamily: "inherit" }}
                      title={`Remove ${meta.label}`}
                    >×</button>
                  )}
                </span>
              )
            })}
            <button
              onClick={() => setEditing(v => !v)}
              style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 999,
                border: "1px dashed " + T.border, background: "transparent",
                color: T.textTertiary, cursor: "pointer", fontFamily: "inherit",
              }}
              title="Edit tags"
            >
              {editing ? "done" : "edit tags"}
            </button>
          </div>

          {/* Add-tag dropdown when editing */}
          {editing && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6, padding: "6px 8px", background: "#f8fafc", border: "1px solid " + T.border, borderRadius: 6 }}>
              <span style={{ fontSize: 10, color: T.textTertiary, alignSelf: "center", marginRight: 4 }}>Add:</span>
              {TAG_VOCABULARY.filter(t => !tags.includes(t)).map(t => {
                const meta = TAG_LABEL[t] || { label: t, color: "#94a3b8", bg: "rgba(148,163,184,0.13)" }
                return (
                  <button key={t} onClick={() => patch({ add: [t] })} disabled={busy}
                    style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 999,
                      background: meta.bg, color: meta.color, border: "1px solid transparent",
                      cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                    }}>
                    + {meta.label}
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ fontSize: 14, color: T.textPrimary, marginTop: 6, fontWeight: 500 }}>
            {m.title || "(no title)"}
          </div>
          <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {m.person && (
              <Link href={`/people/${m.person.id}`} style={{ color: T.accent || "#3b82f6", textDecoration: "none" }}>
                ↪ {m.person.full_name}
              </Link>
            )}
            {!m.person && m.attendees_json && m.attendees_json.length > 0 && (
              <span style={{ color: T.textTertiary }}>
                {m.attendees_json.length === 1 ? m.attendees_json[0].name || m.attendees_json[0].address : `${m.attendees_json.length} attendees`}
              </span>
            )}
            {m.location && <span style={{ color: T.textTertiary }}>{m.location}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
