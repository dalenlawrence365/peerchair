"use client"
import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"
import Avatar from "@/components/Avatar"
import ProfileTodoCard from "@/components/ProfileTodoCard"

// ─── Taxonomy ─────────────────────────────────────────────────────────────────

const STAGE_OPTIONS = ["pool", "audience", "discovery", "proposal", "active"]
const STAGE_LABEL = { pool: "Pool", audience: "Audience", discovery: "Discovery", proposal: "Proposal", active: "Active" }
const STAGE_COLOR = {
  pool:      { bg: "rgba(148, 163, 184, 0.12)", fg: "#64748b", border: "rgba(148, 163, 184, 0.4)" },
  audience:  { bg: "rgba(59, 130, 246, 0.12)",  fg: "#3b82f6", border: "rgba(59, 130, 246, 0.4)"  },
  discovery: { bg: "rgba(236, 72, 153, 0.12)",  fg: "#db2777", border: "rgba(236, 72, 153, 0.4)"  },
  proposal:  { bg: "rgba(217, 119, 6, 0.14)",   fg: "#b45309", border: "rgba(217, 119, 6, 0.4)"   },
  active:    { bg: "rgba(22, 163, 74, 0.14)",   fg: "#15803d", border: "rgba(22, 163, 74, 0.4)"   },
}

const CATEGORY_OPTIONS = [
  "Accounting/Advisory", "Commercial Banking", "Law Firm", "Insurance",
  "HR/Payroll", "Executive Search", "Commercial Real Estate", "Technology",
  "Wealth Management", "Advisory/M&A", "Other",
]
const HOST_VIABLE_OPTIONS = ["Yes", "No", "Unknown"]
const HOSTING_TYPE_OPTIONS = ["Presentation", "Meeting Host", "Either", "N/A", "TBD"]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtRel(iso) {
  if (!iso) return "—"
  const d = new Date(iso); const diff = (Date.now() - d) / 86400000
  if (diff < 1) return "today"
  if (diff < 30) return Math.round(diff) + "d ago"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// Tiny "saving / saved" indicator that fades out
function SaveIndicator({ state }) {
  if (state === "idle") return null
  return (
    <span style={{
      fontSize: 11, color: state === "saving" ? T.textTertiary : "#15803d",
      marginLeft: 8, opacity: state === "saved" ? 1 : 0.8,
      transition: "opacity 200ms",
    }}>
      {state === "saving" ? "Saving…" : "Saved ✓"}
    </span>
  )
}

// ─── Field components ────────────────────────────────────────────────────────

function StageDropdown({ value, onChange }) {
  const c = STAGE_COLOR[value] || STAGE_COLOR.pool
  return (
    <select
      value={value || "pool"}
      onChange={e => onChange(e.target.value)}
      style={{
        background: c.bg, color: c.fg, border: "1px solid " + c.border,
        padding: "4px 10px", borderRadius: 999,
        fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase",
        cursor: "pointer", appearance: "none", paddingRight: 22,
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'><path d='M0 2 L4 6 L8 2' stroke='${encodeURIComponent(c.fg)}' fill='none' stroke-width='1.5'/></svg>")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
      }}>
      {STAGE_OPTIONS.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
    </select>
  )
}

function SimpleDropdown({ value, options, placeholder, onChange }) {
  return (
    <select
      value={value || ""}
      onChange={e => onChange(e.target.value || null)}
      style={{
        background: "white", color: T.textPrimary,
        border: "1px solid " + T.border, borderRadius: 8,
        padding: "7px 12px", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        minWidth: 160,
      }}>
      <option value="">{placeholder || "—"}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function InlineText({ value, onSave, placeholder, fontSize = 26, fontWeight = 600 }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || "")

  useEffect(() => { setDraft(value || "") }, [value])

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed !== (value || "")) onSave(trimmed)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); commit() }
          if (e.key === "Escape") { setDraft(value || ""); setEditing(false) }
        }}
        placeholder={placeholder}
        style={{
          fontSize, fontWeight, letterSpacing: -0.4, fontFamily: "inherit",
          border: "1px solid " + T.border, borderRadius: 6, padding: "2px 8px",
          background: "white", color: T.textPrimary, outline: "none",
          minWidth: 360,
        }}
      />
    )
  }
  return (
    <span
      onClick={() => setEditing(true)}
      style={{ fontSize, fontWeight, letterSpacing: -0.4, cursor: "text", color: value ? T.textPrimary : T.textTertiary }}
      title="Click to edit">
      {value || placeholder}
    </span>
  )
}

function NotesField({ value, onSave }) {
  const [draft, setDraft] = useState(value || "")
  useEffect(() => { setDraft(value || "") }, [value])
  function commit() {
    if ((draft || "") !== (value || "")) onSave(draft)
  }
  return (
    <textarea
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      placeholder="Notes about this firm — sponsor history, key relationships, decision-making, anything that helps future you…"
      rows={5}
      style={{
        width: "100%", padding: "12px 14px", fontSize: 13, lineHeight: 1.55,
        border: "1px solid " + T.border, borderRadius: 8, fontFamily: "inherit",
        background: "white", color: T.textPrimary, resize: "vertical", outline: "none",
        boxSizing: "border-box",
      }}
    />
  )
}

// ─── Location row (view + edit modes) ────────────────────────────────────────

function LocationRow({ loc, onChange, onDelete }) {
  const [editing, setEditing] = useState(!loc.id) // open in edit mode if brand new (no id)
  const [draft, setDraft] = useState(loc)
  const [busy, setBusy] = useState(false)

  function set(k, v) { setDraft(prev => ({ ...prev, [k]: v })) }

  async function save() {
    setBusy(true)
    await onChange(draft)
    setBusy(false)
    setEditing(false)
  }

  async function remove() {
    if (!confirm("Delete this location?")) return
    setBusy(true)
    await onDelete(loc.id)
  }

  if (!editing) {
    const parts = [draft.address_line1, draft.address_line2, draft.neighborhood, [draft.city, draft.state].filter(Boolean).join(", "), draft.zip].filter(Boolean)
    return (
      <div style={{
        padding: "10px 14px", borderRadius: 8, background: "white",
        border: "1px solid " + T.border, marginBottom: 8,
        display: "flex", alignItems: "flex-start", gap: 12,
      }}>
        {draft.label && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: T.textTertiary,
            background: "rgba(100, 116, 139, 0.08)",
            padding: "3px 8px", borderRadius: 5, whiteSpace: "nowrap",
            marginTop: 2,
          }}>{draft.label}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: T.textPrimary, lineHeight: 1.5 }}>
            {parts.join(" · ") || <span style={{ color: T.textTertiary, fontStyle: "italic" }}>(empty)</span>}
          </div>
          {draft.notes && (
            <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 4 }}>{draft.notes}</div>
          )}
        </div>
        <button onClick={() => setEditing(true)}
          style={{ background: "none", border: "1px solid " + T.border, padding: "4px 10px", borderRadius: 6, fontSize: 11, color: T.textSecondary, cursor: "pointer" }}>
          Edit
        </button>
      </div>
    )
  }

  return (
    <div style={{
      padding: 14, borderRadius: 8, background: "white",
      border: "1px solid " + (T.border), marginBottom: 8,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <input value={draft.label || ""} onChange={e => set("label", e.target.value)} placeholder="Label"
          style={{ padding: "7px 10px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
        <input value={draft.address_line1 || ""} onChange={e => set("address_line1", e.target.value)} placeholder="Street address"
          style={{ padding: "7px 10px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
        <input value={draft.neighborhood || ""} onChange={e => set("neighborhood", e.target.value)} placeholder="Neighborhood"
          style={{ padding: "7px 10px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px", gap: 8, marginBottom: 8 }}>
        <input value={draft.city || ""} onChange={e => set("city", e.target.value)} placeholder="City"
          style={{ padding: "7px 10px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
        <input value={draft.state || ""} onChange={e => set("state", e.target.value)} placeholder="State"
          style={{ padding: "7px 10px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
        <input value={draft.zip || ""} onChange={e => set("zip", e.target.value)} placeholder="ZIP"
          style={{ padding: "7px 10px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
      </div>
      <input value={draft.notes || ""} onChange={e => set("notes", e.target.value)} placeholder="Notes (suite, contact, parking, anything)"
        style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={save} disabled={busy}
          style={{ background: "#3b82f6", border: "none", color: "white", padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={() => { setDraft(loc); setEditing(false) }}
          style={{ background: "none", border: "1px solid " + T.border, padding: "7px 14px", borderRadius: 6, fontSize: 12, color: T.textSecondary, cursor: "pointer" }}>
          Cancel
        </button>
        {loc.id && (
          <button onClick={remove} disabled={busy}
            style={{ background: "none", border: "1px solid rgba(220, 38, 38, 0.3)", color: "#dc2626", padding: "7px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", marginLeft: "auto" }}>
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main page component ─────────────────────────────────────────────────────

export default function CompanyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params && params.id

  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [saveState, setSaveState] = useState("idle") // idle | saving | saved
  const [adding, setAdding] = useState(false)
  const [nc, setNc] = useState({ full_name: "", linkedin_url: "", role: "sponsor_contact" })
  const [addBusy, setAddBusy] = useState(false)

  const reload = useCallback(async function(){
    try {
      const r = await fetch(`/api/companies/${id}`)
      const d = await r.json()
      if (d.error) setError(d.error); else setData(d)
    } catch (e) {
      setError(e.message || String(e))
    }
  }, [id])

  useEffect(() => { reload() }, [reload])

  // PATCH the company with one or more fields
  async function patchCompany(patch) {
    setSaveState("saving")
    try {
      const r = await fetch(`/api/companies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const d = await r.json()
      if (d.error) {
        setError(d.error); setSaveState("idle"); return
      }
      setData(prev => ({ ...prev, company: d.company }))
      setSaveState("saved")
      setTimeout(() => setSaveState("idle"), 1500)
    } catch (e) {
      setError(e.message || String(e))
      setSaveState("idle")
    }
  }

  // Save a location (create or update)
  async function saveLocation(loc) {
    setSaveState("saving")
    try {
      if (loc.id) {
        await fetch(`/api/host-locations/${loc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(loc),
        })
      } else {
        await fetch(`/api/host-locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...loc, company_id: id }),
        })
      }
      await reload()
      setSaveState("saved")
      setTimeout(() => setSaveState("idle"), 1500)
    } catch (e) {
      setError(e.message || String(e))
      setSaveState("idle")
    }
  }

  async function deleteLocation(locId) {
    setSaveState("saving")
    try {
      await fetch(`/api/host-locations/${locId}`, { method: "DELETE" })
      await reload()
      setSaveState("saved")
      setTimeout(() => setSaveState("idle"), 1500)
    } catch (e) {
      setError(e.message || String(e))
      setSaveState("idle")
    }
  }

  function addNewLocation() {
    setData(prev => ({
      ...prev,
      locations: [...prev.locations, { id: null, label: "", address_line1: "", neighborhood: "", city: "", state: "CA", zip: "", notes: "" }],
    }))
  }

  async function addContact() {
    const name = nc.full_name.trim()
    if (!name) return
    setAddBusy(true); setSaveState("saving")
    try {
      const r = await fetch(`/api/people/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: name,
          linkedin_url: nc.linkedin_url.trim() || null,
          company_id: id,
          company: data && data.company ? data.company.name : null,
          roles: nc.role ? [nc.role] : [],
          source: "company_page",
        }),
      })
      const d = await r.json()
      if (d.error) { setError(d.error) }
      else { setNc({ full_name: "", linkedin_url: "", role: "sponsor_contact" }); setAdding(false); await reload() }
      setSaveState("saved"); setTimeout(() => setSaveState("idle"), 1500)
    } catch (e) { setError(e.message || String(e)) }
    finally { setAddBusy(false) }
  }

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  const co = data.company
  const backStage = co.sponsor_state || "pool"

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 1000 }}>
      {/* Back link */}
      <Link href={`/pipeline/sponsor/${backStage}`}
        style={{ display: "inline-block", fontSize: 12, color: T.textTertiary, textDecoration: "none", marginBottom: 18 }}>
        ← Sponsor Pipeline · {STAGE_LABEL[backStage]}
      </Link>

      {/* Header — name + stage pill + save indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
        <InlineText
          value={co.name}
          placeholder="Untitled company"
          onSave={name => patchCompany({ name })}
        />
        <StageDropdown
          value={co.sponsor_state || "pool"}
          onChange={s => patchCompany({ sponsor_state: s })}
        />
        <SaveIndicator state={saveState} />
      </div>

      {/* Top metadata row */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
        marginBottom: 28, marginTop: 14,
      }}>
        <FieldLabel text="Category" />
        <SimpleDropdown value={co.sponsor_type} options={CATEGORY_OPTIONS} placeholder="Set category"
          onChange={v => patchCompany({ sponsor_type: v })} />

        <FieldLabel text="Host viable" />
        <SimpleDropdown value={co.host_viable} options={HOST_VIABLE_OPTIONS} placeholder="Unknown"
          onChange={v => patchCompany({ host_viable: v })} />

        <FieldLabel text="Hosting type" />
        <SimpleDropdown value={co.hosting_type} options={HOSTING_TYPE_OPTIONS} placeholder="TBD"
          onChange={v => patchCompany({ hosting_type: v })} />
      </div>

      {/* Notes */}
      <Section title="Notes">
        <NotesField value={co.notes} onSave={notes => patchCompany({ notes })} />
      </Section>

      {/* To-dos */}
      <Section title="To-dos">
        <ProfileTodoCard companyId={co.id} defaultName={co.name} />
      </Section>

      {/* Locations */}
      <Section title={`Locations · ${data.locations.length}`} action={
        <button onClick={addNewLocation}
          style={{ background: "#3b82f6", border: "none", color: "white", padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
          + Add location
        </button>
      }>
        {data.locations.length === 0 ? (
          <div style={{ padding: 18, background: "white", border: "1px dashed " + T.border, borderRadius: 8, color: T.textTertiary, fontSize: 13, textAlign: "center" }}>
            No locations yet. Click <strong>+ Add location</strong> to add one.
          </div>
        ) : data.locations.map(loc => (
          <LocationRow key={loc.id || "new-" + Math.random()} loc={loc}
            onChange={saveLocation} onDelete={deleteLocation} />
        ))}
      </Section>

      {/* Contacts */}
      <Section title={`Contacts · ${data.contacts.length}`} action={
        <button onClick={() => setAdding(a => !a)}
          style={{ background: "#3b82f6", border: "none", color: "white", padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
          {adding ? "Cancel" : "+ Add contact"}
        </button>
      }>
        {adding && (
          <div style={{ background: "white", border: "1px solid " + T.border, borderRadius: 8, padding: 14, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={nc.full_name} onChange={e => setNc({ ...nc, full_name: e.target.value })} placeholder="Full name *" autoFocus
              style={{ padding: "8px 10px", border: "1px solid " + T.border, borderRadius: 6, fontSize: 13, fontFamily: "inherit" }} />
            <input value={nc.linkedin_url} onChange={e => setNc({ ...nc, linkedin_url: e.target.value })} placeholder="LinkedIn URL (optional)"
              style={{ padding: "8px 10px", border: "1px solid " + T.border, borderRadius: 6, fontSize: 13, fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={nc.role} onChange={e => setNc({ ...nc, role: e.target.value })}
                style={{ padding: "8px 10px", border: "1px solid " + T.border, borderRadius: 6, fontSize: 13, fontFamily: "inherit" }}>
                <option value="sponsor_contact">Sponsor</option>
                <option value="cfo">CFO</option>
                <option value="referral_partner">Referral</option>
              </select>
              <button onClick={addContact} disabled={addBusy || !nc.full_name.trim()}
                style={{ background: "#16a34a", border: "none", color: "white", padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: (addBusy || !nc.full_name.trim()) ? "default" : "pointer", opacity: (addBusy || !nc.full_name.trim()) ? 0.6 : 1 }}>
                {addBusy ? "Adding…" : "Add to this company"}
              </button>
            </div>
          </div>
        )}
        {data.contacts.length === 0 ? (
          <div style={{ padding: 18, background: "white", border: "1px dashed " + T.border, borderRadius: 8, color: T.textTertiary, fontSize: 13, textAlign: "center" }}>
            No contacts at this firm yet.
          </div>
        ) : (
          <div style={{ background: "white", border: "1px solid " + T.border, borderRadius: 8, overflow: "hidden" }}>
            {data.contacts.map((p, i) => (
              <Link key={p.id} href={`/people/${p.id}`} style={{ textDecoration: "none", color: T.textPrimary }}>
                <div style={{
                  padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
                  borderBottom: i < data.contacts.length - 1 ? "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)") : "none",
                  cursor: "pointer",
                }}>
                  <Avatar name={p.name} src={p.avatar_url} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: T.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.title || "—"}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>{fmtRel(p.last_touch)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </main>
  )
}

// ─── Small layout helpers ────────────────────────────────────────────────────

function FieldLabel({ text }) {
  return <span style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, marginRight: 4, marginLeft: 4 }}>{text}</span>
}

function Section({ title, action, children }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ fontSize: 13, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, margin: 0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
