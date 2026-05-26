"use client"
import { useState, useEffect, useRef } from "react"
import { T } from "@/lib/pipelineTheme"

// AddPersonModal — used from any page that shows profiles to add a new person.
//
// Props:
//   open: bool — controlled visibility
//   onClose: () => void
//   onAdded: (person) => void — called with { id, full_name, redirect_url } after successful save
//   defaultRoles?: ['cfo' | 'sponsor_contact' | 'referral_partner', ...]   // pre-fills role checkboxes
//
// The modal intentionally has NO default stage — the user must pick where to put the person,
// since manual-add semantics vary (referral = prospect, cold lead = pool, etc.)

const REFERRAL_TYPES = [
  "Sponsor introduction",
  "Member referral",
  "ProVisors",
  "Personal network",
  "Speaking engagement",
  "Other"
]

const CFO_STAGES = ["pool", "audience", "prospect", "qualified", "member"]
const SPONSOR_STAGES = ["pool", "audience", "discovery", "proposal", "active"]

export default function AddPersonModal({ open, onClose, onAdded, defaultRoles }) {
  const [first, setFirst] = useState("")
  const [last, setLast] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [linkedin, setLinkedin] = useState("")
  const [title, setTitle] = useState("")
  const [company, setCompany] = useState("")
  const [location, setLocation] = useState("")
  const [roles, setRoles] = useState(Array.isArray(defaultRoles) && defaultRoles.length ? defaultRoles : ["cfo"])
  const [cfoStage, setCfoStage] = useState("")
  const [sponsorStage, setSponsorStage] = useState("")
  const [notOnLinkedIn, setNotOnLinkedIn] = useState(false)
  const [referrerSearch, setReferrerSearch] = useState("")
  const [referrerResults, setReferrerResults] = useState([])
  const [referrerSelected, setReferrerSelected] = useState(null)   // {id, name, title, company, roles}
  const [referralType, setReferralType] = useState("")
  const [source, setSource] = useState("")
  const [firstNote, setFirstNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Auto-default not_on_linkedin = true when linkedin URL is blank; user can override
  useEffect(function(){
    if (!linkedin.trim() && !notOnLinkedIn) setNotOnLinkedIn(true)
  }, [linkedin])

  // Debounce referrer search
  const searchTimer = useRef(null)
  function handleReferrerSearchChange(v) {
    setReferrerSearch(v)
    setReferrerSelected(null)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (v.trim().length < 2) { setReferrerResults([]); return }
    searchTimer.current = setTimeout(async function() {
      try {
        const r = await fetch(`/api/people/search?q=${encodeURIComponent(v.trim())}`)
        const d = await r.json()
        setReferrerResults(d.results || [])
      } catch(e) { setReferrerResults([]) }
    }, 250)
  }

  function pickReferrer(p) {
    setReferrerSelected(p)
    setReferrerSearch(p.name + (p.company ? " — " + p.company : ""))
    setReferrerResults([])
  }

  function toggleRole(r) {
    if (roles.includes(r)) setRoles(roles.filter(x => x !== r))
    else setRoles(roles.concat([r]))
  }

  function reset() {
    setFirst(""); setLast(""); setEmail(""); setPhone(""); setLinkedin("")
    setTitle(""); setCompany(""); setLocation("")
    setRoles(Array.isArray(defaultRoles) && defaultRoles.length ? defaultRoles : ["cfo"])
    setCfoStage(""); setSponsorStage(""); setNotOnLinkedIn(false)
    setReferrerSearch(""); setReferrerResults([]); setReferrerSelected(null)
    setReferralType(""); setSource(""); setFirstNote(""); setError(null)
  }

  async function save() {
    setError(null)
    if (!first.trim() && !last.trim()) { setError("Name is required"); return }
    if (roles.includes("cfo") && !cfoStage) { setError("Pick a CFO stage"); return }
    if (roles.includes("sponsor_contact") && !sponsorStage) { setError("Pick a sponsor stage"); return }

    setSaving(true)
    try {
      const body = {
        first_name: first.trim(),
        last_name: last.trim(),
        full_name: (first + " " + last).trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        linkedin_url: linkedin.trim() || null,
        title: title.trim() || null,
        company: company.trim() || null,
        location: location.trim() || null,
        roles: roles,
        cfo_state: roles.includes("cfo") ? cfoStage : null,
        sponsor_state: roles.includes("sponsor_contact") ? sponsorStage : null,
        not_on_linkedin: notOnLinkedIn,
        referrer_person_id: referrerSelected ? referrerSelected.id : null,
        referral_type: referrerSelected ? (referralType || "Other") : null,
        source: source.trim() || null,
        first_note: firstNote.trim() || null
      }
      const r = await fetch("/api/people/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || "Save failed"); setSaving(false); return }
      reset()
      setSaving(false)
      onAdded && onAdded(d)
      onClose && onClose()
    } catch(e) {
      setError(e.message || String(e)); setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 40, overflow: "auto" }}>
      <div onClick={function(e){ e.stopPropagation() }} style={{ background: "white", borderRadius: 14, maxWidth: 720, width: "calc(100vw - 32px)", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>

        <div style={{ padding: "20px 24px", borderBottom: "1px solid " + T.borderSoft, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Add person</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: T.textTertiary, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "20px 24px", maxHeight: "75vh", overflow: "auto" }}>

          {error && (
            <div style={{ background: T.dangerBg, border: "1px solid " + T.danger, borderRadius: 8, padding: "10px 14px", color: T.danger, marginBottom: 16, fontSize: 13 }}>
              ⚠ {error}
            </div>
          )}

          {/* Identity */}
          <SectionLabel>Identity</SectionLabel>
          <Row>
            <Field label="First name *" value={first} onChange={setFirst} placeholder="Bob" />
            <Field label="Last name" value={last} onChange={setLast} placeholder="Smith" />
          </Row>
          <Row>
            <Field label="Title" value={title} onChange={setTitle} placeholder="Chief Financial Officer" />
            <Field label="Company" value={company} onChange={setCompany} placeholder="Acme Corp" />
          </Row>
          <Row>
            <Field label="Email" value={email} onChange={setEmail} placeholder="bob@acme.com" />
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="optional" />
          </Row>
          <Row>
            <Field label="LinkedIn URL" value={linkedin} onChange={setLinkedin} placeholder="https://www.linkedin.com/in/..." />
            <Field label="Location" value={location} onChange={setLocation} placeholder="Los Angeles, CA" />
          </Row>

          <div style={{ marginTop: 10, marginBottom: 18 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={notOnLinkedIn} onChange={function(e){ setNotOnLinkedIn(e.target.checked) }} />
              <span>Not yet connected on LinkedIn (sets <code>not_on_linkedin</code> status tag — auto-cleared when LinkedIn handshake happens)</span>
            </label>
          </div>

          {/* Role + Stage */}
          <SectionLabel>Role &amp; Stage</SectionLabel>
          <div style={{ display: "flex", gap: 18, marginBottom: 14, fontSize: 13 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={roles.includes("cfo")} onChange={function(){ toggleRole("cfo") }} /> CFO
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={roles.includes("sponsor_contact")} onChange={function(){ toggleRole("sponsor_contact") }} /> Sponsor contact
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={roles.includes("referral_partner")} onChange={function(){ toggleRole("referral_partner") }} /> Referral partner
            </label>
          </div>

          {roles.includes("cfo") && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, marginBottom: 6 }}>CFO stage *</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {CFO_STAGES.map(function(s){
                  const active = cfoStage === s
                  return (
                    <button key={s} type="button" onClick={function(){ setCfoStage(s) }} style={{ padding: "6px 14px", fontSize: 13, borderRadius: 6, border: "1px solid " + (active ? T.accent : T.border), background: active ? T.accent : "white", color: active ? "white" : T.textPrimary, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>{s}</button>
                  )
                })}
              </div>
            </div>
          )}

          {roles.includes("sponsor_contact") && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, marginBottom: 6 }}>Sponsor stage *</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {SPONSOR_STAGES.map(function(s){
                  const active = sponsorStage === s
                  return (
                    <button key={s} type="button" onClick={function(){ setSponsorStage(s) }} style={{ padding: "6px 14px", fontSize: 13, borderRadius: 6, border: "1px solid " + (active ? T.accent : T.border), background: active ? T.accent : "white", color: active ? "white" : T.textPrimary, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>{s}</button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Referral */}
          <SectionLabel>Referral source (optional)</SectionLabel>
          <div style={{ position: "relative", marginBottom: referrerSelected ? 14 : 8 }}>
            <Field label="Referred by" value={referrerSearch} onChange={handleReferrerSearchChange} placeholder="Search anyone in PeerChair…" inline />
            {referrerResults.length > 0 && !referrerSelected && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid " + T.border, borderRadius: 6, boxShadow: "0 8px 16px rgba(0,0,0,0.08)", marginTop: 2, maxHeight: 260, overflow: "auto", zIndex: 10 }}>
                {referrerResults.map(function(p){
                  return (
                    <div key={p.id} onClick={function(){ pickReferrer(p) }} style={{ padding: "8px 12px", borderBottom: "1px solid " + T.borderSoft, cursor: "pointer", fontSize: 13 }}>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: T.textTertiary }}>
                        {p.title || ""}{p.title && p.company ? " · " : ""}{p.company || ""}
                        {p.roles && p.roles.length ? <span style={{ marginLeft: 8, color: T.textSecondary }}>[{p.roles.join(", ")}]</span> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {referrerSelected && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, marginBottom: 6 }}>Referral type</div>
              <select value={referralType} onChange={function(e){ setReferralType(e.target.value) }} style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", background: "white" }}>
                <option value="">— pick a type —</option>
                {REFERRAL_TYPES.map(function(t){ return <option key={t} value={t}>{t}</option> })}
              </select>
            </div>
          )}

          {/* Source + Note */}
          <SectionLabel>Bookkeeping (optional)</SectionLabel>
          <Field label="Source label" value={source} onChange={setSource} placeholder={`manual-add-${new Date().toISOString().slice(0,10)}`} />
          <div style={{ marginTop: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, marginBottom: 6 }}>First note (logged to activity timeline)</div>
            <textarea value={firstNote} onChange={function(e){ setFirstNote(e.target.value) }} placeholder="e.g. Met at ProVisors Westside meeting May 22. Interested in joining."
              style={{ width: "100%", minHeight: 80, padding: 10, fontSize: 13, lineHeight: 1.4, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid " + T.borderSoft, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: "8px 16px", background: "white", color: T.textPrimary, border: "1px solid " + T.border, borderRadius: 6, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "8px 18px", background: T.accent, color: "white", border: "none", borderRadius: 6, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 500 }}>
            {saving ? "Saving…" : "Add person"}
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12, marginTop: 6 }}>{children}</div>
}
function Field({ label, value, onChange, placeholder, inline }) {
  return (
    <div style={{ flex: 1, marginBottom: inline ? 0 : 12 }}>
      <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <input type="text" value={value} onChange={function(e){ onChange(e.target.value) }} placeholder={placeholder}
        style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none", background: "white", boxSizing: "border-box" }} />
    </div>
  )
}
function Row({ children }) {
  return <div style={{ display: "flex", gap: 12 }}>{children}</div>
}
