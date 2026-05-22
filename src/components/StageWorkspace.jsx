"use client"
import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { sbFetch } from "@/lib/appShared"
import { T, FONT_FAMILY, FONT_SERIF } from "@/lib/pipelineTheme"

// ─── Stage config ─────────────────────────────────────────────────────────────
const STAGE_CONFIG = {
  pool: { label: "Pool", color: T.poolText, bg: T.poolBg, desc: "Total CFO universe — identified but not yet engaged." },
  audience: { label: "Audience", color: T.audienceText, bg: T.audienceBg, desc: "Connected on LinkedIn. Receiving content, not in active conversation." },
  prospect: { label: "Prospect", color: T.prospectText, bg: T.prospectBg, desc: "People you're in active conversation with. They've replied or shown real interest, but haven't yet been invited to the next event. Goal: move them to Qualified by completing a fit call and confirming alignment." },
  qualified: { label: "Qualified", color: T.qualifiedText, bg: T.qualifiedBg, desc: "People who've cleared the fit-call bar and are ready to attend the next event. Your job here is to keep them warm until the event with regular touches and complete content inventory." },
  member: { label: "Member", color: T.memberText, bg: T.memberBg, desc: "Active paying members." },
}

// Action tag display config — what we show in the inventory bubbles
const INVENTORY_ITEMS = [
  { key: "connection_accepted", label: "Connected", color: "audience" },
  { key: "first_meeting", label: "Met", color: "audience" },
  { key: "brochure_sent", label: "Brochure", color: "audience", critical: true },
  { key: "cfo_survey_sent", label: "Survey", color: "audience" }, // not critical until Dalen takes it himself
  { key: "fit_call_scheduled", label: "Fit scheduled", color: "prospect" },
  { key: "fit_call_completed", label: "Fit done", color: "qualified" },
  { key: "event_invite_sent", label: "Event invite", color: "audience", critical: true, qualifiedOnly: true },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name) {
  if (!name) return "—"
  var parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
}

function daysSince(iso) {
  if (!iso) return null
  var d = new Date(iso)
  if (isNaN(d)) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function touchLabel(days) {
  if (days === null || days === undefined) return "Never"
  if (days === 0) return "Today"
  if (days === 1) return "1d ago"
  return days + "d ago"
}

function touchColor(days) {
  if (days === null) return T.textTertiary
  if (days >= 20) return T.danger
  if (days >= 14) return T.warning
  return T.textSecondary
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function StageWorkspace({ stage }) {
  var [people, setPeople] = useState([])
  var [actionTagsByPerson, setActionTagsByPerson] = useState({})
  var [statusTagsByPerson, setStatusTagsByPerson] = useState({})
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState(null)
  var [filter, setFilter] = useState(null)

  // Clear filter when navigating between stages
  useEffect(function() { setFilter(null) }, [stage])

  function toggleFilter(key) {
    setFilter(function(prev) { return prev === key ? null : key })
  }

  useEffect(function() {
    if (!STAGE_CONFIG[stage]) {
      setLoading(false)
      setError("Unknown stage: " + stage)
      return
    }
    loadData()
  }, [stage])

  async function loadData() {
    setLoading(true); setError(null)
    try {
      // 1. People in this CFO stage
      var peopleRows = await sbFetch(
        "/people?cfo_state=eq." + encodeURIComponent(stage) +
        "&roles=cs.{cfo}" +
        "&select=id,full_name,title,company,cfo_state,momentum,last_meaningful_touch,linkedin_url" +
        "&order=last_meaningful_touch.desc.nullslast"
      )
      var rows = Array.isArray(peopleRows) ? peopleRows : []
      setPeople(rows)

      if (rows.length === 0) { setLoading(false); return }

      // 2. Their action tags
      var ids = rows.map(function(r) { return r.id }).join(",")
      var tagRows = await sbFetch(
        "/person_action_tags?person_id=in.(" + ids + ")" +
        "&select=person_id,action_type,as_of_date,set_at"
      )
      var byPerson = {}
      ;(Array.isArray(tagRows) ? tagRows : []).forEach(function(t) {
        if (!byPerson[t.person_id]) byPerson[t.person_id] = new Set()
        byPerson[t.person_id].add(t.action_type)
      })
      setActionTagsByPerson(byPerson)

      // 3. Their active status tags
      var statusRows = await sbFetch(
        "/person_status_tags?person_id=in.(" + ids + ")" +
        "&removed_at=is.null" +
        "&select=person_id,tag"
      )
      var statusByPerson = {}
      ;(Array.isArray(statusRows) ? statusRows : []).forEach(function(s) {
        if (!statusByPerson[s.person_id]) statusByPerson[s.person_id] = []
        statusByPerson[s.person_id].push(s.tag)
      })
      setStatusTagsByPerson(statusByPerson)
    } catch (e) {
      setError(e.message || String(e))
    }
    setLoading(false)
  }

  var stageCfg = STAGE_CONFIG[stage] || STAGE_CONFIG.prospect

  // Derive enriched people list
  var enriched = useMemo(function() {
    return people.map(function(p) {
      var tags = actionTagsByPerson[p.id] || new Set()
      var status = statusTagsByPerson[p.id] || []
      var days = daysSince(p.last_meaningful_touch)
      return {
        ...p,
        tags: tags,
        statusTags: status,
        daysSince: days,
        hasFitScheduled: tags.has("fit_call_scheduled"),
        hasFitCompleted: tags.has("fit_call_completed"),
        hasBrochure: tags.has("brochure_sent"),
        hasSurvey: tags.has("cfo_survey_sent"),
        hasEventInvite: tags.has("event_invite_sent"),
        isStale: days !== null && days >= 14,
        isCold: days !== null && days >= 20,
      }
    })
  }, [people, actionTagsByPerson, statusTagsByPerson])

  // KPIs derived from enriched
  var kpis = useMemo(function() {
    var total = enriched.length
    var fitSched = enriched.filter(function(p) { return p.hasFitScheduled }).length
    var fitDone = enriched.filter(function(p) { return p.hasFitCompleted }).length
    var stale = enriched.filter(function(p) { return p.isStale }).length
    var cold = enriched.filter(function(p) { return p.isCold }).length
    var noBrochure = enriched.filter(function(p) { return !p.hasBrochure }).length
    var eventInvited = enriched.filter(function(p) { return p.hasEventInvite }).length
    return { total, fitSched, fitDone, stale, cold, noBrochure, eventInvited }
  }, [enriched])

  // Sections
  var sections = useMemo(function() {
    var fitScheduled = enriched.filter(function(p) { return p.hasFitScheduled })
    var staleList = enriched.filter(function(p) { return !p.hasFitScheduled && p.isStale })
    var active = enriched.filter(function(p) { return !p.hasFitScheduled && !p.isStale })
    return { fitScheduled, staleList, active }
  }, [enriched])

  // Derive the filtered list when a filter is active
  var filteredList = useMemo(function() {
    if (!filter) return null
    return enriched.filter(function(p) {
      if (filter === "scheduled_fit")    return p.hasFitScheduled
      if (filter === "fit_done")         return p.hasFitCompleted
      if (filter === "missing_brochure") return !p.hasBrochure
      if (filter === "missing_invite")   return !p.hasEventInvite
      if (filter === "stale")            return p.isStale
      if (filter === "cold")             return p.isCold
      return true
    })
  }, [enriched, filter])

  return (
    <main style={{ padding: "28px 32px 48px", maxWidth: 1600 }}>

      <Breadcrumb stage={stage} />
      <StageTabs activeStage={stage} />

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1.1, display: "flex", alignItems: "center", gap: 12, margin: 0 }}>
            {stageCfg.label}
            <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 999, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.4, background: stageCfg.bg, color: stageCfg.color }}>
              {loading ? "…" : kpis.total + " " + (stage === "qualified" ? "in waiting room" : "active")}
            </span>
          </h1>
          <p style={{ color: T.textSecondary, fontSize: 14, marginTop: 6, maxWidth: 720 }}>{stageCfg.desc}</p>
        </div>
      </header>

      {error && (
        <div style={{ background: T.dangerBg, border: "1px solid " + T.danger, borderRadius: 10, padding: "12px 16px", color: T.danger, marginBottom: 20, fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      {loading && (
        <div style={{ padding: 40, textAlign: "center", color: T.textTertiary, fontSize: 13 }}>Loading…</div>
      )}

      {!loading && !error && (
        <>
          <MiniKpis stage={stage} kpis={kpis} activeFilter={filter} onToggle={toggleFilter} />
          <SuggestedMoves stage={stage} kpis={kpis} enriched={enriched} />
          <InventoryList stage={stage} sections={sections} filteredList={filteredList} activeFilter={filter} onClearFilter={function(){ setFilter(null) }} />
        </>
      )}

      <div style={{ textAlign: "center", color: T.textTertiary, fontSize: 12, marginTop: 28, paddingTop: 20, borderTop: "1px solid " + T.border }}>
        Live data from PeerChair · {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      </div>
    </main>
  )
}

// ─── Breadcrumb & tabs ────────────────────────────────────────────────────────
function Breadcrumb({ stage }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.textTertiary, marginBottom: 16 }}>
      <Link href="/" style={{ color: T.textTertiary, textDecoration: "none" }}>Dashboard</Link>
      <span style={{ opacity: 0.5 }}>/</span>
      <span style={{ color: T.textTertiary }}>Pipeline</span>
      <span style={{ opacity: 0.5 }}>/</span>
      <span style={{ color: T.textTertiary }}>CFO</span>
      <span style={{ opacity: 0.5 }}>/</span>
      <span style={{ color: T.textPrimary, fontWeight: 500 }}>{STAGE_CONFIG[stage]?.label || stage}</span>
    </div>
  )
}

function StageTabs({ activeStage }) {
  var stages = [
    { key: "pool", label: "Pool", dim: true },
    { key: "audience", label: "Audience", dim: true },
    { key: "prospect", label: "Prospect", dim: false },
    { key: "qualified", label: "Qualified", dim: false },
    { key: "member", label: "Member", dim: true },
  ]
  return (
    <div style={{ display: "flex", gap: 4, background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 4, marginBottom: 20, width: "fit-content" }}>
      {stages.map(function(s) {
        var active = s.key === activeStage
        var common = { padding: "8px 16px", borderRadius: 7, fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }
        if (active) return <span key={s.key} style={{...common, background: T.textPrimary, color: "white"}}>{s.label}</span>
        if (s.dim) return <span key={s.key} style={{...common, color: T.textSecondary, opacity: 0.5}}>{s.label}</span>
        return <Link key={s.key} href={"/pipeline/cfo/" + s.key} style={{...common, color: T.textSecondary}}>{s.label}</Link>
      })}
    </div>
  )
}

// ─── Mini KPIs ────────────────────────────────────────────────────────────────
function MiniKpis({ stage, kpis, activeFilter, onToggle }) {
  var cards = []
  if (stage === "prospect") {
    cards = [
      { label: "Scheduled fit call", value: kpis.fitSched, tone: kpis.fitSched > 0 ? "warm" : "neutral", meta: kpis.fitSched > 0 ? "Prep needed" : "None scheduled", filterKey: kpis.fitSched > 0 ? "scheduled_fit" : null },
      { label: "Fit calls completed", value: kpis.fitDone, tone: "neutral", meta: "Ready to promote", filterKey: kpis.fitDone > 0 ? "fit_done" : null },
      { label: "Missing brochure", value: kpis.noBrochure, tone: kpis.noBrochure > 0 ? "urgent" : "ok", meta: kpis.noBrochure > 0 ? "of " + kpis.total : "All have it", filterKey: kpis.noBrochure > 0 ? "missing_brochure" : null },
      { label: "Stale (>14 days)", value: kpis.stale, tone: kpis.stale > 0 ? "warm" : "ok", meta: "No contact in 14+ days", filterKey: kpis.stale > 0 ? "stale" : null },
      { label: "Cold (>20 days)", value: kpis.cold, tone: kpis.cold > 0 ? "urgent" : "ok", meta: "Re-engage urgently", filterKey: kpis.cold > 0 ? "cold" : null },
    ]
  } else if (stage === "qualified") {
    cards = [
      { label: "Event runway", value: "22d", tone: "warm", meta: "Until Jun 12 event", filterKey: null },
      { label: "Capacity gap", value: Math.max(0, 20 - kpis.eventInvited), tone: "urgent", meta: kpis.eventInvited + " of 20 invited", filterKey: kpis.total - kpis.eventInvited > 0 ? "missing_invite" : null },
      { label: "Missing brochure", value: kpis.noBrochure, tone: kpis.noBrochure > 0 ? "urgent" : "ok", meta: kpis.noBrochure > 0 ? "of " + kpis.total : "All have it", filterKey: kpis.noBrochure > 0 ? "missing_brochure" : null },
      { label: "Fit calls done", value: kpis.fitDone, tone: "neutral", meta: kpis.fitDone + " of " + kpis.total, filterKey: kpis.fitDone > 0 ? "fit_done" : null },
      { label: "Cold (>20 days)", value: kpis.cold, tone: kpis.cold > 0 ? "warm" : "ok", meta: "Re-engage", filterKey: kpis.cold > 0 ? "cold" : null },
    ]
  } else {
    cards = [
      { label: "Total in stage", value: kpis.total, tone: "neutral", meta: "", filterKey: null },
      { label: "Stale (>14d)", value: kpis.stale, tone: kpis.stale > 0 ? "warm" : "ok", meta: "", filterKey: kpis.stale > 0 ? "stale" : null },
    ]
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(" + cards.length + ", 1fr)", gap: 14, marginBottom: 20 }}>
      {cards.map(function(c, i) {
        var toneStyles = {
          urgent:  { bg: T.dangerBg,  border: "rgba(220,38,38,0.15)",  text: T.danger,      activeBorder: T.danger },
          warm:    { bg: T.warningBg, border: "rgba(217,119,6,0.15)",  text: T.warning,     activeBorder: T.warning },
          ok:      { bg: T.successBg, border: "rgba(22,163,74,0.15)",  text: T.success,     activeBorder: T.success },
          neutral: { bg: T.cardBg,    border: T.border,                text: T.textPrimary, activeBorder: T.textPrimary },
        }[c.tone] || { bg: T.cardBg, border: T.border, text: T.textPrimary, activeBorder: T.textPrimary }

        var isClickable = !!c.filterKey
        var isActive = isClickable && activeFilter === c.filterKey
        var borderColor = isActive ? toneStyles.activeBorder : toneStyles.border
        var borderWidth = isActive ? 2 : 1
        var padding = isActive ? "13px 15px" : "14px 16px" // compensate for thicker border so layout doesn't shift

        return (
          <div
            key={i}
            onClick={isClickable ? function() { onToggle(c.filterKey) } : undefined}
            style={{
              background: toneStyles.bg,
              border: borderWidth + "px solid " + borderColor,
              borderRadius: 10,
              padding: padding,
              cursor: isClickable ? "pointer" : "default",
              transition: "border-color 0.15s ease, transform 0.05s ease",
              position: "relative",
              userSelect: "none",
            }}
            onMouseDown={isClickable ? function(e) { e.currentTarget.style.transform = "scale(0.99)" } : undefined}
            onMouseUp={isClickable ? function(e) { e.currentTarget.style.transform = "scale(1)" } : undefined}
            onMouseLeave={isClickable ? function(e) { e.currentTarget.style.transform = "scale(1)" } : undefined}
          >
            <div style={{ fontSize: 11, color: toneStyles.text === T.textPrimary ? T.textSecondary : toneStyles.text, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{c.label}</span>
              {isClickable && <span style={{ fontSize: 9, opacity: isActive ? 1 : 0.4, fontWeight: 500 }}>{isActive ? "● FILTERED" : "FILTER"}</span>}
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1, letterSpacing: -0.3, color: toneStyles.text }}>{c.value}</div>
            {c.meta && <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 6 }}>{c.meta}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Suggested moves ──────────────────────────────────────────────────────────
function SuggestedMoves({ stage, kpis, enriched }) {
  var moves = []

  if (stage === "prospect") {
    if (kpis.noBrochure === kpis.total && kpis.total > 0) {
      moves.push({ tone: "urgent", title: "No one in Prospect has received a brochure", desc: "Your nurture inventory is empty across all " + kpis.total + " prospects. Start sending so the system can track what each person has seen.", action: "Begin nurture campaign →" })
    }
    if (kpis.fitSched > 0) {
      var scheduled = enriched.filter(function(p) { return p.hasFitScheduled })
      moves.push({ tone: "warm", title: "Prep for " + scheduled.length + " scheduled fit call" + (scheduled.length === 1 ? "" : "s"), desc: scheduled.map(function(p){return p.full_name}).slice(0,3).join(", "), action: "Open prep view →" })
    }
    if (kpis.stale > 0) {
      moves.push({ tone: "warm", title: kpis.stale + " prospects have gone stale (>14 days no contact)", desc: "Send a check-in or move to Audience.", action: "Review stale →" })
    }
    if (kpis.fitSched === 0 && kpis.total > 0) {
      moves.push({ tone: "neutral", title: "No fit calls scheduled with any of your " + kpis.total + " prospects", desc: "Without fit calls, no one moves to Qualified. Pick your most engaged prospects.", action: "Pick candidates →" })
    }
  } else if (stage === "qualified") {
    if (kpis.cold > 0) {
      var cold = enriched.filter(function(p) { return p.isCold })
      moves.push({ tone: "urgent", title: cold.length + " qualified " + (cold.length === 1 ? "person is" : "people are") + " cold", desc: cold.map(function(p){return p.full_name + " (" + p.daysSince + "d)"}).join(", "), action: "Re-engage →" })
    }
    if (kpis.eventInvited < kpis.total) {
      moves.push({ tone: "urgent", title: "Send Jun 12 event invites to " + (kpis.total - kpis.eventInvited) + " qualified", desc: "The event is 22 days out — send invites now to lock in commitment.", action: "Send invites →" })
    }
    if (kpis.noBrochure > 0) {
      moves.push({ tone: "warm", title: "Send the brochure to " + kpis.noBrochure + " qualified", desc: "Standard first nurture asset — do this before the event.", action: "Send all →" })
    }
    if (kpis.total < 20) {
      moves.push({ tone: "ok", title: (20 - kpis.total) + " more qualified people needed to fill Jun 12", desc: "Promote from Prospect: schedule fit calls with the most engaged prospects so they can qualify in time.", action: "Show candidates →" })
    }
  }

  if (moves.length === 0) return null

  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: "22px 24px", marginBottom: 20 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>Suggested next moves</div>
        <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>Derived from action-tag gaps and stage-specific playbook</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {moves.map(function(m, i) {
          var toneStyles = {
            urgent: { bg: T.dangerBg, titleColor: T.danger },
            warm: { bg: T.warningBg, titleColor: T.warning },
            ok: { bg: T.successBg, titleColor: T.success },
            neutral: { bg: T.bg, titleColor: T.textPrimary },
          }[m.tone] || { bg: T.bg, titleColor: T.textPrimary }
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", padding: "12px 14px", borderRadius: 10, background: toneStyles.bg }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: toneStyles.titleColor }}>{m.title}</div>
                <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 1 }}>{m.desc}</div>
              </div>
              <button style={{ fontSize: 12, fontWeight: 500, padding: "6px 12px", borderRadius: 7, background: "white", border: "1px solid " + T.border, cursor: "pointer", color: T.textPrimary, fontFamily: "inherit", whiteSpace: "nowrap" }}>{m.action}</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Inventory list ───────────────────────────────────────────────────────────
function InventoryList({ stage, sections, filteredList, activeFilter, onClearFilter }) {
  var total = sections.fitScheduled.length + sections.staleList.length + sections.active.length
  var isFiltered = !!filteredList
  var FILTER_LABELS = {
    scheduled_fit:    "with fit call scheduled",
    fit_done:         "with completed fit call",
    missing_brochure: "missing brochure",
    missing_invite:   "missing event invite",
    stale:            "stale (>14 days)",
    cold:             "cold (>20 days)",
  }
  var filterLabel = FILTER_LABELS[activeFilter] || activeFilter

  // Determine row tone for flat (filtered) view
  function flatTone(p) {
    if (p.hasFitScheduled) return "scheduled"
    if (p.isCold || p.isStale) return "stale"
    return "active"
  }

  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: "22px 24px" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>
          {isFiltered
            ? "Showing " + filteredList.length + " of " + total + " — " + filterLabel
            : total + " " + (stage === "qualified" ? "qualified" : "prospects") + " — inventory view"
          }
        </div>
        <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>What each person has received so far &middot; click any row to open their LinkedIn profile</div>
      </div>

      {/* Active filter banner */}
      {isFiltered && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.bg, borderRadius: 8, marginBottom: 14, fontSize: 12 }}>
          <span style={{ color: T.textSecondary }}>Filter active:</span>
          <span style={{ fontWeight: 500, color: T.textPrimary }}>{filterLabel}</span>
          <span style={{ marginLeft: "auto" }}>
            <button onClick={onClearFilter} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, background: "white", border: "1px solid " + T.border, cursor: "pointer", color: T.textPrimary, fontFamily: "inherit", fontWeight: 500 }}>Clear filter ×</button>
          </span>
        </div>
      )}

      <div style={{ display: "flex", gap: 18, padding: "12px 16px", background: T.bg, borderRadius: 8, marginBottom: 12, fontSize: 11, color: T.textSecondary, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 999, fontSize: 10, background: T.audienceBg, color: T.audienceText, fontWeight: 500 }}><span style={{ color: T.success, fontWeight: 700 }}>✓</span> Example</span>
          <span>Has the item</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 999, fontSize: 10, background: "transparent", color: T.textTertiary, border: "1px dashed " + T.border, fontWeight: 500 }}>Example</span>
          <span>Missing</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 999, fontSize: 10, background: "transparent", color: T.textTertiary, border: "1px dashed " + T.border, fontWeight: 500 }}><span style={{ color: T.danger, fontWeight: 700 }}>⚠</span> Example</span>
          <span>Critical gap</span>
        </span>
      </div>

      {/* Filtered (flat) view */}
      {isFiltered && (
        <>
          {filteredList.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: T.textTertiary, fontSize: 13 }}>
              No matches for &ldquo;{filterLabel}&rdquo;.
            </div>
          )}
          {filteredList.map(function(p) {
            return <InventoryRow key={p.id} person={p} stage={stage} tone={flatTone(p)} />
          })}
        </>
      )}

      {/* Sectioned (unfiltered) view */}
      {!isFiltered && (
        <>
          {sections.fitScheduled.length > 0 && (
            <>
              <SectionHeader label="Fit call scheduled" count={sections.fitScheduled.length} />
              {sections.fitScheduled.map(function(p) { return <InventoryRow key={p.id} person={p} stage={stage} tone="scheduled" /> })}
            </>
          )}

          {sections.staleList.length > 0 && (
            <>
              <SectionHeader label="Stale — needs re-engagement" count={sections.staleList.length} />
              {sections.staleList.map(function(p) { return <InventoryRow key={p.id} person={p} stage={stage} tone="stale" /> })}
            </>
          )}

          {sections.active.length > 0 && (
            <>
              <SectionHeader label={stage === "qualified" ? "Qualified — active" : "Active prospects"} count={sections.active.length} />
              {sections.active.map(function(p) { return <InventoryRow key={p.id} person={p} stage={stage} tone="active" /> })}
            </>
          )}
        </>
      )}
    </div>
  )
}

function Legend({ bg, border, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 12, height: 12, borderRadius: 50, background: bg, border: "1px solid " + border, display: "inline-block" }} />
      {label}
    </span>
  )
}

function SectionHeader({ label, count }) {
  return (
    <div style={{ padding: "10px 16px", background: T.bg, borderRadius: 8, margin: "12px 0 8px", display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: T.textSecondary }}>
      {label}
      <span style={{ padding: "2px 8px", background: "white", border: "1px solid " + T.border, borderRadius: 999, fontSize: 11 }}>{count}</span>
    </div>
  )
}

function InventoryRow({ person, stage, tone }) {
  var rowBg = tone === "scheduled" ? "rgba(157,23,77,0.04)" : tone === "stale" ? "rgba(217,119,6,0.04)" : "transparent"
  var avatarBg = stage === "qualified" ? T.qualifiedBg : T.audienceBg
  var avatarText = stage === "qualified" ? T.qualifiedText : T.audienceText

  // Figure out the smart primary action
  var action = stage === "qualified" ? "Send brochure" : "Send brochure"
  if (person.isCold) action = "Re-engage urgently"
  else if (person.hasFitScheduled) action = "Prep call"
  else if (person.isStale) action = "Re-engage"

  // Build inventory bubbles — show different sets depending on stage
  var inventory = INVENTORY_ITEMS.filter(function(item) {
    // Hide qualified-only items for non-qualified stages
    if (item.qualifiedOnly && stage !== "qualified") return false
    return true
  })

  return (
    <div
      onClick={function() {
        if (person.linkedin_url) {
          window.open(person.linkedin_url, "_blank", "noopener,noreferrer")
        }
      }}
      style={{ padding: "14px 16px", borderBottom: "1px solid " + T.borderSoft, background: rowBg, cursor: person.linkedin_url ? "pointer" : "default" }}
    >
      {/* Row 1: avatar + name + meta + touch + action */}
      <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 110px auto", gap: 16, alignItems: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: 50, background: avatarBg, color: avatarText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{initials(person.full_name)}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.full_name || "—"}</div>
          <div style={{ fontSize: 11.5, color: T.textTertiary, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[person.title, person.company].filter(Boolean).join(" · ") || "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Last touch</div>
          <div style={{ fontSize: 11.5, color: touchColor(person.daysSince), fontWeight: person.isStale ? 500 : 400 }}>{touchLabel(person.daysSince)}</div>
        </div>
        <button onClick={function(e){ e.stopPropagation() }} style={{ fontSize: 12, fontWeight: 500, padding: "7px 12px", borderRadius: 7, background: person.isCold ? T.textPrimary : "white", color: person.isCold ? "white" : T.textPrimary, border: "1px solid " + (person.isCold ? T.textPrimary : T.border), cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{action}</button>
      </div>
      {/* Row 2: inventory bubbles */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10, paddingLeft: 52 }}>
        {inventory.map(function(item) {
          var has = person.tags.has(item.key)
          return <InventoryBubble key={item.key} item={item} has={has} />
        })}
      </div>
    </div>
  )
}

function InventoryBubble({ item, has }) {
  if (has) {
    // Has the item — colored pill with checkmark
    var colorMap = {
      audience: { bg: T.audienceBg, text: T.audienceText },
      prospect: { bg: T.prospectBg, text: T.prospectText },
      qualified: { bg: T.qualifiedBg, text: T.qualifiedText },
      member: { bg: T.memberBg, text: T.memberText },
    }
    var c = colorMap[item.color] || colorMap.audience
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: c.bg, color: c.text }}>
        <span style={{ color: T.success, fontWeight: 700 }}>✓</span> {item.label}
      </span>
    )
  }
  // Missing — gray outlined pill, no fill regardless of criticality
  // Critical items get a small ⚠ prefix so urgency reads without changing the whole pill color
  var isCritical = !!item.critical
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 500,
      background: "transparent",
      color: T.textTertiary,
      border: "1px dashed " + T.border,
    }}>
      {isCritical && <span style={{ color: T.danger, fontWeight: 700, fontSize: 12, lineHeight: 1 }}>⚠</span>}
      {item.label}
    </span>
  )
}
