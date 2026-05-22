"use client"
import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { sbFetch } from "@/lib/appShared"
import { T, FONT_FAMILY, FONT_SERIF } from "@/lib/pipelineTheme"

// ─── Stage config ─────────────────────────────────────────────────────────────
const STAGE_CONFIG = {
  pool:      { label: "Pool",      color: T.poolText,     bg: T.poolBg,      desc: "Identified target companies. Research done, no human contact yet." },
  audience:  { label: "Audience",  color: T.audienceText, bg: T.audienceBg,  desc: "Gateway connected on LinkedIn. Awareness building, no real conversation yet." },
  discovery: { label: "Discovery", color: T.prospectText, bg: T.prospectBg,  desc: "Active conversation underway with one or more gateways at the company." },
  proposal:  { label: "Proposal",  color: T.qualifiedText,bg: T.qualifiedBg, desc: "Offer extended, decision pending." },
  active:    { label: "Active",    color: T.memberText,   bg: T.memberBg,    desc: "Signed sponsor, currently engaged with the chapter." },
}
const STAGES = ["pool", "audience", "discovery", "proposal", "active"]

// ─── Main component ───────────────────────────────────────────────────────────
export default function SponsorStageWorkspace({ stage }) {
  var [view, setView] = useState("company")  // "company" | "people"
  var [deals, setDeals] = useState([])
  var [companiesById, setCompaniesById] = useState({})
  var [peopleById, setPeopleById] = useState({})
  var [dealContactsByDealId, setDealContactsByDealId] = useState({})
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState(null)

  // Reset view filter on stage navigation
  useEffect(function() {
    loadData()
  }, [stage])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      // Pull all deals so we can compute counts per stage for the tabs
      var allDeals = await sbFetch("/sponsor_deals?select=id,stage,chapter,company_id,primary_person_id,annual_fee,lost_reason,host_assignment,discovery_date&order=discovery_date.desc.nullslast")
      var stageDeals = allDeals.filter(function(d) { return d.stage === stage })

      // Resolve company + person details for current stage
      var companyIds = Array.from(new Set(stageDeals.map(function(d){return d.company_id}).filter(Boolean)))
      var personIds = Array.from(new Set(stageDeals.map(function(d){return d.primary_person_id}).filter(Boolean)))

      var companies = []
      if (companyIds.length > 0) {
        companies = await sbFetch("/companies?id=in.(" + companyIds.join(",") + ")&select=id,name,sponsor_type,host_viable,hosting_type,is_sponsor,city,state,neighborhood_la,neighborhood_sfv,employee_count,industry,notes")
      }
      var coMap = {}
      companies.forEach(function(c){ coMap[c.id] = c })

      var people = []
      if (personIds.length > 0) {
        people = await sbFetch("/people?id=in.(" + personIds.join(",") + ")&select=id,full_name,first_name,last_name,title,email,linkedin_url,last_meaningful_touch,sponsor_state")
      }
      var pMap = {}
      people.forEach(function(p){ pMap[p.id] = p })

      // Deal contacts for gateway counts
      var dealIds = stageDeals.map(function(d){return d.id})
      var dcMap = {}
      if (dealIds.length > 0) {
        var dealContacts = await sbFetch("/deal_contacts?deal_id=in.(" + dealIds.join(",") + ")&select=deal_id,person_id,role,is_primary")
        dealContacts.forEach(function(dc) {
          if (!dcMap[dc.deal_id]) dcMap[dc.deal_id] = []
          dcMap[dc.deal_id].push(dc)
        })
      }

      setDeals(allDeals)
      setCompaniesById(coMap)
      setPeopleById(pMap)
      setDealContactsByDealId(dcMap)
    } catch(err) {
      setError(err.message || String(err))
    }
    setLoading(false)
  }

  // Derived data
  var counts = useMemo(function() {
    var c = {}
    STAGES.forEach(function(s){ c[s] = 0 })
    deals.forEach(function(d){ if (c[d.stage] !== undefined) c[d.stage]++ })
    return c
  }, [deals])

  var enriched = useMemo(function() {
    return deals.filter(function(d){return d.stage === stage}).map(function(d) {
      return {
        deal: d,
        company: companiesById[d.company_id] || null,
        person: peopleById[d.primary_person_id] || null,
        gatewayCount: (dealContactsByDealId[d.id] || []).length,
      }
    })
  }, [deals, stage, companiesById, peopleById, dealContactsByDealId])

  var stageCfg = STAGE_CONFIG[stage] || STAGE_CONFIG.pool

  return (
    <main style={{ padding: "28px 32px 48px", maxWidth: 1600 }}>
      <Breadcrumb stage={stage} />
      <StageTabs activeStage={stage} counts={counts} />

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1.1, display: "flex", alignItems: "center", gap: 12, margin: 0 }}>
            {stageCfg.label}
            <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 999, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.4, background: stageCfg.bg, color: stageCfg.color }}>
              {loading ? "…" : (counts[stage] || 0) + " " + ((counts[stage] || 0) === 1 ? "deal" : "deals")}
            </span>
          </h1>
          <p style={{ color: T.textSecondary, fontSize: 14, marginTop: 6, maxWidth: 720 }}>{stageCfg.desc}</p>
        </div>
        <ViewToggle view={view} setView={setView} />
      </header>

      {error && (
        <div style={{ background: T.dangerBg, border: "1px solid " + T.danger, borderRadius: 10, padding: "12px 16px", color: T.danger, marginBottom: 20, fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      {loading && <div style={{ padding: 40, textAlign: "center", color: T.textTertiary, fontSize: 13 }}>Loading…</div>}

      {!loading && !error && <InventoryList view={view} enriched={enriched} stage={stage} />}

      <div style={{ textAlign: "center", color: T.textTertiary, fontSize: 12, marginTop: 28, paddingTop: 20, borderTop: "1px solid " + T.border }}>
        Live sponsor data from PeerChair · {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      </div>
    </main>
  )
}

// ─── View toggle (Company / Gateway) ──────────────────────────────────────────
function ViewToggle({ view, setView }) {
  function Btn({ value, label }) {
    var active = view === value
    return (
      <button
        onClick={function() { setView(value) }}
        style={{
          padding: "7px 16px",
          fontSize: 13,
          fontWeight: 500,
          border: "none",
          background: active ? T.textPrimary : "transparent",
          color: active ? "white" : T.textSecondary,
          borderRadius: 6,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >{label}</button>
    )
  }
  return (
    <div style={{ display: "flex", background: T.cardBg, border: "1px solid " + T.border, borderRadius: 8, padding: 3, flexShrink: 0 }}>
      <Btn value="company" label="Companies" />
      <Btn value="people" label="Gateways" />
    </div>
  )
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────
function Breadcrumb({ stage }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.textTertiary, marginBottom: 18 }}>
      <Link href="/" style={{ color: T.textTertiary, textDecoration: "none" }}>Dashboard</Link>
      <span>›</span>
      <Link href="/pipeline/sponsor/pool" style={{ color: T.textTertiary, textDecoration: "none" }}>Sponsors</Link>
      <span>›</span>
      <span style={{ color: T.textPrimary }}>{STAGE_CONFIG[stage]?.label || stage}</span>
    </div>
  )
}

// ─── Stage tabs ───────────────────────────────────────────────────────────────
function StageTabs({ activeStage, counts }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid " + T.border }}>
      {STAGES.map(function(s) {
        var cfg = STAGE_CONFIG[s]
        var isActive = s === activeStage
        return (
          <Link
            key={s}
            href={"/pipeline/sponsor/" + s}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
              color: isActive ? T.textPrimary : T.textSecondary,
              borderBottom: "2px solid " + (isActive ? T.accent : "transparent"),
              marginBottom: -1,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {cfg.label}
            <span style={{
              fontSize: 11,
              padding: "1px 7px",
              background: isActive ? cfg.bg : T.bg,
              color: isActive ? cfg.color : T.textTertiary,
              borderRadius: 999,
              fontWeight: 500,
            }}>{counts[s] || 0}</span>
          </Link>
        )
      })}
    </div>
  )
}

// ─── Inventory list ───────────────────────────────────────────────────────────
function InventoryList({ view, enriched, stage }) {
  if (enriched.length === 0) {
    return (
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: "48px 24px", textAlign: "center", color: T.textTertiary, fontSize: 13 }}>
        No deals at <strong>{STAGE_CONFIG[stage]?.label || stage}</strong> stage yet.
      </div>
    )
  }
  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: "22px 24px" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>
          {enriched.length} {view === "company" ? (enriched.length === 1 ? "company" : "companies") : (enriched.length === 1 ? "gateway" : "gateways")} at this stage
        </div>
        <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>
          {view === "company" ? "Click a company to open the journey view (coming soon)" : "Click a gateway to open their LinkedIn profile"}
        </div>
      </div>
      {enriched.map(function(item) {
        return view === "company"
          ? <CompanyRow key={item.deal.id} item={item} />
          : <PersonRow key={item.deal.id} item={item} />
      })}
    </div>
  )
}

// ─── Company row ──────────────────────────────────────────────────────────────
function CompanyRow({ item }) {
  var company = item.company
  var person = item.person
  var deal = item.deal

  if (!company) {
    return (
      <div style={{ padding: "16px 18px", borderBottom: "1px solid " + T.borderSoft, color: T.textTertiary, fontSize: 13, fontStyle: "italic" }}>
        Deal {deal.id.slice(0,8)} — no company linked (orphan)
      </div>
    )
  }

  return (
    <div style={{ padding: "16px 18px", borderBottom: "1px solid " + T.borderSoft, display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
          {company.name}
          {!company.is_sponsor && (
            <span style={{ fontSize: 10, padding: "2px 7px", background: T.bg, color: T.textTertiary, borderRadius: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.4 }}>not pursuing</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: T.textSecondary, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {company.sponsor_type ? <span>{company.sponsor_type}</span> : <span style={{ color: T.textTertiary, fontStyle: "italic" }}>uncategorized</span>}
          {(company.neighborhood_la || company.neighborhood_sfv || company.city) && (
            <span>· {company.neighborhood_la || company.neighborhood_sfv || company.city}</span>
          )}
          {person && <span>· Gateway: {person.full_name}</span>}
          {item.gatewayCount > 1 && (
            <span>· +{item.gatewayCount - 1} more</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <HostBadge value={company.host_viable} />
        {deal.annual_fee > 0 && (
          <span style={{ fontSize: 11, padding: "3px 9px", background: T.bg, color: T.textPrimary, borderRadius: 999, fontWeight: 500 }}>
            ${deal.annual_fee.toLocaleString()}/yr
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Gateway (person) row ─────────────────────────────────────────────────────
function PersonRow({ item }) {
  var person = item.person
  var company = item.company

  if (!person) {
    return (
      <div style={{ padding: "16px 18px", borderBottom: "1px solid " + T.borderSoft, color: T.textTertiary, fontSize: 13, fontStyle: "italic" }}>
        No primary gateway assigned — {company?.name || "(unknown company)"}
      </div>
    )
  }

  return (
    <div
      onClick={function() {
        if (person.linkedin_url) window.open(person.linkedin_url, "_blank", "noopener,noreferrer")
      }}
      style={{
        padding: "16px 18px",
        borderBottom: "1px solid " + T.borderSoft,
        display: "flex",
        alignItems: "center",
        gap: 16,
        cursor: person.linkedin_url ? "pointer" : "default",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary, marginBottom: 4 }}>
          {person.full_name}
        </div>
        <div style={{ fontSize: 12, color: T.textSecondary, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {person.title && <span>{person.title}</span>}
          {company && <span>· {company.name}</span>}
          {company?.sponsor_type && <span>· {company.sponsor_type}</span>}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>
        {company && <HostBadge value={company.host_viable} />}
      </div>
    </div>
  )
}

// ─── Host viability badge ─────────────────────────────────────────────────────
function HostBadge({ value }) {
  if (value === "Yes") {
    return <span style={{ fontSize: 11, padding: "3px 9px", background: T.successBg, color: T.success, borderRadius: 999, fontWeight: 500 }}>✓ Host viable</span>
  }
  if (value === "No") {
    return <span style={{ fontSize: 11, padding: "3px 9px", background: T.bg, color: T.textTertiary, borderRadius: 999, fontWeight: 500 }}>✗ Won't host</span>
  }
  return <span style={{ fontSize: 11, padding: "3px 9px", background: "transparent", color: T.textTertiary, borderRadius: 999, fontWeight: 500, border: "1px dashed " + T.border }}>Host: TBD</span>
}
