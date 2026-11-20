"use client"
import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"
import { TAG_LABEL } from "@/lib/meetingTags"

const TYPES = [
  ["other", "Other"], ["fit_call", "Fit call"], ["sponsor_discovery", "Sponsor discovery"],
  ["exploratory", "Exploratory"], ["chapter_peer", "Chapter peer"], ["personal", "Personal"],
]
const STATUSES = ["scheduled", "tentative", "completed", "canceled"]

const card = { background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 14 }
const h2 = { fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 10px" }
const input = { fontSize: 13, padding: "6px 8px", border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", width: "100%", boxSizing: "border-box" }
const btn = { fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }
const btnPrimary = { ...btn, background: T.textPrimary, color: "white", border: "1px solid " + T.textPrimary }

// <input type="datetime-local"> works in local time; the API stores ISO (UTC).
function toLocalInput(iso) {
  if (!iso) return ""
  const d = new Date(iso); const p = n => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function fmtWhen(m) {
  const s = new Date(m.starts_at)
  const day = s.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
  if (m.all_day) return day + " · all day"
  const t = d => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  return `${day} · ${t(s)}${m.ends_at ? "–" + t(new Date(m.ends_at)) : ""}`
}
const NOTE_LABEL = { granola_summary: "Summary (Granola)", granola_transcript: "Transcript (Granola)", manual: "Note" }

function PeoplePicker({ onPick, exclude }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState([])
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    let alive = true
    const t = setTimeout(() => {
      fetch("/api/people/search?q=" + encodeURIComponent(q.trim()), { cache: "no-store" })
        .then(r => r.json()).then(d => { if (alive) setResults((d.results || []).filter(p => !exclude.includes(p.id))) }).catch(() => {})
    }, 200)
    return () => { alive = false; clearTimeout(t) }
  }, [q, exclude])
  return (
    <div style={{ position: "relative" }}>
      <input style={input} placeholder="Add a person — search by name, email or company" value={q} onChange={e => setQ(e.target.value)} />
      {results.length > 0 && (
        <div style={{ position: "absolute", zIndex: 5, left: 0, right: 0, top: "100%", background: "white", border: "1px solid " + T.border, borderRadius: 6, boxShadow: "0 4px 14px rgba(0,0,0,.08)", maxHeight: 260, overflowY: "auto" }}>
          {results.map(p => (
            <div key={p.id} onClick={() => { onPick(p); setQ(""); setResults([]) }}
              style={{ padding: "7px 10px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid " + T.border }}>
              <strong>{p.full_name || p.name}</strong>
              <span style={{ color: T.textTertiary }}> {[p.title, p.company, p.email].filter(Boolean).join(" · ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NewMeeting() {
  const router = useRouter()
  const [f, setF] = useState({ title: "", starts_at: "", ends_at: "", location: "", meeting_type: "other" })
  const [people, setPeople] = useState([])
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  async function create() {
    setBusy(true)
    const r = await fetch("/api/meetings", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, person_ids: people.map(p => p.id) }) })
    const j = await r.json(); setBusy(false)
    if (!r.ok) { alert("Couldn't create: " + (j.error || r.status)); return }
    router.push("/meetings/" + j.id)
  }
  return (
    <main style={{ padding: "32px 36px", maxWidth: 760 }}>
      <Link href="/meetings" style={{ fontSize: 12, color: T.textTertiary }}>← Meetings</Link>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "8px 0 18px" }}>New meeting</h1>
      <div style={card}>
        <div style={{ display: "grid", gap: 10 }}>
          <input style={input} placeholder="Title" value={f.title} onChange={e => set("title", e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 12 }}>Starts<input type="datetime-local" style={input} value={f.starts_at} onChange={e => set("starts_at", e.target.value)} /></label>
            <label style={{ fontSize: 12 }}>Ends<input type="datetime-local" style={input} value={f.ends_at} onChange={e => set("ends_at", e.target.value)} /></label>
          </div>
          <input style={input} placeholder="Location" value={f.location} onChange={e => set("location", e.target.value)} />
          <select style={input} value={f.meeting_type} onChange={e => set("meeting_type", e.target.value)}>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <div>{people.map(p => <span key={p.id} style={{ ...btn, marginRight: 6, display: "inline-block" }}>{p.full_name || p.name} <a onClick={() => setPeople(people.filter(x => x.id !== p.id))} style={{ cursor: "pointer" }}>×</a></span>)}</div>
          <PeoplePicker exclude={people.map(p => p.id)} onPick={p => setPeople([...people, p])} />
          <div><button style={btnPrimary} disabled={busy || !f.title || !f.starts_at} onClick={create}>{busy ? "Creating…" : "Create meeting"}</button></div>
        </div>
      </div>
    </main>
  )
}

export default function MeetingPage() {
  const { id } = useParams()
  if (id === "new") return <NewMeeting />
  return <MeetingDetail id={id} />
}

function MeetingDetail({ id }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const [edit, setEdit] = useState(null)
  const [noteText, setNoteText] = useState("")
  const [noteEdit, setNoteEdit] = useState({})
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/meetings/" + id, { cache: "no-store" })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "HTTP " + r.status)
      if (j.kind !== "calendar") throw new Error("This is a ProVisors group meeting — open it under ProVisors.")
      setD(j)
    } catch (e) { setErr(e.message) }
  }, [id])
  useEffect(() => { load() }, [load])

  async function call(url, method, body) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { alert("Failed: " + (j.error || r.status)); return false }
    await load(); return true
  }

  if (err) return <main style={{ padding: 36 }}><Link href="/meetings">← Meetings</Link><p style={{ color: "#dc2626" }}>{err}</p></main>
  if (!d) return <main style={{ padding: 36, color: T.textTertiary }}>Loading…</main>
  const m = d.meeting
  const manual = m.source === "manual"
  const attIds = d.attendees.map(p => p.id)
  const summary = d.notes.filter(n => n.source === "granola_summary")
  const transcript = d.notes.filter(n => n.source === "granola_transcript")
  const other = d.notes.filter(n => !n.source.startsWith("granola_"))

  function NoteBlock({ n }) {
    const editing = noteEdit[n.id] !== undefined
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textTertiary, marginBottom: 4 }}>
          <span>{NOTE_LABEL[n.source] || n.source}{n.author ? " · " + n.author : ""} · {new Date(n.created_at).toLocaleString()}</span>
          <span>
            <a style={{ cursor: "pointer", marginRight: 10 }} onClick={() => setNoteEdit({ ...noteEdit, [n.id]: editing ? undefined : n.body })}>{editing ? "cancel" : "edit"}</a>
            <a style={{ cursor: "pointer" }} onClick={() => { if (confirm("Delete this note?")) call("/api/meeting-notes?id=" + n.id, "DELETE") }}>delete</a>
          </span>
        </div>
        {editing ? (
          <div>
            <textarea style={{ ...input, minHeight: 220 }} value={noteEdit[n.id]} onChange={e => setNoteEdit({ ...noteEdit, [n.id]: e.target.value })} />
            <button style={{ ...btnPrimary, marginTop: 6 }} onClick={async () => { if (await call("/api/meeting-notes", "PATCH", { id: n.id, body: noteEdit[n.id] })) setNoteEdit({ ...noteEdit, [n.id]: undefined }) }}>Save</button>
          </div>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", maxHeight: n.source === "granola_transcript" ? 360 : "none", overflowY: "auto" }}>{n.body}</div>
        )}
      </div>
    )
  }

  return (
    <main style={{ padding: "32px 36px", maxWidth: 860 }}>
      <Link href="/meetings" style={{ fontSize: 12, color: T.textTertiary }}>← Meetings</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, margin: "8px 0 4px" }}>
        {edit ? <input style={{ ...input, fontSize: 20, fontWeight: 600 }} value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} />
          : <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{m.title || "(no title)"}</h1>}
        {manual && !edit && <button style={btn} onClick={() => setEdit({ title: m.title || "", starts_at: toLocalInput(m.starts_at), ends_at: toLocalInput(m.ends_at), location: m.location || "" })}>Edit</button>}
      </div>
      {edit ? (
        <div style={{ ...card, display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ fontSize: 12 }}>Starts<input type="datetime-local" style={input} value={edit.starts_at} onChange={e => setEdit({ ...edit, starts_at: e.target.value })} /></label>
            <label style={{ fontSize: 12 }}>Ends<input type="datetime-local" style={input} value={edit.ends_at} onChange={e => setEdit({ ...edit, ends_at: e.target.value })} /></label>
          </div>
          <input style={input} placeholder="Location" value={edit.location} onChange={e => setEdit({ ...edit, location: e.target.value })} />
          <div><button style={btnPrimary} onClick={async () => { if (await call("/api/meetings/" + id, "PATCH", edit)) setEdit(null) }}>Save</button> <button style={btn} onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 14 }}>
          {fmtWhen(m)}{m.location ? " · " + m.location : ""}
          {!manual && <span style={{ color: T.textTertiary }}> · synced from Outlook (change time, title or location in Outlook)</span>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <select style={{ ...input, width: "auto" }} value={m.meeting_type || "other"} onChange={e => call("/api/meetings/" + id, "PATCH", { meeting_type: e.target.value })}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select style={{ ...input, width: "auto" }} value={m.status || "scheduled"} onChange={e => call("/api/meetings/" + id, "PATCH", { status: e.target.value })}>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(m.tags || []).map(t => <span key={t} style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: (TAG_LABEL[t] || {}).bg, color: (TAG_LABEL[t] || {}).color }}>{(TAG_LABEL[t] || { label: t }).label}</span>)}
        {m.granola_url && <a href={m.granola_url} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: "none" }}>Open in Granola ↗</a>}
      </div>

      <div style={card}>
        <h2 style={h2}>People in this meeting ({d.attendees.length})</h2>
        {d.attendees.length === 0 && <div style={{ fontSize: 13, color: T.textTertiary, marginBottom: 8 }}>No one added yet.</div>}
        {d.attendees.map(p => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid " + T.border, fontSize: 13 }}>
            <span><Link href={"/people/" + p.id} style={{ fontWeight: 600, color: T.textPrimary, textDecoration: "none" }}>{p.full_name}</Link>
              <span style={{ color: T.textTertiary }}> {[p.role === "organizer" ? "organizer" : null, p.title, p.company].filter(Boolean).join(" · ")}</span></span>
            <a style={{ cursor: "pointer", fontSize: 12, color: T.textTertiary }} onClick={() => call(`/api/meetings/${id}/attendees?person_id=${p.id}`, "DELETE")}>remove</a>
          </div>
        ))}
        {d.suggestions.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: T.textSecondary }}>
            On the invite but not added:{" "}
            {d.suggestions.map(s => s.person
              ? <button key={s.address} style={{ ...btn, marginRight: 6 }} onClick={() => call(`/api/meetings/${id}/attendees`, "POST", { person_id: s.person.id })}>+ {s.person.full_name}</button>
              : <span key={s.address} style={{ marginRight: 10, color: T.textTertiary }} title="Not in PeerChair yet — search below to add someone else">{s.name || s.address}</span>)}
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <PeoplePicker exclude={attIds} onPick={p => call(`/api/meetings/${id}/attendees`, "POST", { person_id: p.id })} />
        </div>
      </div>

      <div style={card}>
        <h2 style={h2}>Summary &amp; transcript</h2>
        {summary.length + transcript.length === 0 && <div style={{ fontSize: 13, color: T.textTertiary }}>Nothing from Granola yet.</div>}
        {summary.map(n => <NoteBlock key={n.id} n={n} />)}
        {transcript.map(n => <NoteBlock key={n.id} n={n} />)}
      </div>

      <div style={card}>
        <h2 style={h2}>Notes</h2>
        {other.map(n => <NoteBlock key={n.id} n={n} />)}
        <textarea style={{ ...input, minHeight: 90 }} placeholder="Add a note, or paste a summary / transcript" value={noteText} onChange={e => setNoteText(e.target.value)} />
        <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
          <button style={btnPrimary} disabled={!noteText.trim()} onClick={async () => { if (await call("/api/meeting-notes", "POST", { meeting_id: id, body: noteText })) setNoteText("") }}>Add note</button>
          <button style={btn} disabled={!noteText.trim()} onClick={async () => { if (await call("/api/meeting-notes", "POST", { meeting_id: id, body: noteText, source: "granola_transcript", author: "pasted" })) setNoteText("") }}>Save as transcript</button>
        </div>
      </div>
    </main>
  )
}
