"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"
import PersonCompanyPicker from "@/components/PersonCompanyPicker"

// ─── Quick-add presets ───────────────────────────────────────────────────────
// These map to the canonical action_tag taxonomy: completing a person-attached
// todo fires the corresponding action_tag on the linked person.
// The 'peerchair' preset is a category marker (no tag-firing) for app
// development tasks — bugs, features, refactors of PeerChair itself.
export const TODO_PRESETS = [
  { key: "brochure",   title: "Send brochure",      action_type: "brochure_sent" },
  { key: "assessment", title: "Send assessment",    action_type: "assessment_sent" },
  { key: "event",      title: "Send event invite",  action_type: "event_invite_sent" },
  { key: "fitcall",    title: "Schedule fit call",  action_type: "fit_call_scheduled" },
  { key: "followup",   title: "Personal follow-up", action_type: null },
  { key: "waiting",    title: "Waiting",            action_type: "waiting" },
  { key: "peerchair",  title: "PeerChair",          action_type: "peerchair" },
  { key: "custom",     title: "",                   action_type: null },
]

// ─── Date helpers ────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().slice(0, 10) }
function inDaysISO(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

// End of this week = upcoming Sunday (or today if it's already Sunday)
function endOfWeekISO() {
  const d = new Date()
  const dow = d.getDay() // 0 = Sun, 6 = Sat
  const daysToSun = (7 - dow) % 7
  d.setDate(d.getDate() + daysToSun)
  return d.toISOString().slice(0, 10)
}
// Start of next week = next Monday
function nextMondayISO() {
  const d = new Date()
  const dow = d.getDay() // 0 = Sun, 1 = Mon, …
  const daysToMon = dow === 0 ? 1 : (8 - dow)
  d.setDate(d.getDate() + daysToMon)
  return d.toISOString().slice(0, 10)
}

// Returns { anchor, countdown, color }
//   anchor   = absolute date label (or null when it's redundant — today/tomorrow)
//   countdown = relative phrase (today, in 3d, 2d overdue, etc.)
//   color     = the color for the urgency cue
function dueLabel(dateStr) {
  if (!dateStr) return { anchor: null, countdown: "no date", color: T.textTertiary }

  const today = todayISO()
  const date = new Date(dateStr + "T00:00:00")
  const now  = new Date(today + "T00:00:00")
  const days = Math.round((date - now) / 86400000)

  // Format the anchor
  const sameWeek = (() => {
    const d = new Date(); const dow = d.getDay()
    const daysToSun = (7 - dow) % 7
    const eow = new Date(); eow.setDate(eow.getDate() + daysToSun)
    return dateStr <= eow.toISOString().slice(0, 10)
  })()
  const anchorShort = date.toLocaleDateString("en-US", { weekday: "short" })
  const anchorFull  = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })

  if (days < 0)  return { anchor: anchorFull,  countdown: `${Math.abs(days)}d overdue`, color: "#b91c1c" }
  if (days === 0) return { anchor: null,        countdown: "today",     color: "#b45309" }
  if (days === 1) return { anchor: null,        countdown: "tomorrow",  color: "#b45309" }
  if (sameWeek)   return { anchor: anchorShort, countdown: `in ${days}d`, color: T.textSecondary }
  return            { anchor: anchorFull,  countdown: `in ${days}d`, color: T.textTertiary }
}

// ─── Quick-add form ──────────────────────────────────────────────────────────

export function TodoQuickAdd({ personId, companyId, defaultPersonName, onCreated }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ title: "", action_type: null, scheduled_for: todayISO(), notes: "" })
  // attachment is only used when no personId/companyId was preset by the parent
  const [attachment, setAttachment] = useState(null) // { kind, id, name, subtitle } | null
  const [saving, setSaving] = useState(false)
  const isScoped = !!(personId || companyId)

  function startWithPreset(preset) {
    // PeerChair preset: empty title, user types the bug/feature
    if (preset.key === "peerchair") {
      setDraft({ title: "", action_type: "peerchair", scheduled_for: todayISO(), notes: "" })
      setOpen(true)
      return
    }
    // For scoped contexts (profile pages), reference the contextual name in the title.
    // For global context (/todos page), reference the attachment's name if one's already picked.
    const refName = isScoped ? defaultPersonName : (attachment?.name || "")
    // Waiting preset: title is "Waiting on <name>" and default date is next Monday
    // (typical "give them the rest of the week + the weekend" follow-up cadence).
    if (preset.key === "waiting") {
      setDraft({
        title: refName ? `Waiting on ${refName}` : "Waiting on…",
        action_type: "waiting",
        scheduled_for: nextMondayISO(),
        notes: "",
      })
      setOpen(true)
      return
    }
    const title = preset.action_type === "brochure_sent"   ? `Send brochure${refName ? " to " + refName : ""}` :
                  preset.action_type === "assessment_sent" ? `Send assessment${refName ? " to " + refName : ""}` :
                  preset.action_type === "event_invite_sent" ? `Send event invite${refName ? " to " + refName : ""}` :
                  preset.action_type === "fit_call_scheduled" ? `Schedule fit call${refName ? " with " + refName : ""}` :
                  preset.key === "followup" ? `Follow up${refName ? " with " + refName : ""}` :
                  ""
    setDraft({ title, action_type: preset.action_type, scheduled_for: todayISO(), notes: "" })
    setOpen(true)
  }

  async function save() {
    if (!draft.title.trim()) return
    setSaving(true)
    const body = {
      title: draft.title.trim(),
      action_type: draft.action_type || null,
      scheduled_for: draft.scheduled_for || null,
      notes: draft.notes || null,
      // Scoped props win; otherwise use the picker attachment
      ...(personId  ? { person_id:  personId  } : (attachment?.kind === "person"  ? { person_id:  attachment.id } : {})),
      ...(companyId ? { company_id: companyId } : (attachment?.kind === "company" ? { company_id: attachment.id } : {})),
    }
    try {
      const r = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const d = await r.json()
      if (d.todo && onCreated) onCreated(d.todo)
      setDraft({ title: "", action_type: null, scheduled_for: todayISO(), notes: "" })
      setAttachment(null)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {TODO_PRESETS.map(p => (
          <button key={p.key} onClick={() => startWithPreset(p)}
            style={{
              padding: "5px 11px", fontSize: 12, borderRadius: 6,
              border: "1px solid " + T.border, background: "white",
              color: T.textSecondary, cursor: "pointer", fontFamily: "inherit",
            }}>
            + {p.title || "Custom"}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div style={{
      background: "white", border: "1px solid " + T.border, borderRadius: 8,
      padding: 14, marginBottom: 12,
    }}>
      <input
        autoFocus
        value={draft.title}
        onChange={e => setDraft({ ...draft, title: e.target.value })}
        placeholder="What's the task?"
        onKeyDown={e => { if (e.key === "Enter") save() }}
        style={{
          width: "100%", padding: "8px 10px", fontSize: 14,
          border: "1px solid " + T.border, borderRadius: 6,
          fontFamily: "inherit", outline: "none", boxSizing: "border-box",
          marginBottom: 8,
        }}
      />

      {/* Attachment picker — only shown when no parent scope was passed in */}
      {!isScoped && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <label style={{ fontSize: 11, color: T.textTertiary }}>Attach to</label>
          <PersonCompanyPicker value={attachment} onSelect={setAttachment} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 11, color: T.textTertiary }}>Due</label>
        <input type="date" value={draft.scheduled_for || ""} onChange={e => setDraft({ ...draft, scheduled_for: e.target.value || null })}
          style={{ padding: "6px 10px", fontSize: 12, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
        <button onClick={() => setDraft({ ...draft, scheduled_for: todayISO() })} style={pillBtnStyle()}>Today</button>
        <button onClick={() => setDraft({ ...draft, scheduled_for: inDaysISO(1) })} style={pillBtnStyle()}>Tomorrow</button>
        <button onClick={() => setDraft({ ...draft, scheduled_for: endOfWeekISO() })} style={pillBtnStyle()}>End of week</button>
        <button onClick={() => setDraft({ ...draft, scheduled_for: nextMondayISO() })} style={pillBtnStyle()}>Next Mon</button>
        <button onClick={() => setDraft({ ...draft, scheduled_for: inDaysISO(14) })} style={pillBtnStyle()}>+2 weeks</button>
        <button onClick={() => setDraft({ ...draft, scheduled_for: null })} style={pillBtnStyle()}>No date</button>
      </div>
      <textarea
        value={draft.notes}
        onChange={e => setDraft({ ...draft, notes: e.target.value })}
        placeholder="Notes (optional)"
        rows={2}
        style={{
          width: "100%", padding: "8px 10px", fontSize: 13,
          border: "1px solid " + T.border, borderRadius: 6,
          fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={save} disabled={saving || !draft.title.trim()}
          style={{ background: "#3b82f6", border: "none", color: "white", padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", opacity: (saving || !draft.title.trim()) ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Add todo"}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "1px solid " + T.border, padding: "7px 14px", borderRadius: 6, fontSize: 12, color: T.textSecondary, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function pillBtnStyle() {
  return { padding: "4px 9px", fontSize: 11, borderRadius: 12, border: "1px solid " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }
}

// ─── Todo row ────────────────────────────────────────────────────────────────

export function TodoRow({ todo, onComplete, onUpdate, onDelete, showPersonLink = true, showCompanyLink = true }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(todo)
  useEffect(() => { setDraft(todo) }, [todo])

  const isDone = !!todo.completed_at
  const due = dueLabel(todo.scheduled_for)

  async function complete() {
    await fetch(`/api/todos/${todo.id}/complete`, { method: "POST" })
    if (onComplete) onComplete(todo.id)
  }

  async function uncomplete() {
    const r = await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: null }),
    })
    const d = await r.json()
    if (d.todo && onUpdate) onUpdate(d.todo)
  }

  async function saveEdit() {
    const r = await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        notes: draft.notes,
        scheduled_for: draft.scheduled_for || null,
      }),
    })
    const d = await r.json()
    if (d.todo && onUpdate) onUpdate(d.todo)
    setEditing(false)
  }

  async function remove() {
    if (!confirm("Delete this todo?")) return
    await fetch(`/api/todos/${todo.id}`, { method: "DELETE" })
    if (onDelete) onDelete(todo.id)
  }

  if (editing) {
    return (
      <div style={rowBaseStyle(false)}>
        <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}
          onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") { setDraft(todo); setEditing(false) } }}
          autoFocus
          style={{ flex: 1, padding: "6px 10px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
        <input type="date" value={draft.scheduled_for || ""} onChange={e => setDraft({ ...draft, scheduled_for: e.target.value || null })}
          style={{ padding: "6px 10px", fontSize: 12, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
        <button onClick={saveEdit} style={{ background: "#3b82f6", border: "none", color: "white", padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Save</button>
        <button onClick={() => { setDraft(todo); setEditing(false) }} style={{ background: "none", border: "1px solid " + T.border, padding: "6px 12px", borderRadius: 6, fontSize: 12, color: T.textSecondary, cursor: "pointer" }}>Cancel</button>
      </div>
    )
  }

  const personName = todo.person?.full_name || (todo.person ? `${todo.person.first_name || ""} ${todo.person.last_name || ""}`.trim() : null)
  const companyName = todo.company?.name

  return (
    <div style={rowBaseStyle(isDone)}>
      <button onClick={isDone ? uncomplete : complete} title={isDone ? "Mark as not done" : "Mark done"}
        style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          border: "1.5px solid " + (isDone ? "#15803d" : T.border),
          background: isDone ? "#15803d" : "white",
          cursor: "pointer", padding: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        {isDone && <span style={{ color: "white", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: isDone ? T.textTertiary : T.textPrimary, textDecoration: isDone ? "line-through" : "none" }}>
          {todo.title}
        </div>
        <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {!isDone && (
            <span>
              {due.anchor && <span style={{ color: T.textPrimary, fontWeight: 500 }}>{due.anchor}</span>}
              {due.anchor && <span style={{ color: T.textTertiary, margin: "0 5px" }}>·</span>}
              <span style={{ color: due.color, fontWeight: 500 }}>{due.countdown}</span>
            </span>
          )}
          {isDone && <span>completed {new Date(todo.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
          {showPersonLink && personName && todo.person_id && (
            <span>· <Link href={`/people/${todo.person_id}`} style={{ color: "#3b82f6", textDecoration: "none" }}>{personName}</Link></span>
          )}
          {showCompanyLink && companyName && todo.company_id && (
            <span>· <Link href={`/companies/${todo.company_id}`} style={{ color: "#3b82f6", textDecoration: "none" }}>{companyName}</Link></span>
          )}
          {todo.action_type === "peerchair" ? (
            <span style={{
              display: "inline-block", padding: "1px 7px", borderRadius: 999,
              fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
              background: "rgba(168, 85, 247, 0.12)", color: "#a855f7",
              border: "1px solid rgba(168, 85, 247, 0.3)",
              whiteSpace: "nowrap",
            }}>PeerChair</span>
          ) : todo.action_type === "waiting" ? (
            <span style={{
              display: "inline-block", padding: "1px 7px", borderRadius: 999,
              fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
              background: "rgba(217, 119, 6, 0.14)", color: "#b45309",
              border: "1px solid rgba(217, 119, 6, 0.35)",
              whiteSpace: "nowrap",
            }}>Waiting</span>
          ) : todo.action_type ? (
            <span>· {todo.action_type}</span>
          ) : null}
        </div>
        {todo.notes && (
          <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>{todo.notes}</div>
        )}
      </div>

      <button onClick={() => setEditing(true)} style={smallActionBtn()}>Edit</button>
      <button onClick={remove} style={{ ...smallActionBtn(), color: "#b91c1c", borderColor: "rgba(220, 38, 38, 0.3)" }}>Delete</button>
    </div>
  )
}

function rowBaseStyle(isDone) {
  return {
    padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10,
    background: isDone ? "rgba(0,0,0,0.02)" : "white",
    border: "1px solid " + T.border, borderRadius: 8,
    marginBottom: 6,
  }
}

function smallActionBtn() {
  return { background: "none", border: "1px solid " + T.border, padding: "4px 9px", borderRadius: 5, fontSize: 11, color: T.textSecondary, cursor: "pointer", flexShrink: 0 }
}
