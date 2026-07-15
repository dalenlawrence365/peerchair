"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"
import Avatar from "@/components/Avatar"

// Fit Call Companion — live script + firmographics capture for a CFO fit call.
// Saves everything as a structured note to the person's timeline and advances
// the stage based on outcome. Reuses /api/people/[id] + /api/people/[id]/action.

const SCRIPT = [
  { id: "open", label: "Opening", tag: "INTRO",
    prompt: "Thanks for making time, {name}. I'll keep this to about 15 minutes — understand your world, share what CFO Circle is, and we both decide if it makes sense to go further. Sound good?" },
  { id: "co", label: "Company Context", tag: "FIRMOGRAPHIC",
    prompt: "Before I get into CFO Circle — tell me a bit about your company. Roughly what revenue range are you in, how large is the team, and how long have you been in the seat there?",
    fallback: "Is the company privately held? PE-backed? CFO Circle is built specifically for privately held environments — quite different dynamics from public companies." },
  { id: "q1", label: "The One Question", tag: "QUALIFY",
    prompt: "What's one challenge you're carrying right now that you can't fully discuss with your CEO, board, or team — but you wish you had a trusted group of CFO peers to help you think through?",
    fallback: "Which category has created the most pressure in the past 30 days: cash flow, forecasting, leadership accountability, talent, systems, or managing up?" },
  { id: "menu", label: "Pressure Menu", tag: "PRESSURE",
    prompt: "Cash and working capital, forecasting and KPIs, leadership accountability, talent and staffing, systems and reporting, managing up with the CEO and board — which of those is loudest right now?",
    fallback: "If you had a room of high-caliber CFOs for 60 minutes — what topic would you most want to bring?" },
  { id: "ai", label: "AI Probe", tag: "AI",
    prompt: "A lot of CFOs I speak with carry a quiet concern about AI — not just the tools, but what it means for their team and role, and whether they're moving fast enough. Is that on your radar?" },
  { id: "screen", label: "Red Flag Screen", tag: "SCREENING",
    prompt: "CFO Circle is curated — 10 to 14 members — and quality depends on everyone showing up and contributing. The members who get the most lean in with real issues. Does that kind of peer accountability feel like something you'd embrace?",
    fallback: "I ask because some people are looking for networking, which is valid — but CFO Circle is issue-based, not connection-based." },
  { id: "commit", label: "Commitment", tag: "CLOSE",
    prompt: "CFO Circle meets once a month for three hours. Does that kind of consistent monthly commitment feel realistic for where you are right now?" },
  { id: "pricing", label: "If Asked: Cost", tag: "CONTEXTUAL",
    prompt: "Membership is $500/month, $1,500/quarter, or $6,000 annually. Annual members receive a complimentary 13th month. Most members expense this as executive development." },
  { id: "close", label: "Closing", tag: "INVITE",
    prompt: "Based on what you've shared — I think you'd be a strong fit. The next step is the Experience Event — a live sample of what a CFO Circle meeting looks like. Would you be open to attending?",
    fallback: "I can also share our 8 Key Drivers of CFO Success Assessment — 15 minutes, gives you a personalized report on where to focus next." },
]

const REV = ["Under $10M", "$10M-$20M", "$20M-$50M", "$50M-$100M", "$100M-$250M", "Over $250M"]
const EMP = ["Under 50", "50-200", "201-500", "501-1,000", "Over 1,000"]
const FIN_TEAM = ["Solo (CFO only)", "2-3", "4-6", "7-10", "11-20", "Over 20"]
const OWN = ["Privately Held", "PE-Backed", "Founder-Led", "Family-Owned", "Public", "Non-Profit"]
const RPT = ["CEO", "Owner / Founder", "Board", "President / COO"]
const IND = ["Entertainment / Media", "Technology", "Real Estate", "Healthcare", "Manufacturing", "Professional Services", "Financial Services", "Consumer / Retail", "Construction", "Non-Profit", "Other"]
const PRESSURE = ["Cash & working capital", "Forecasting & KPIs", "Leadership accountability", "Talent & staffing", "Systems & reporting", "Managing up (CEO/Board)", "AI readiness & finance transformation"]
const CUES = ["Will commit the time", "Isolation / lonely in the seat", "Wants to elevate to strategic", "Complexity outpacing systems", "Managing-up pressure", "PE / investor pressure", "Transaction / exit planning", "Talent gaps in finance", "KPI & forecasting discipline", "Reactive decision making"]
const FLAGS = ["Concerned about cost", "Won't commit to participation", "Sales intent / wants to pitch", "Dominant ego / knows-it-all", "Uncomfortable w/ confidentiality", "Not primary finance exec", "Company too small or large"]
const OUTCOMES = [
  { v: "strong_fit", l: "Strong Fit", c: "#16a34a", state: "qualified" },
  { v: "possible_fit", l: "Possible Fit", c: "#d97706", state: "prospect" },
  { v: "bad_timing", l: "Bad Timing", c: "#ea580c", state: "prospect" },
  { v: "not_a_fit", l: "Not a Fit", c: "#dc2626", state: "prospect" },
  { v: "no_show", l: "No Show", c: "#6b7280", state: "prospect" },
]

export default function FitCallPage() {
  const { id } = useParams()
  const [person, setPerson] = useState(null)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Capture state
  const [f, setF] = useState({ rev: "", emp: "", fin: "", own: "", rpt: "", ind: "" })
  const [pressure, setPressure] = useState([])
  const [cues, setCues] = useState([])
  const [flags, setFlags] = useState([])
  const [outcome, setOutcome] = useState("")
  const [stage, setStage] = useState("")
  const [notes, setNotes] = useState("")
  const [done, setDone] = useState({})

  useEffect(function(){
    if (!id) return
    fetch(`/api/people/${id}`).then(r => r.json()).then(function(d){
      if (d.error) setError(d.error)
      else {
        setPerson(d.person)
        // Prefill from any existing firmographics so a re-do doesn't start blank
        const fg = d.person && d.person.firmographics
        if (fg) {
          setF({ rev: fg.revenue || "", emp: fg.employees || "", fin: fg.finance_team || "", own: fg.ownership || "", rpt: fg.reports_to || "", ind: fg.industry || "" })
          if (Array.isArray(fg.pressure_points)) setPressure(fg.pressure_points)
          if (Array.isArray(fg.buying_cues)) setCues(fg.buying_cues)
          if (Array.isArray(fg.red_flags)) setFlags(fg.red_flags)
        }
        if (d.person && d.person.cfo_state) setStage(d.person.cfo_state)
      }
    }).catch(e => setError(e.message || String(e)))
  }, [id])

  function toggle(list, setList, val) {
    setList(list.indexOf(val) >= 0 ? list.filter(x => x !== val) : [...list, val])
  }

  const firstName = person ? (person.first_name || (person.full_name || "").split(" ")[0] || "there") : "there"

  async function save() {
    setSaving(true)
    const oc = OUTCOMES.find(o => o.v === outcome)
    const today = new Date().toISOString().slice(0, 10)
    const firmoRaw = {
      revenue: f.rev, employees: f.emp, finance_team: f.fin,
      ownership: f.own, reports_to: f.rpt, industry: f.ind,
      pressure_points: pressure, buying_cues: cues, red_flags: flags,
      last_fit_call: today, last_outcome: outcome || null, notes: notes || null,
    }
    // Keep only populated values so the structured record stays clean (no empty-string keys).
    const firmographics = {}
    Object.keys(firmoRaw).forEach(function(k){
      const v = firmoRaw[k]
      if (v === null || v === undefined) return
      if (typeof v === "string" && v.trim() === "") return
      if (Array.isArray(v) && v.length === 0) return
      firmographics[k] = v
    })
    const noteBody =
      `FIT CALL — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}\n` +
      `Outcome: ${oc ? oc.l : "(not set)"}${stage ? ` · Stage set to: ${stage}` : ""}\n\n` +
      `FIRMOGRAPHICS\n` +
      `· Revenue: ${f.rev || "—"}\n· Employees: ${f.emp || "—"}\n· Finance team: ${f.fin || "—"}\n` +
      `· Ownership: ${f.own || "—"}\n· Reports to: ${f.rpt || "—"}\n· Industry: ${f.ind || "—"}\n\n` +
      `PRESSURE POINTS: ${pressure.join(", ") || "—"}\n` +
      `BUYING CUES: ${cues.join(", ") || "—"}\n` +
      `RED FLAGS: ${flags.join(", ") || "—"}\n\n` +
      `NOTES\n${notes || "—"}`
    try {
      // 1. Structured firmographics (so the profile can display them)
      await fetch(`/api/people/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_firmographics", firmographics, source: "self_reported" }) })
      // 2. Timeline note (human-readable narrative)
      await fetch(`/api/people/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "note", body: noteBody }) })
      // 3. Stage — explicit choice wins; fall back to the outcome default
      const targetStage = stage || (oc && oc.state)
      if (targetStage) {
        await fetch(`/api/people/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_state", role: "cfo", state: targetStage }) })
      }
      // 4. Completed — ACTION tag (audit event), runs supersession to consume the
      //    fit_call_scheduled tag. Must NOT be a status tag, or it skips supersession.
      const _t = new Date()
      const asofDate = `${_t.getFullYear()}-${String(_t.getMonth()+1).padStart(2,"0")}-${String(_t.getDate()).padStart(2,"0")}`
      await fetch(`/api/people/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "action_tag", action_type: "fit_call_completed", as_of_date: asofDate, notes: oc ? oc.l : null }) })
      setSaved(true)
    } catch(e) { setError(e.message || String(e)) }
    setSaving(false)
  }

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!person) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading fit call…</div></main>

  return (
    <main style={{ padding: "20px 28px 80px", maxWidth: 1280 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Avatar name={person.full_name} src={person.avatar_url} size={52} />
          <div>
            <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.6 }}>Fit Call</div>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: "2px 0 0" }}>{person.full_name}</h1>
            <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 2 }}>{[person.title, person.company].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {person.linkedin_url && <a href={person.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, padding: "7px 12px", borderRadius: 6, background: "#0a66c2", color: "white", textDecoration: "none", fontWeight: 500 }}>LinkedIn ↗</a>}
          <Link href={`/people/${person.id}`} style={{ fontSize: 12, padding: "7px 12px", borderRadius: 6, border: "1px solid " + T.border, color: T.textPrimary, textDecoration: "none", fontWeight: 500 }}>Profile →</Link>
        </div>
      </div>

      {saved && (
        <div style={{ background: "#dcfce7", color: "#166534", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
          ✓ Fit call saved to {person.full_name}&apos;s profile. <Link href={`/people/${person.id}`} style={{ color: "#166534", fontWeight: 600 }}>View profile →</Link>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 20, alignItems: "start" }}>
        {/* LEFT — Script */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Script</div>
          {SCRIPT.map(function(s, i){
            const isDone = done[s.id]
            return (
              <div key={s.id} onClick={function(){ setDone(Object.assign({}, done, { [s.id]: !isDone })) }}
                style={{ background: T.cardBg, border: "1px solid " + (isDone ? "#86efac" : T.border), borderLeft: "3px solid " + (isDone ? "#16a34a" : "#3b82f6"), borderRadius: 10, padding: "12px 14px", marginBottom: 8, cursor: "pointer", opacity: isDone ? 0.6 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "#eff6ff", color: "#1e40af", fontWeight: 600, letterSpacing: 0.4 }}>{s.tag}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>{i + 1}. {s.label}</span>
                  {isDone && <span style={{ fontSize: 11, color: "#16a34a", marginLeft: "auto" }}>✓ covered</span>}
                </div>
                <div style={{ fontSize: 14, color: T.textPrimary, lineHeight: 1.55 }}>{s.prompt.replace("{name}", firstName)}</div>
                {s.fallback && <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 6, paddingTop: 6, borderTop: "1px dashed " + T.border, fontStyle: "italic" }}>↳ {s.fallback}</div>}
              </div>
            )
          })}
        </div>

        {/* RIGHT — Capture */}
        <div style={{ position: "sticky", top: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Firmographics</div>
          <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <Sel label="Revenue" opts={REV} val={f.rev} on={v => setF(Object.assign({}, f, { rev: v }))} />
            <Sel label="Employees" opts={EMP} val={f.emp} on={v => setF(Object.assign({}, f, { emp: v }))} />
            <Sel label="Finance team" opts={FIN_TEAM} val={f.fin} on={v => setF(Object.assign({}, f, { fin: v }))} />
            <Sel label="Ownership" opts={OWN} val={f.own} on={v => setF(Object.assign({}, f, { own: v }))} />
            <Sel label="Reports to" opts={RPT} val={f.rpt} on={v => setF(Object.assign({}, f, { rpt: v }))} />
            <Sel label="Industry" opts={IND} val={f.ind} on={v => setF(Object.assign({}, f, { ind: v }))} last />
          </div>

          <ChipGroup title="Pressure points" opts={PRESSURE} sel={pressure} on={v => toggle(pressure, setPressure, v)} color="#3b82f6" />
          <ChipGroup title="Buying cues" opts={CUES} sel={cues} on={v => toggle(cues, setCues, v)} color="#16a34a" />
          <ChipGroup title="Red flags" opts={FLAGS} sel={flags} on={v => toggle(flags, setFlags, v)} color="#dc2626" />

          <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 8px" }}>Outcome</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {OUTCOMES.map(function(o){
              const on = outcome === o.v
              return <div key={o.v} onClick={function(){ setOutcome(o.v); if (o.state) setStage(o.state) }} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (on ? o.c : T.border), background: on ? o.c : "white", color: on ? "white" : T.textSecondary, fontWeight: on ? 600 : 400 }}>{o.l}</div>
            })}
          </div>

          {/* Explicit stage — defaults from outcome, but you can override.
              (e.g. Possible Fit but still qualify her for an Experience Event) */}
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, margin: "4px 0 6px" }}>Move to stage</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {["prospect", "qualified", "member"].map(function(s){
              const on = stage === s
              return <div key={s} onClick={function(){ setStage(s) }} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, cursor: "pointer", border: "1px solid " + (on ? "#2563eb" : T.border), background: on ? "#2563eb" : "white", color: on ? "white" : T.textSecondary, fontWeight: on ? 600 : 400, textTransform: "capitalize" }}>{s}</div>
            })}
          </div>

          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Free-form call notes…" rows={4}
            style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 8, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: 12 }} />

          <button onClick={save} disabled={saving} style={{ width: "100%", padding: "12px", fontSize: 14, fontWeight: 600, borderRadius: 8, border: "none", background: saving ? "#94a3b8" : "#16a34a", color: "white", cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Saving…" : "Save fit call to profile"}
          </button>
        </div>
      </div>
    </main>
  )
}

function Sel({ label, opts, val, on, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: last ? 0 : 8 }}>
      <div style={{ fontSize: 12, color: T.textSecondary, width: 96, flexShrink: 0 }}>{label}</div>
      <select value={val} onChange={e => on(e.target.value)} style={{ flex: 1, padding: "6px 8px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", background: "white", outline: "none" }}>
        <option value="">—</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function ChipGroup({ title, opts, sel, on, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, margin: "8px 0 6px" }}>{title}</div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {opts.map(function(o){
          const on_ = sel.indexOf(o) >= 0
          return <div key={o} onClick={function(){ on(o) }} style={{ fontSize: 12, padding: "4px 9px", borderRadius: 6, cursor: "pointer", border: "1px solid " + (on_ ? color : T.border), background: on_ ? color + "15" : "white", color: on_ ? color : T.textSecondary }}>{o}</div>
        })}
      </div>
    </div>
  )
}
