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

      // Companies at this stage — same most-advanced-stage-wins semantics as funnel cards
      // so the left-list count reconciles with the funnel card count.
      var STAGE_RANK_LOAD = { pool: 0, audience: 1, discovery: 2, proposal: 3, active: 4 }
      var coMostAdvanced = {}
      deals.forEach(function(d){
        if (!d.company_id || !coById[d.company_id]) return
        if (STAGE_RANK_LOAD[d.stage] === undefined) return
        var prev = coMostAdvanced[d.company_id]
        if (prev === undefined || STAGE_RANK_LOAD[d.stage] > STAGE_RANK_LOAD[prev.stage]) {
          coMostAdvanced[d.company_id] = { stage: d.stage, primary_person_id: d.primary_person_id }
        }
      })
      var stageList = Object.keys(coMostAdvanced)
        .filter(function(coId){ return coMostAdvanced[coId].stage === stage })
        .map(function(coId){ return coById[coId] })
        .filter(Boolean)
      stageList.sort(function(a,b){ return (a.name || "").localeCompare(b.name || "") })
      setStageCompanies(stageList)

      // Primary persons for the deals associated with companies at this stage
      var personIds = Array.from(new Set(
        Object.keys(coMostAdvanced)
          .filter(function(coId){ return coMostAdvanced[coId].stage === stage })
          .map(function(coId){ return coMostAdvanced[coId].primary_person_id })
          .filter(Boolean)
      ))
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
      var locs = await sbFetch("/company_locations?company_id=eq." + companyId + "&select=*&order=created_at.asc")
      setWorkbench({ company, deals: dealRows, gateways, communications: comms, locations: locs })
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

  function saveNote(contactId, noteText) {
    if (!contactId || !noteText || !noteText.trim()) return Promise.reject(new Error("Missing contact_id or body"))
    return sbFetch("/communications", {
      method: "POST",
      body: JSON.stringify({
        contact_id: contactId,
        channel: "App",
        direction: "INTERNAL",
        body: noteText.trim(),
        step_label: "Note",
        occurred_at: new Date().toISOString(),
        source: "manual",
      }),
    }).then(function(rows) {
      var newComm = Array.isArray(rows) ? rows[0] : rows
      setWorkbench(function(prev){
        if (!prev) return prev
        return Object.assign({}, prev, { communications: [newComm].concat(prev.communications || []) })
      })
    })
  }

  function createLocation(data) {
    if (!workbench || !workbench.company) return Promise.reject(new Error("No company"))
    var body = Object.assign({ company_id: workbench.company.id }, data)
    return sbFetch("/company_locations", {
      method: "POST",
      body: JSON.stringify(body),
    }).then(function(rows){
      var newLoc = Array.isArray(rows) ? rows[0] : rows
      setWorkbench(function(prev){
        if (!prev) return prev
        return Object.assign({}, prev, { locations: (prev.locations || []).concat([newLoc]) })
      })
    })
  }

  function updateLocation(id, patch) {
    return sbFetch("/company_locations?id=eq." + id, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then(function(){
      setWorkbench(function(prev){
        if (!prev) return prev
        var newLocs = (prev.locations || []).map(function(l){
          return l.id === id ? Object.assign({}, l, patch) : l
        })
        return Object.assign({}, prev, { locations: newLocs })
      })
    })
  }

  function deleteLocation(id) {
    return sbFetch("/company_locations?id=eq." + id, { method: "DELETE" }).then(function(){
      setWorkbench(function(prev){
        if (!prev) return prev
        return Object.assign({}, prev, { locations: (prev.locations || []).filter(function(l){ return l.id !== id }) })
      })
    })
  }

  // Derived: stage counts — UNIQUE COMPANIES at their MOST-ADVANCED stage.
  // Reconciles the funnel sum with the company total: a company with 2 deals
  // at pool counts once; a company with deals at both pool AND discovery
  // counts once at discovery (the more-advanced stage wins). Sum of funnel
  // is always ≤ total sponsor pool.
  var STAGE_RANK = { pool: 0, audience: 1, discovery: 2, proposal: 3, active: 4 }
  var counts = useMemo(function() {
    var sponsorCoSet = new Set(allSponsorCompanies.map(function(co){ return co.id }))
    var companyMostAdvanced = {}
    allDeals.forEach(function(d){
      if (!sponsorCoSet.has(d.company_id)) return
      if (STAGE_RANK[d.stage] === undefined) return  // skip 'lost' and unknown stages
      var prev = companyMostAdvanced[d.company_id]
      if (prev === undefined || STAGE_RANK[d.stage] > STAGE_RANK[prev]) {
        companyMostAdvanced[d.company_id] = d.stage
      }
    })
    var c = {}
    STAGES.forEach(function(s){ c[s] = 0 })
    Object.keys(companyMostAdvanced).forEach(function(coId){
      var s = companyMostAdvanced[coId]
      if (c[s] !== undefined) c[s]++
    })
    return c
  }, [allDeals, allSponsorCompanies])

  // Companies outside the active funnel: in sponsor pool but no active-stage deal
  // (either no deal at all, or only lost deals). Used for the reconciliation footnote.
  var outsideFunnel = useMemo(function() {
    var inFunnel = new Set()
    var sponsorCoSet = new Set(allSponsorCompanies.map(function(co){ return co.id }))
    allDeals.forEach(function(d){
      if (sponsorCoSet.has(d.company_id) && STAGE_RANK[d.stage] !== undefined) inFunnel.add(d.company_id)
    })
    return allSponsorCompanies.filter(function(c){ return !inFunnel.has(c.id) }).length
  }, [allDeals, allSponsorCompanies])

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
      <FunnelCards counts={counts} activeStage={stage} outsideFunnel={outsideFunnel} totalSponsorPool={allSponsorCompanies.length} />

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
          onSaveNote={saveNote}
          onCreateLocation={createLocation}
          onUpdateLocation={updateLocation}
          onDeleteLocation={deleteLocation}
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
function FunnelCards({ counts, activeStage, outsideFunnel, totalSponsorPool }) {
  var funnelSum = STAGES.reduce(function(acc, s){ return acc + (counts[s] || 0) }, 0)
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
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
      {totalSponsorPool > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: T.textTertiary, display: "flex", gap: 14, justifyContent: "flex-end" }}>
          <span><strong style={{ color: T.textSecondary, fontWeight: 600 }}>{funnelSum}</strong> in funnel</span>
          {outsideFunnel > 0 && <span><strong style={{ color: T.textSecondary, fontWeight: 600 }}>{outsideFunnel}</strong> outside (no deal or lost)</span>}
          <span><strong style={{ color: T.textSecondary, fontWeight: 600 }}>{totalSponsorPool}</strong> total sponsor pool</span>
        </div>
      )}
    </div>
  )
}

// ─── Left list pane ───────────────────────────────────────────────────────────
function CompanyListPane({ stage, companies, primaryPersonsById, allDeals, selectedId, onSelect, loading }) {
  var [searchQuery, setSearchQuery] = useState("")

  // Reset search when stage changes
  useEffect(function(){ setSearchQuery("") }, [stage])

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

  // Filter by search
  var filtered = useMemo(function(){
    if (!searchQuery.trim()) return companies
    var q = searchQuery.toLowerCase()
    return companies.filter(function(c){
      var name = (c.name || "").toLowerCase()
      var type = (c.sponsor_type || "").toLowerCase()
      var hood = (c.neighborhood_la || c.neighborhood_sfv || c.city || "").toLowerCase()
      return name.indexOf(q) >= 0 || type.indexOf(q) >= 0 || hood.indexOf(q) >= 0
    })
  }, [companies, searchQuery])

  var stageLabel = STAGE_CONFIG[stage]?.label || stage
  var headerText = loading
    ? "Loading…"
    : searchQuery.trim()
      ? filtered.length + " of " + companies.length + " · " + stageLabel
      : companies.length + " " + (companies.length === 1 ? "company" : "companies") + " at " + stageLabel

  return (
    <div style={{
      width: 380, flexShrink: 0,
      background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Search bar */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid " + T.borderSoft, position: "relative" }}>
        <input
          type="text"
          value={searchQuery}
          onChange={function(e){ setSearchQuery(e.target.value) }}
          placeholder="Search company, type, or neighborhood…"
          style={{
            width: "100%",
            padding: "7px 10px 7px 28px",
            fontSize: 13,
            border: "1px solid " + T.border,
            borderRadius: 6,
            fontFamily: "inherit",
            outline: "none",
            background: "white",
            color: T.textPrimary,
          }}
        />
        <span style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)", color: T.textTertiary, fontSize: 13, pointerEvents: "none" }}>⌕</span>
        {searchQuery && (
          <button
            onClick={function(){ setSearchQuery("") }}
            style={{ position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: T.textTertiary, fontSize: 14, cursor: "pointer", padding: 4, lineHeight: 1 }}
          >×</button>
        )}
      </div>

      <div style={{ padding: "10px 14px", borderBottom: "1px solid " + T.border, fontSize: 12, color: T.textSecondary, fontWeight: 500 }}>
        {headerText}
      </div>
      <div style={{ overflow: "auto", flex: 1 }}>
        {filtered.length === 0 && !loading && (
          <div style={{ padding: 32, textAlign: "center", color: T.textTertiary, fontSize: 12 }}>
            {searchQuery ? "No matches for \"" + searchQuery + "\"." : "No companies at this stage."}
          </div>
        )}
        {filtered.map(function(c){
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
function CompanyWorkbench({ companyId, workbench, loading, onUpdate, onSaveNote, onCreateLocation, onUpdateLocation, onDeleteLocation, onClose }) {
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

  // Compute last meaningful touch across all gateways for the header pill
  var lastTouch = null
  ;(workbench.gateways || []).forEach(function(g){
    if (g.last_meaningful_touch && (!lastTouch || g.last_meaningful_touch > lastTouch)) lastTouch = g.last_meaningful_touch
  })

  return (
    <div style={{ flex: 1, background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, overflow: "auto", minWidth: 0 }}>
      {/* Header */}
      <div style={{ padding: "18px 22px", borderBottom: "1px solid " + T.border, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: T.textPrimary, marginBottom: 4, letterSpacing: -0.3 }}>{c.name}</div>
          <div style={{ fontSize: 12, color: T.textSecondary, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {c.sponsor_type ? <span>{c.sponsor_type}</span> : <span style={{ fontStyle: "italic", color: T.textTertiary }}>uncategorized</span>}
            {lastTouch && <span>· Last activity: {new Date(lastTouch).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>}
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
        <LocationsBlock
          locations={workbench.locations || []}
          onCreate={onCreateLocation}
          onUpdate={onUpdateLocation}
          onDelete={onDeleteLocation}
        />
      </div>

      <div style={{ padding: "0 22px 22px" }}>
        <NotesBlock company={c} onUpdate={onUpdate} />
      </div>

      <div style={{ padding: "0 22px 22px" }}>
        <ActivityTimeline communications={workbench.communications} gateways={workbench.gateways} deals={workbench.deals} onSaveNote={onSaveNote} />
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
          <div key={p.id}
            onClick={function(){ window.open("/?contact=" + p.id, "_blank", "noopener,noreferrer") }}
            style={{ marginBottom: 8, padding: "10px 12px", background: T.bg, borderRadius: 8, cursor: "pointer", transition: "background 0.1s" }}
            onMouseEnter={function(e){ e.currentTarget.style.background = "#f0f3f7" }}
            onMouseLeave={function(e){ e.currentTarget.style.background = T.bg }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
                  {p.full_name}
                  {isPrimary && <span style={{ fontSize: 9, padding: "1px 6px", background: T.accent, color: "white", borderRadius: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Primary</span>}
                </div>
                <div style={{ fontSize: 11, color: T.textSecondary }}>{p.title || "—"}</div>
                {p.roles && p.roles.length > 1 && (
                  <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 3 }}>Also: {p.roles.filter(function(r){return r !== "sponsor_contact"}).join(", ")}</div>
                )}
              </div>
              {p.linkedin_url && (
                <a
                  href={p.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={function(e){ e.stopPropagation() }}
                  title="Open LinkedIn profile"
                  style={{ flexShrink: 0, fontSize: 11, color: T.textTertiary, textDecoration: "none", padding: "3px 8px", border: "1px solid " + T.border, borderRadius: 5, background: "white" }}
                >in ↗</a>
              )}
            </div>
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
    { key: "sponsor_type",  label: "Sponsor type",  type: "select", options: SPONSOR_TYPE_OPTIONS },
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

// ─── Locations block ──────────────────────────────────────────────────────────
function LocationsBlock({ locations, onCreate, onUpdate, onDelete }) {
  var [adding, setAdding] = useState(false)

  function handleAdd(data) {
    return Promise.resolve(onCreate(data)).then(function(){ setAdding(false) })
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <SectionLabel mb={0}>Locations</SectionLabel>
        {!adding && (
          <button onClick={function(){ setAdding(true) }} style={{ background: "transparent", border: "none", color: T.accent, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0, fontWeight: 500 }}>+ Add location</button>
        )}
      </div>
      {locations.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: T.textTertiary, fontStyle: "italic", padding: "8px 0" }}>
          No locations on record. Add one to mark host viability.
        </div>
      )}
      {locations.map(function(loc){
        return <LocationRow key={loc.id} loc={loc} onUpdate={onUpdate} onDelete={onDelete} />
      })}
      {adding && <LocationRow loc={null} isNew={true} onCreate={handleAdd} onCancelNew={function(){ setAdding(false) }} />}
    </div>
  )
}

function LocationRow({ loc, isNew, onUpdate, onDelete, onCreate, onCancelNew }) {
  var [editing, setEditing] = useState(!!isNew)
  var [neighborhood, setNeighborhood] = useState(loc?.neighborhood || "")
  var [hostViable, setHostViable] = useState(loc?.host_viable || "Unknown")
  var [hostType, setHostType] = useState(loc?.host_type || "TBD")
  var [saving, setSaving] = useState(false)

  function save() {
    setSaving(true)
    var data = { neighborhood: neighborhood, host_viable: hostViable, host_type: hostType }
    var p = isNew ? onCreate(data) : onUpdate(loc.id, data)
    Promise.resolve(p).then(function(){ setSaving(false); setEditing(false) }).catch(function(){ setSaving(false) })
  }

  function cancel() {
    if (isNew) { onCancelNew && onCancelNew(); return }
    setNeighborhood(loc.neighborhood || "")
    setHostViable(loc.host_viable || "Unknown")
    setHostType(loc.host_type || "TBD")
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={{ background: T.bg, border: "1px solid " + T.accent, borderRadius: 8, padding: 12, marginBottom: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500, marginBottom: 3 }}>Neighborhood</div>
            <input autoFocus value={neighborhood} onChange={function(e){ setNeighborhood(e.target.value) }} placeholder="e.g. Woodland Hills" style={{ width: "100%", padding: "5px 8px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 5, fontFamily: "inherit", outline: "none", background: "white" }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500, marginBottom: 3 }}>Host viable</div>
            <select value={hostViable} onChange={function(e){ setHostViable(e.target.value) }} style={{ width: "100%", padding: "5px 8px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 5, fontFamily: "inherit", outline: "none", background: "white" }}>
              {HOST_VIABLE_OPTIONS.map(function(o){ return <option key={o} value={o}>{o}</option> })}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500, marginBottom: 3 }}>Host type</div>
            <select value={hostType} onChange={function(e){ setHostType(e.target.value) }} style={{ width: "100%", padding: "5px 8px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 5, fontFamily: "inherit", outline: "none", background: "white" }}>
              {HOSTING_TYPE_OPTIONS.map(function(o){ return <option key={o} value={o}>{o}</option> })}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button disabled={saving || !neighborhood.trim()} onClick={save} style={{ padding: "5px 12px", background: T.accent, color: "white", border: "none", borderRadius: 5, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 500, opacity: neighborhood.trim() ? 1 : 0.5 }}>{saving ? "Saving…" : "Save"}</button>
          <button disabled={saving} onClick={cancel} style={{ padding: "5px 12px", background: "white", color: T.textPrimary, border: "1px solid " + T.border, borderRadius: 5, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: T.bg, borderRadius: 8, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary }}>{loc.neighborhood || <span style={{ fontStyle: "italic", color: T.textTertiary }}>(unnamed location)</span>}</div>
        {loc.host_type && loc.host_type !== "TBD" && loc.host_type !== "N/A" && (
          <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>{loc.host_type}</div>
        )}
      </div>
      <HostBadgeLarge value={loc.host_viable} />
      <button onClick={function(){ setEditing(true) }} style={{ background: "transparent", border: "none", color: T.accent, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Edit</button>
      <button onClick={function(){ if (confirm("Delete this location?")) onDelete(loc.id) }} style={{ background: "transparent", border: "none", color: T.textTertiary, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Delete</button>
    </div>
  )
}

function HostBadgeLarge({ value }) {
  if (value === "Yes") {
    return <span style={{ fontSize: 11, padding: "3px 9px", background: T.successBg, color: T.success, borderRadius: 999, fontWeight: 500 }}>✓ Host viable</span>
  }
  if (value === "No") {
    return <span style={{ fontSize: 11, padding: "3px 9px", background: T.bg, color: T.textTertiary, borderRadius: 999, fontWeight: 500, border: "1px solid " + T.border }}>✗ Won't host</span>
  }
  return <span style={{ fontSize: 11, padding: "3px 9px", background: "transparent", color: T.textTertiary, borderRadius: 999, fontWeight: 500, border: "1px dashed " + T.border }}>Host: TBD</span>
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
function isNote(comm) {
  if (!comm) return false
  var d = (comm.direction || "").toUpperCase()
  if (d === "INTERNAL") return true
  var lbl = (comm.step_label || "").toLowerCase()
  if (lbl.indexOf("note") >= 0) return true
  return false
}

function normalizeDirection(d) {
  if (!d) return ""
  var up = d.toUpperCase()
  if (up === "IN" || up === "INBOUND") return "Inbound"
  if (up === "OUT" || up === "OUTBOUND") return "Outbound"
  if (up === "INTERNAL") return ""  // notes don't show direction
  return d.charAt(0).toUpperCase() + d.slice(1).toLowerCase()
}

function ActivityTimeline({ communications, gateways, deals, onSaveNote }) {
  var [filter, setFilter] = useState("All")
  var [adding, setAdding] = useState(false)
  var [noteDraft, setNoteDraft] = useState("")
  var [noteSaving, setNoteSaving] = useState(false)
  var [noteError, setNoteError] = useState(null)

  // Primary gateway = deal's primary_person_id, or first gateway if no primary
  var primaryId = null
  if (deals && deals.length > 0 && deals[0].primary_person_id) primaryId = deals[0].primary_person_id
  else if (gateways && gateways.length > 0) primaryId = gateways[0].id
  var [noteAttachTo, setNoteAttachTo] = useState(primaryId)
  useEffect(function(){ setNoteAttachTo(primaryId) }, [primaryId])

  var byPersonId = {}
  gateways.forEach(function(p){ byPersonId[p.id] = p })

  var filtered = communications.filter(function(c){
    if (filter === "All") return true
    var dir = (c.direction || "").toUpperCase()
    var ch  = (c.channel   || "").toUpperCase()
    if (filter === "Inbound")  return dir === "IN" || dir === "INBOUND"
    if (filter === "Outbound") return dir === "OUT" || dir === "OUTBOUND"
    if (filter === "Notes")    return isNote(c)
    if (filter === "Email")    return ch === "EMAIL"
    if (filter === "LinkedIn") return ch === "LINKEDIN"
    if (filter === "Phone")    return ch === "PHONE"
    return true
  })

  function handleSaveNote() {
    if (!noteDraft.trim()) return
    if (!noteAttachTo) { setNoteError("No gateway available to attach the note to. Add a gateway first."); return }
    setNoteSaving(true); setNoteError(null)
    Promise.resolve(onSaveNote(noteAttachTo, noteDraft))
      .then(function(){
        setNoteDraft("")
        setAdding(false)
        setNoteSaving(false)
      })
      .catch(function(err){
        setNoteError(err.message || "Failed to save note")
        setNoteSaving(false)
      })
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <SectionLabel mb={0}>Activity timeline</SectionLabel>
        {!adding && (
          <button
            disabled={!primaryId}
            title={!primaryId ? "Add a gateway first" : ""}
            onClick={function(){ setAdding(true) }}
            style={{
              fontSize: 12, padding: "5px 12px",
              background: primaryId ? T.accent : T.bg,
              color: primaryId ? "white" : T.textTertiary,
              border: "none", borderRadius: 6,
              cursor: primaryId ? "pointer" : "not-allowed",
              fontFamily: "inherit", fontWeight: 500,
            }}
          >+ Add note</button>
        )}
      </div>

      {/* Add Note inline editor */}
      {adding && (
        <div style={{ background: T.bg, border: "1px solid " + T.accent, borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <textarea
            autoFocus
            value={noteDraft}
            onChange={function(e){ setNoteDraft(e.target.value) }}
            placeholder="Note about the gateway or the relationship…"
            style={{ width: "100%", minHeight: 90, padding: 10, fontSize: 13, lineHeight: 1.6, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none", resize: "vertical", color: T.textPrimary, background: "white" }}
          />
          {noteError && <div style={{ fontSize: 12, color: T.danger, marginTop: 6 }}>{noteError}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: T.textTertiary }}>About:</span>
            <select
              value={noteAttachTo || ""}
              onChange={function(e){ setNoteAttachTo(e.target.value) }}
              style={{ fontSize: 12, padding: "4px 8px", border: "1px solid " + T.border, borderRadius: 5, fontFamily: "inherit", background: "white", color: T.textPrimary }}
            >
              {gateways.map(function(g){
                return <option key={g.id} value={g.id}>{g.full_name}{g.id === primaryId ? " (primary)" : ""}</option>
              })}
            </select>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button disabled={noteSaving || !noteDraft.trim()} onClick={handleSaveNote} style={{ padding: "5px 14px", background: T.accent, color: "white", border: "none", borderRadius: 6, fontSize: 12, cursor: noteSaving ? "default" : "pointer", fontFamily: "inherit", fontWeight: 500, opacity: noteDraft.trim() ? 1 : 0.5 }}>
                {noteSaving ? "Saving…" : "Save note"}
              </button>
              <button disabled={noteSaving} onClick={function(){ setNoteDraft(""); setAdding(false); setNoteError(null) }} style={{ padding: "5px 14px", background: "white", color: T.textPrimary, border: "1px solid " + T.border, borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Single-row filter */}
      {communications.length > 0 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid " + T.borderSoft }}>
          {["All","Inbound","Outbound","Email","LinkedIn","Notes","Phone"].map(function(opt){
            var isActive = filter === opt
            return (
              <button
                key={opt}
                onClick={function(){ setFilter(opt) }}
                style={{
                  fontSize: 11, padding: "4px 10px", borderRadius: 999,
                  background: isActive ? T.textPrimary : "transparent",
                  color: isActive ? "white" : T.textSecondary,
                  border: "1px solid " + (isActive ? T.textPrimary : T.border),
                  cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
                }}
              >{opt}</button>
            )
          })}
          <span style={{ fontSize: 11, color: T.textTertiary, marginLeft: "auto" }}>
            Showing {filtered.length} of {communications.length}
          </span>
        </div>
      )}

      {communications.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: T.textTertiary, fontStyle: "italic", padding: "16px 0" }}>
          No logged activity yet.
        </div>
      )}

      {filtered.map(function(comm){
        var who = byPersonId[comm.contact_id]
        return <TimelineEntry key={comm.id} comm={comm} who={who} />
      })}
    </div>
  )
}

function TimelineEntry({ comm, who }) {
  var [expanded, setExpanded] = useState(false)
  var body = comm.body || ""
  var isLong = body.length > 600
  var displayBody = (isLong && !expanded) ? body.substring(0, 600) : body

  var note = isNote(comm)
  var dirLabel = normalizeDirection(comm.direction)
  var channelLabel = note ? "NOTE" : (comm.channel || "").toUpperCase()

  // Tone the entry left-border by kind
  var leftBorder = note ? T.warning
                : (comm.direction || "").toUpperCase() === "IN" || (comm.direction || "").toUpperCase() === "INBOUND" ? T.success
                : T.accent

  return (
    <div style={{ padding: "12px 14px", borderBottom: "1px solid " + T.borderSoft, borderLeft: "3px solid " + leftBorder, marginBottom: 2, background: note ? T.warningBg + "55" : "transparent" }}>
      <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, color: note ? T.warning : T.textSecondary, padding: "2px 8px", background: note ? T.warningBg : T.bg, borderRadius: 4, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{channelLabel}</span>
        {!note && dirLabel && <span style={{ fontWeight: 500 }}>{dirLabel}</span>}
        {who && <><span>·</span><span>{who.full_name}</span></>}
        <span>·</span>
        <span>{comm.occurred_at ? new Date(comm.occurred_at).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}) : "—"}</span>
        {comm.step_label && comm.step_label.toLowerCase() !== "note" && <><span>·</span><span style={{ fontStyle: "italic" }}>{comm.step_label}</span></>}
      </div>
      <div style={{ fontSize: 13, color: T.textPrimary, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>
        {displayBody}
        {isLong && !expanded && (
          <span onClick={function(){ setExpanded(true) }} style={{ color: T.accent, cursor: "pointer", marginLeft: 6, fontSize: 12, fontWeight: 500 }}>
            … show more
          </span>
        )}
        {isLong && expanded && (
          <span onClick={function(){ setExpanded(false) }} style={{ color: T.accent, cursor: "pointer", marginLeft: 6, fontSize: 12, fontWeight: 500 }}>
            show less
          </span>
        )}
      </div>
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
