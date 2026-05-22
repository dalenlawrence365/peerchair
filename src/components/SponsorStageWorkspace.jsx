"use client"
import { useEffect, useState, useMemo, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { sbFetch } from "@/lib/appShared"
import { T, FONT_FAMILY, FONT_SERIF } from "@/lib/pipelineTheme"

// ─── Constants ────────────────────────────────────────────────────────────────
const STAGE_CONFIG = {
  pool:      { label: "Pool",      desc: "Identified targets, no contact yet",        bg: T.poolBg,      color: T.poolText,     accent: "#94a3b8" },
  audience:  { label: "Audience",  desc: "Gateway connected, awareness building",     bg: T.audienceBg,  color: T.audienceText, accent: "#3b82f6" },
  discovery: { label: "Discovery", desc: "Active conversation in motion",             bg: T.prospectBg,  color: T.prospectText, accent: "#ec4899" },
  proposal:  { label: "Proposal",  desc: "Offer extended, decision pending",          bg: T.qualifiedBg, color: T.qualifiedText,accent: "#d97706" },
  active:    { label: "Active",    desc: "Signed sponsor, engaged with the chapter",  bg: T.memberBg,    color: T.memberText,   accent: "#16a34a" },
}
const STAGES = ["pool", "audience", "discovery", "proposal", "active"]

const HOST_VIABLE_OPTIONS = ["Yes", "No", "Unknown"]
const HOSTING_TYPE_OPTIONS = ["Presentation", "Meeting Host", "Either", "N/A", "TBD"]
const SPONSOR_TYPE_OPTIONS = ["Accounting/Advisory", "Law Firm", "Commercial Banking", "Insurance", "HR/Payroll", "Consulting", "Wealth Management", "Other"]

// ─── Main component ───────────────────────────────────────────────────────────
export default function SponsorStageWorkspace({ stage }) {
  var router = useRouter()
  var searchParams = useSearchParams()

  var [allDeals, setAllDeals] = useState([])
  var [allSponsorCompanies, setAllSponsorCompanies] = useState([])
  var [stageCompanies, setStageCompanies] = useState([])
  var [primaryPersonsById, setPrimaryPersonsById] = useState({})
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState(null)

  // Selected company state (synced to URL via ?company=<id>)
  var initialCompanyId = searchParams ? searchParams.get("company") : null
  var [selectedCompanyId, setSelectedCompanyId] = useState(initialCompanyId)
  var [workbench, setWorkbench] = useState(null)
  var [workbenchLoading, setWorkbenchLoading] = useState(false)

  useEffect(function() { loadStageData() }, [stage])
  useEffect(function() {
    if (selectedCompanyId) loadWorkbench(selectedCompanyId)
    else setWorkbench(null)
  }, [selectedCompanyId])

  async function loadStageData() {
    setLoading(true); setError(null)
    try {
      var deals = await sbFetch("/sponsor_deals?select=id,stage,chapter,company_id,primary_person_id,annual_fee,lost_reason,host_assignment,discovery_date")
      setAllDeals(deals)

      // All sponsor companies (for tile metrics)
      var allCos = await sbFetch("/companies?is_sponsor=eq.true&select=id,name,sponsor_type,host_viable,hosting_type,city,state,neighborhood_la,neighborhood_sfv,is_sponsor")
      setAllSponsorCompanies(allCos)
      var coById = {}; allCos.forEach(function(c){ coById[c.id] = c })

      // Companies at this stage (via deals with this stage)
      var stageDealRows = deals.filter(function(d){ return d.stage === stage })
      var stageCoIds = Array.from(new Set(stageDealRows.map(function(d){return d.company_id}).filter(Boolean)))
      var stageList = stageCoIds.map(function(cid){ return coById[cid] }).filter(Boolean)
      stageList.sort(function(a,b){ return (a.name || "").localeCompare(b.name || "") })
      setStageCompanies(stageList)

      // Primary persons for stage deals (for left-list line 2 if needed later)
      var personIds = Array.from(new Set(stageDealRows.map(function(d){return d.primary_person_id}).filter(Boolean)))
      if (personIds.length > 0) {
        var ppl = await sbFetch("/people?id=in.(" + personIds.join(",") + ")&select=id,full_name,first_name,last_name,title,linkedin_url")
        var pMap = {}; ppl.forEach(function(p){ pMap[p.id] = p })
        setPrimaryPersonsById(pMap)
      } else {
        setPrimaryPersonsById({})
      }
    } catch(err) {
      setError(err.message || String(err))
    }
    setLoading(false)
  }

  async function loadWorkbench(companyId) {
    setWorkbenchLoading(true)
    try {
      var coRows = await sbFetch("/companies?id=eq." + companyId + "&select=*")
      var company = (coRows || [])[0]
      var dealRows = await sbFetch("/sponsor_deals?company_id=eq." + companyId + "&select=*&order=discovery_date.desc.nullslast")
      var gateways = await sbFetch("/people?company_id=eq." + companyId + "&select=id,full_name,first_name,last_name,title,email,linkedin_url,roles,sponsor_state,last_meaningful_touch")
      var gatewayIds = gateways.map(function(p){ return p.id })
      var contactIds = gatewayIds // person.id === contact.id per Phase 3 trigger
      var comms = []
      if (contactIds.length > 0) {
        comms = await sbFetch("/communications?contact_id=in.(" + contactIds.join(",") + ")&select=id,contact_id,channel,direction,body,occurred_at,step_label&order=occurred_at.desc&limit=50")
      }
      setWorkbench({ company, deals: dealRows, gateways, communications: comms })
    } catch(err) {
      setError(err.message || String(err))
    }
    setWorkbenchLoading(false)
  }

  function handleSelectCompany(companyId) {
    setSelectedCompanyId(companyId)
    var url = new URL(window.location.href)
    if (companyId) url.searchParams.set("company", companyId)
    else url.searchParams.delete("company")
    window.history.replaceState({}, "", url.toString())
  }

  function updateCompanyField(field, value) {
    if (!workbench || !workbench.company) return Promise.resolve()
    var body = {}
    body[field] = value
    return sbFetch("/companies?id=eq." + workbench.company.id, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then(function() {
      setWorkbench(function(prev){
        if (!prev) return prev
        var newCo = Object.assign({}, prev.company); newCo[field] = value
        return Object.assign({}, prev, { company: newCo })
      })
      // Also update in stage list if visible
      setStageCompanies(function(prev){
        return prev.map(function(c){
          if (c.id !== workbench.company.id) return c
          var nc = Object.assign({}, c); nc[field] = value; return nc
        })
      })
      setAllSponsorCompanies(function(prev){
        return prev.map(function(c){
          if (c.id !== workbench.company.id) return c
          var nc = Object.assign({}, c); nc[field] = value; return nc
        })
      })
    })
  }

  // Derived: stage counts
  var counts = useMemo(function() {
    var c = {}
    STAGES.forEach(function(s){ c[s] = 0 })
    allDeals.forEach(function(d){ if (c[d.stage] !== undefined) c[d.stage]++ })
    return c
  }, [allDeals])

  // Derived: tile metrics
  var tiles = useMemo(function() {
    var totalPool = allSponsorCompanies.length
    var activeDeals = allDeals.filter(function(d){ return d.stage === "discovery" || d.stage === "proposal" }).length
    var hostViable = allSponsorCompanies.filter(function(c){ return c.host_viable === "Yes" }).length
    var signed = allDeals.filter(function(d){ return d.stage === "active" }).length
    var withGateway = new Set(allDeals.filter(function(d){return d.primary_person_id}).map(function(d){return d.company_id}))
    var missingGateway = allSponsorCompanies.filter(function(c){ return !withGateway.has(c.id) }).length
    var categoriesCovered = new Set(allSponsorCompanies.filter(function(c){return c.sponsor_type}).map(function(c){return c.sponsor_type})).size
    return [
      { label: "Total sponsor pool",     value: totalPool,        delta: null, tone: "neutral" },
      { label: "Active deals",           value: activeDeals,      delta: null, tone: "active",  hint: "Discovery + Proposal" },
      { label: "Host-viable",            value: hostViable,       delta: null, tone: "success", hint: "Can host events" },
      { label: "Signed sponsors",        value: signed,           delta: null, tone: "success" },
      { label: "Missing gateway",        value: missingGateway,   delta: null, tone: missingGateway > 5 ? "warn" : "neutral", hint: "No contact at company" },
      { label: "Stale (60+ days)",       value: "—",              delta: null, tone: "neutral", hint: "Activity rollup TBD" },
      { label: "Categories covered",     value: categoriesCovered,delta: null, tone: "neutral", hint: "Of 8 categories" },
      { label: "Avg time to signed",     value: "—",              delta: null, tone: "neutral", hint: "TBD" },
    ]
  }, [allSponsorCompanies, allDeals])

  return (
    <main style={{ padding: "24px 28px 32px", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Breadcrumb stage={stage} />

      <TileStrip tiles={tiles} loading={loading} />
      <FunnelCards counts={counts} activeStage={stage} />

      {error && (
        <div style={{ background: T.dangerBg, border: "1px solid " + T.danger, borderRadius: 10, padding: "12px 16px", color: T.danger, marginBottom: 16, fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 500 }}>
        <CompanyListPane
          stage={stage}
          companies={stageCompanies}
          primaryPersonsById={primaryPersonsById}
          allDeals={allDeals}
          selectedId={selectedCompanyId}
          onSelect={handleSelectCompany}
          loading={loading}
        />
        <CompanyWorkbench
          companyId={selectedCompanyId}
          workbench={workbench}
          loading={workbenchLoading}
          onUpdate={updateCompanyField}
          onClose={function(){ handleSelectCompany(null) }}
        />
      </div>
    </main>
  )
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────
function Breadcrumb({ stage }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.textTertiary, marginBottom: 14 }}>
      <Link href="/" style={{ color: T.textTertiary, textDecoration: "none" }}>Dashboard</Link>
      <span>›</span>
      <Link href="/pipeline/sponsor/pool" style={{ color: T.textTertiary, textDecoration: "none" }}>Sponsors</Link>
      <span>›</span>
      <span style={{ color: T.textPrimary }}>{STAGE_CONFIG[stage]?.label || stage}</span>
    </div>
  )
}

// ─── Tile strip ───────────────────────────────────────────────────────────────
function TileStrip({ tiles, loading }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10, marginBottom: 14 }}>
      {tiles.map(function(t, i){
        var toneStyle = {
          neutral: { color: T.textPrimary },
          success: { color: T.success },
          warn:    { color: T.warning },
          active:  { color: T.accent },
        }[t.tone] || { color: T.textPrimary }
        return (
          <div key={i} style={{
            background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10,
            padding: "12px 14px", minHeight: 76,
          }}>
            <div style={{ fontSize: 10, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500, lineHeight: 1.3, minHeight: 26 }}>
              {t.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1, letterSpacing: -0.4, color: toneStyle.color, marginTop: 4 }}>
              {loading ? "…" : t.value}
            </div>
            {t.hint && <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 4, lineHeight: 1.3 }}>{t.hint}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Funnel cards ─────────────────────────────────────────────────────────────
function FunnelCards({ counts, activeStage }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 18 }}>
      {STAGES.map(function(s){
        var cfg = STAGE_CONFIG[s]
        var isActive = s === activeStage
        var count = counts[s] || 0
        return (
          <Link
            key={s}
            href={"/pipeline/sponsor/" + s}
            style={{
              background: isActive ? cfg.bg : T.cardBg,
              border: "1px solid " + (isActive ? cfg.accent : T.border),
              borderRadius: 10,
              padding: "14px 16px",
              textDecoration: "none",
              display: "block",
              transition: "all 0.15s",
              position: "relative",
              boxShadow: isActive ? "0 0 0 2px " + cfg.accent + "20" : "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: isActive ? cfg.color : T.textSecondary }}>{cfg.label}</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1, letterSpacing: -0.5, color: isActive ? cfg.color : T.textPrimary, marginBottom: 4 }}>
              {count}
            </div>
            <div style={{ fontSize: 11, color: T.textTertiary, lineHeight: 1.3 }}>{cfg.desc}</div>
          </Link>
        )
      })}
    </div>
  )
}

// ─── Left list pane ───────────────────────────────────────────────────────────
function CompanyListPane({ stage, companies, primaryPersonsById, allDeals, selectedId, onSelect, loading }) {
  // Build company→primary person map via deals at current stage
  var personByCoId = useMemo(function(){
    var m = {}
    allDeals.filter(function(d){return d.stage === stage}).forEach(function(d){
      if (d.primary_person_id && primaryPersonsById[d.primary_person_id]) {
        m[d.company_id] = primaryPersonsById[d.primary_person_id]
      }
    })
    return m
  }, [allDeals, stage, primaryPersonsById])

  return (
    <div style={{
      width: 380, flexShrink: 0,
      background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid " + T.border, fontSize: 12, color: T.textSecondary, fontWeight: 500 }}>
        {loading ? "Loading…" : companies.length + " companies at " + (STAGE_CONFIG[stage]?.label || stage)}
      </div>
      <div style={{ overflow: "auto", flex: 1 }}>
        {companies.length === 0 && !loading && (
          <div style={{ padding: 32, textAlign: "center", color: T.textTertiary, fontSize: 12 }}>
            No companies at this stage.
          </div>
        )}
        {companies.map(function(c){
          var isSelected = c.id === selectedId
          var person = personByCoId[c.id]
          return (
            <div
              key={c.id}
              onClick={function(){ onSelect(c.id) }}
              style={{
                padding: "9px 14px",
                borderBottom: "1px solid " + T.borderSoft,
                cursor: "pointer",
                background: isSelected ? T.bg : "transparent",
                borderLeft: isSelected ? "3px solid " + T.accent : "3px solid transparent",
              }}
              onMouseEnter={function(e){ if (!isSelected) e.currentTarget.style.background = "#fafbfc" }}
              onMouseLeave={function(e){ if (!isSelected) e.currentTarget.style.background = "transparent" }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.name}
              </div>
              <div style={{ fontSize: 11, color: T.textTertiary, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
                  {c.sponsor_type ? c.sponsor_type : <span style={{ fontStyle: "italic" }}>uncategorized</span>}
                  {(c.neighborhood_la || c.city) && <span> · {c.neighborhood_la || c.city}</span>}
                </span>
                <HostDot value={c.host_viable} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HostDot({ value }) {
  var spec = value === "Yes" ? { color: T.success, title: "Host viable" }
           : value === "No"  ? { color: T.textTertiary, title: "Won't host" }
           :                   { color: "transparent", border: T.border, title: "Host: TBD" }
  return (
    <span title={spec.title} style={{
      display: "inline-block", width: 8, height: 8, borderRadius: 999,
      background: spec.color,
      border: spec.border ? "1.5px dashed " + spec.border : "none",
      flexShrink: 0,
    }} />
  )
}

// ─── Right workbench pane ─────────────────────────────────────────────────────
function CompanyWorkbench({ companyId, workbench, loading, onUpdate, onClose }) {
  if (!companyId) {
    return (
      <div style={{ flex: 1, background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: T.textTertiary, fontSize: 13 }}>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>◇</div>
          <div style={{ fontWeight: 500, color: T.textSecondary, marginBottom: 4 }}>Select a company</div>
          <div>Click any row on the left to open its workbench.</div>
        </div>
      </div>
    )
  }
  if (loading || !workbench) {
    return (
      <div style={{ flex: 1, background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 40, textAlign: "center", color: T.textTertiary, fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  var c = workbench.company

  return (
    <div style={{ flex: 1, background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, overflow: "auto", minWidth: 0 }}>
      {/* Header */}
      <div style={{ padding: "18px 22px", borderBottom: "1px solid " + T.border, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: T.textPrimary, marginBottom: 4, letterSpacing: -0.3 }}>{c.name}</div>
          <div style={{ fontSize: 12, color: T.textSecondary, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {c.sponsor_type && <span>{c.sponsor_type}</span>}
            {c.industry && c.industry !== c.sponsor_type && <span>· {c.industry}</span>}
            {c.city && <span>· {c.city}, {c.state}</span>}
            {!c.is_sponsor && <span style={{ background: T.bg, color: T.textTertiary, padding: "2px 7px", borderRadius: 4, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500 }}>not pursuing</span>}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "1px solid " + T.border, color: T.textSecondary, fontSize: 12, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>Close ×</button>
      </div>

      {/* Body */}
      <div style={{ padding: "18px 22px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        <DealBlock deals={workbench.deals} />
        <GatewaysBlock gateways={workbench.gateways} deals={workbench.deals} />
      </div>

      <div style={{ padding: "0 22px 22px" }}>
        <FactsBlock company={c} onUpdate={onUpdate} />
      </div>

      <div style={{ padding: "0 22px 22px" }}>
        <NotesBlock company={c} onUpdate={onUpdate} />
      </div>

      <div style={{ padding: "0 22px 22px" }}>
        <ActivityTimeline communications={workbench.communications} gateways={workbench.gateways} />
      </div>
    </div>
  )
}

// ─── Deal block ───────────────────────────────────────────────────────────────
function DealBlock({ deals }) {
  return (
    <div>
      <SectionLabel>Deal</SectionLabel>
      {deals.length === 0 && <div style={{ fontSize: 12, color: T.textTertiary, fontStyle: "italic" }}>No deals yet.</div>}
      {deals.map(function(d, i){
        var isLost = d.stage === "lost"
        return (
          <div key={d.id} style={{ marginBottom: 12, padding: 12, background: T.bg, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500, marginBottom: 8 }}>
              Deal #{i+1} · {d.chapter}
              {isLost && d.lost_reason && <span style={{ marginLeft: 8, color: T.danger, textTransform: "none", letterSpacing: 0 }}>· Lost: {d.lost_reason}</span>}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {STAGES.map(function(s){
                var isCurrent = d.stage === s
                var cfg = STAGE_CONFIG[s]
                return (
                  <span key={s} style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 999, fontWeight: 500,
                    background: isCurrent ? cfg.bg : "transparent",
                    color: isCurrent ? cfg.color : T.textTertiary,
                    border: isCurrent ? "1px solid " + cfg.accent : "1px solid " + T.border,
                  }}>{cfg.label}</span>
                )
              })}
              {isLost && <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 999, fontWeight: 500, background: T.dangerBg, color: T.danger, border: "1px solid " + T.danger }}>Lost</span>}
            </div>
            <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 8, display: "flex", gap: 14 }}>
              {d.host_assignment && <span>✓ Host commitment</span>}
              {d.discovery_date && <span>Discovery: {new Date(d.discovery_date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Gateways block ───────────────────────────────────────────────────────────
function GatewaysBlock({ gateways, deals }) {
  // Find primary person id from first deal
  var primaryIds = new Set(deals.map(function(d){ return d.primary_person_id }).filter(Boolean))
  return (
    <div>
      <SectionLabel>Gateways</SectionLabel>
      {gateways.length === 0 && <div style={{ fontSize: 12, color: T.textTertiary, fontStyle: "italic" }}>No gateways linked yet.</div>}
      {gateways.map(function(p){
        var isPrimary = primaryIds.has(p.id)
        return (
          <div key={p.id} onClick={function(){ if (p.linkedin_url) window.open(p.linkedin_url, "_blank", "noopener,noreferrer") }}
            style={{ marginBottom: 8, padding: "10px 12px", background: T.bg, borderRadius: 8, cursor: p.linkedin_url ? "pointer" : "default" }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
              {p.full_name}
              {isPrimary && <span style={{ fontSize: 9, padding: "1px 6px", background: T.accent, color: "white", borderRadius: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Primary</span>}
            </div>
            <div style={{ fontSize: 11, color: T.textSecondary }}>{p.title || "—"}</div>
            {p.roles && p.roles.length > 1 && (
              <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 3 }}>Also: {p.roles.filter(function(r){return r !== "sponsor_contact"}).join(", ")}</div>
            )}
          </div>
        )
      })}
      <button style={{ width: "100%", padding: "7px 12px", background: "transparent", border: "1px dashed " + T.border, color: T.textTertiary, borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
        + Add gateway (coming soon)
      </button>
    </div>
  )
}

// ─── Facts block (inline editable) ────────────────────────────────────────────
function FactsBlock({ company, onUpdate }) {
  var fields = [
    { key: "sponsor_type",      label: "Sponsor type",       type: "select", options: SPONSOR_TYPE_OPTIONS },
    { key: "host_viable",       label: "Host viable",        type: "select", options: HOST_VIABLE_OPTIONS },
    { key: "hosting_type",      label: "Hosting type",       type: "select", options: HOSTING_TYPE_OPTIONS },
    { key: "neighborhood_la",   label: "LA neighborhood",    type: "text" },
    { key: "neighborhood_sfv",  label: "SFV neighborhood",   type: "text" },
    { key: "city",              label: "City",               type: "text" },
    { key: "state",             label: "State",              type: "text" },
    { key: "industry",          label: "Industry",           type: "text" },
    { key: "employee_count",    label: "Employees",          type: "text" },
    { key: "annual_revenue",    label: "Annual revenue",     type: "text" },
    { key: "ownership_type",    label: "Ownership",          type: "text" },
    { key: "is_sponsor",        label: "Pursuing as sponsor",type: "boolean" },
  ]
  return (
    <div>
      <SectionLabel>Company facts</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px 22px" }}>
        {fields.map(function(f){
          return <EditableField key={f.key} field={f} value={company[f.key]} onSave={function(v){ return onUpdate(f.key, v) }} />
        })}
      </div>
    </div>
  )
}

// ─── Notes block (inline editable) ────────────────────────────────────────────
function NotesBlock({ company, onUpdate }) {
  var [editing, setEditing] = useState(false)
  var [draft, setDraft] = useState(company.notes || "")
  var [saving, setSaving] = useState(false)
  useEffect(function(){ setDraft(company.notes || "") }, [company.id, company.notes])

  if (editing) {
    return (
      <div>
        <SectionLabel>Research / notes</SectionLabel>
        <textarea
          value={draft}
          onChange={function(e){ setDraft(e.target.value) }}
          style={{ width: "100%", minHeight: 160, padding: 12, fontSize: 13, lineHeight: 1.6, border: "1px solid " + T.accent, borderRadius: 8, fontFamily: "inherit", outline: "none", resize: "vertical", color: T.textPrimary }}
          placeholder="Company research, strategic positioning, fit notes…"
        />
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <button disabled={saving} onClick={function(){
            setSaving(true)
            onUpdate("notes", draft).then(function(){ setEditing(false); setSaving(false) }).catch(function(){ setSaving(false) })
          }} style={{ padding: "6px 14px", background: T.accent, color: "white", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>{saving ? "Saving…" : "Save"}</button>
          <button onClick={function(){ setDraft(company.notes || ""); setEditing(false) }} style={{ padding: "6px 14px", background: "white", color: T.textPrimary, border: "1px solid " + T.border, borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionLabel mb={0}>Research / notes</SectionLabel>
        <button onClick={function(){ setEditing(true) }} style={{ background: "transparent", border: "none", color: T.accent, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Edit</button>
      </div>
      <div style={{ background: T.bg, padding: 14, borderRadius: 8, fontSize: 13, lineHeight: 1.6, color: T.textPrimary, whiteSpace: "pre-wrap", wordBreak: "break-word", minHeight: 40 }}>
        {company.notes || <span style={{ color: T.textTertiary, fontStyle: "italic" }}>No research notes yet. Click Edit to add.</span>}
      </div>
    </div>
  )
}

// ─── Activity timeline ────────────────────────────────────────────────────────
function ActivityTimeline({ communications, gateways }) {
  var byPersonId = {}
  gateways.forEach(function(p){ byPersonId[p.id] = p })
  return (
    <div>
      <SectionLabel>Activity timeline</SectionLabel>
      {communications.length === 0 && <div style={{ fontSize: 12, color: T.textTertiary, fontStyle: "italic" }}>No logged activity yet.</div>}
      {communications.map(function(comm){
        var who = byPersonId[comm.contact_id]
        return (
          <div key={comm.id} style={{ padding: "10px 0", borderBottom: "1px solid " + T.borderSoft }}>
            <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 4, display: "flex", gap: 10 }}>
              <span style={{ fontWeight: 500 }}>{comm.channel}</span>
              <span>·</span>
              <span>{comm.direction}</span>
              {who && <><span>·</span><span>{who.full_name}</span></>}
              <span>·</span>
              <span>{comm.occurred_at ? new Date(comm.occurred_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—"}</span>
            </div>
            <div style={{ fontSize: 13, color: T.textPrimary, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>
              {(comm.body || "").substring(0, 280)}
              {(comm.body || "").length > 280 && <span style={{ color: T.textTertiary }}>… (truncated)</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Editable field (Save/Cancel pattern) ─────────────────────────────────────
function EditableField({ field, value, onSave }) {
  var [editing, setEditing] = useState(false)
  var [draft, setDraft] = useState(value)
  var [saving, setSaving] = useState(false)

  useEffect(function(){ setDraft(value) }, [value])

  function display(v) {
    if (field.type === "boolean") return v === true || v === "true" ? "Yes" : v === false || v === "false" ? "No" : <em style={{ color: T.textTertiary }}>not set</em>
    if (v === null || v === undefined || v === "") return <em style={{ color: T.textTertiary }}>not set</em>
    return String(v)
  }

  function startEdit() {
    setDraft(value === null || value === undefined ? (field.type === "boolean" ? false : "") : value)
    setEditing(true)
  }
  function cancel() {
    setDraft(value); setEditing(false)
  }
  function save() {
    setSaving(true)
    var toSave = draft
    if (field.type === "boolean") toSave = !!draft
    Promise.resolve(onSave(toSave)).then(function(){ setEditing(false); setSaving(false) }).catch(function(){ setSaving(false) })
  }

  return (
    <div style={{ fontSize: 12, paddingBottom: 6, borderBottom: "1px solid " + T.borderSoft }}>
      <div style={{ color: T.textTertiary, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500, marginBottom: 3 }}>{field.label}</div>
      {!editing ? (
        <div onClick={startEdit} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "2px 0", color: T.textPrimary, fontSize: 13 }}>
          <span>{display(value)}</span>
          <span style={{ fontSize: 10, color: T.textTertiary, opacity: 0.6 }}>edit</span>
        </div>
      ) : (
        <div>
          {field.type === "select" && (
            <select value={draft || ""} onChange={function(e){ setDraft(e.target.value) }} style={{ width: "100%", padding: "5px 8px", fontSize: 13, border: "1px solid " + T.accent, borderRadius: 6, fontFamily: "inherit", outline: "none" }}>
              <option value="">— not set —</option>
              {field.options.map(function(o){ return <option key={o} value={o}>{o}</option> })}
            </select>
          )}
          {field.type === "boolean" && (
            <select value={String(!!draft)} onChange={function(e){ setDraft(e.target.value === "true") }} style={{ width: "100%", padding: "5px 8px", fontSize: 13, border: "1px solid " + T.accent, borderRadius: 6, fontFamily: "inherit", outline: "none" }}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          )}
          {field.type === "text" && (
            <input type="text" value={draft || ""} onChange={function(e){ setDraft(e.target.value) }} autoFocus style={{ width: "100%", padding: "5px 8px", fontSize: 13, border: "1px solid " + T.accent, borderRadius: 6, fontFamily: "inherit", outline: "none" }} />
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
            <button disabled={saving} onClick={save} style={{ padding: "4px 10px", background: T.accent, color: "white", border: "none", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>{saving ? "…" : "Save"}</button>
            <button onClick={cancel} style={{ padding: "4px 10px", background: "white", color: T.textPrimary, border: "1px solid " + T.border, borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children, mb }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: mb === 0 ? 0 : 10 }}>{children}</div>
  )
}
