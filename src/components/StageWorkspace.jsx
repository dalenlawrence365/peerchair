"use client"
import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { sbFetch } from "@/lib/appShared"

// ─── Design tokens (light theme, mockup palette) ──────────────────────────────
const T = {
  // Sidebar
  sidebarBg: "#0d1729",
  sidebarBorder: "#1c2942",
  sidebarText: "#94a3b8",
  sidebarMuted: "#64748b",
  sidebarActive: "#ffffff",
  sidebarActiveBg: "#1c2942",
  sidebarSectionLabel: "#475569",
  // Surfaces
  bg: "#f7f8fa",
  cardBg: "#ffffff",
  border: "#e7e8ec",
  borderSoft: "#eff0f3",
  // Text
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textTertiary: "#94a3b8",
  // Accents
  accent: "#2563eb",
  success: "#16a34a",
  successBg: "#ecfdf5",
  warning: "#d97706",
  warningBg: "#fffbeb",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  // Stage palette (pool, audience, prospect, qualified, member)
  poolBg: "#f1f5f9", poolText: "#475569",
  audienceBg: "#dbeafe", audienceText: "#1e40af",
  prospectBg: "#fce7f3", prospectText: "#9d174d",
  qualifiedBg: "#fef3c7", qualifiedText: "#92400e",
  memberBg: "#d1fae5", memberText: "#065f46",
}

const FONT_FAMILY = '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const FONT_SERIF = '"Instrument Serif", serif'

// Inject Google Fonts once
function useGoogleFonts() {
  useEffect(function() {
    if (typeof document === "undefined") return
    if (document.getElementById("dmsans-fonts")) return
    var preconnect1 = document.createElement("link")
    preconnect1.rel = "preconnect"; preconnect1.href = "https://fonts.googleapis.com"
    var preconnect2 = document.createElement("link")
    preconnect2.rel = "preconnect"; preconnect2.href = "https://fonts.gstatic.com"; preconnect2.crossOrigin = "anonymous"
    var link = document.createElement("link")
    link.id = "dmsans-fonts"
    link.rel = "stylesheet"
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Instrument+Serif&display=swap"
    document.head.appendChild(preconnect1)
    document.head.appendChild(preconnect2)
    document.head.appendChild(link)
  }, [])
}

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
  useGoogleFonts()
  var [people, setPeople] = useState([])
  var [actionTagsByPerson, setActionTagsByPerson] = useState({})
  var [statusTagsByPerson, setStatusTagsByPerson] = useState({})
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState(null)

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

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: FONT_FAMILY, color: T.textPrimary, fontSize: 14, lineHeight: 1.5 }}>

      <Sidebar activeStage={stage} kpis={kpis} />

      <main style={{ flex: 1, minWidth: 0, padding: "28px 32px 48px", maxWidth: 1600 }}>

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
            <MiniKpis stage={stage} kpis={kpis} />
            <SuggestedMoves stage={stage} kpis={kpis} enriched={enriched} />
            <InventoryList stage={stage} sections={sections} />
          </>
        )}

        <div style={{ textAlign: "center", color: T.textTertiary, fontSize: 12, marginTop: 28, paddingTop: 20, borderTop: "1px solid " + T.border }}>
          Live data from PeerChair · {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>
      </main>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ activeStage, kpis }) {
  return (
    <aside style={{ width: 240, flexShrink: 0, background: T.sidebarBg, color: T.sidebarText, display: "flex", flexDirection: "column", padding: "24px 16px", position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 24px", marginBottom: 16, borderBottom: "1px solid " + T.sidebarBorder }}>
        <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #3b82f6, #1e40af)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontFamily: FONT_SERIF, fontSize: 18, fontStyle: "italic" }}>C</div>
        <div>
          <div style={{ fontFamily: FONT_SERIF, fontSize: 18, color: "white", lineHeight: 1 }}>CFO Circle</div>
          <div style={{ fontSize: 11, color: T.sidebarMuted, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 2 }}>Los Angeles</div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: T.sidebarSectionLabel, padding: "0 8px 8px", fontWeight: 500 }}>Workspace</div>
        <SidebarLink href="/" label="Dashboard" />
        <SidebarLink href="/pipeline/cfo/prospect" label="Pipeline" count="55" active />
        <SidebarLink href="/" label="Sponsors" count="119" />
        <SidebarLink href="/" label="Events" />
        <SidebarLink href="/" label="Today" />
        <SidebarLink href="/" label="Find a person" />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: T.sidebarSectionLabel, padding: "0 8px 8px", fontWeight: 500 }}>Settings</div>
        <SidebarLink href="/" label="Reports" />
        <SidebarLink href="/" label="Settings" />
      </div>

      <div style={{ marginTop: "auto", padding: 12, background: T.sidebarActiveBg, borderRadius: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ width: 36, height: 36, borderRadius: 999, background: "linear-gradient(135deg, #f59e0b, #d97706)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 600, fontSize: 14 }}>DL</div>
        <div>
          <div style={{ color: "white", fontSize: 13, fontWeight: 500 }}>Dalen Lawrence</div>
          <div style={{ color: T.sidebarMuted, fontSize: 11 }}>Chapter Director</div>
        </div>
      </div>
    </aside>
  )
}

function SidebarLink({ href, label, count, active }) {
  return (
    <Link href={href} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 10px", color: active ? T.sidebarActive : T.sidebarText, borderRadius: 7, fontSize: 14, textDecoration: "none", background: active ? T.sidebarActiveBg : "transparent", fontWeight: active ? 500 : 400, marginBottom: 1 }}>
      {label}
      {count && <span style={{ marginLeft: "auto", fontSize: 11, background: active ? T.accent : T.sidebarBorder, color: active ? "white" : T.sidebarText, padding: "1px 7px", borderRadius: 999, fontWeight: 500 }}>{count}</span>}
    </Link>
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
function MiniKpis({ stage, kpis }) {
  var cards = []
  if (stage === "prospect") {
    cards = [
      { label: "Scheduled fit call", value: kpis.fitSched, tone: kpis.fitSched > 0 ? "warm" : "neutral", meta: kpis.fitSched > 0 ? "Prep needed" : "None scheduled" },
      { label: "Fit calls completed", value: kpis.fitDone, tone: "neutral", meta: "Ready to promote" },
      { label: "Missing brochure", value: kpis.noBrochure, tone: kpis.noBrochure > 0 ? "urgent" : "ok", meta: kpis.noBrochure > 0 ? "of " + kpis.total : "All have it" },
      { label: "Stale (>14 days)", value: kpis.stale, tone: kpis.stale > 0 ? "warm" : "ok", meta: "No contact in 14+ days" },
      { label: "Cold (>20 days)", value: kpis.cold, tone: kpis.cold > 0 ? "urgent" : "ok", meta: "Re-engage urgently" },
    ]
  } else if (stage === "qualified") {
    cards = [
      { label: "Event runway", value: "22d", tone: "warm", meta: "Until Jun 12 event" },
      { label: "Capacity gap", value: Math.max(0, 20 - kpis.eventInvited), tone: "urgent", meta: kpis.eventInvited + " of 20 invited" },
      { label: "Missing brochure", value: kpis.noBrochure, tone: kpis.noBrochure > 0 ? "urgent" : "ok", meta: kpis.noBrochure > 0 ? "of " + kpis.total : "All have it" },
      { label: "Fit calls done", value: kpis.fitDone, tone: "neutral", meta: kpis.fitDone + " of " + kpis.total },
      { label: "Cold (>20 days)", value: kpis.cold, tone: kpis.cold > 0 ? "warm" : "ok", meta: "Re-engage" },
    ]
  } else {
    cards = [
      { label: "Total in stage", value: kpis.total, tone: "neutral", meta: "" },
      { label: "Stale (>14d)", value: kpis.stale, tone: kpis.stale > 0 ? "warm" : "ok", meta: "" },
    ]
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(" + cards.length + ", 1fr)", gap: 14, marginBottom: 20 }}>
      {cards.map(function(c, i) {
        var toneStyles = {
          urgent: { bg: T.dangerBg, border: "rgba(220,38,38,0.15)", text: T.danger },
          warm: { bg: T.warningBg, border: "rgba(217,119,6,0.15)", text: T.warning },
          ok: { bg: T.successBg, border: "rgba(22,163,74,0.15)", text: T.success },
          neutral: { bg: T.cardBg, border: T.border, text: T.textPrimary },
        }[c.tone] || { bg: T.cardBg, border: T.border, text: T.textPrimary }
        return (
          <div key={i} style={{ background: toneStyles.bg, border: "1px solid " + toneStyles.border, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: toneStyles.text === T.textPrimary ? T.textSecondary : toneStyles.text, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500, marginBottom: 6 }}>{c.label}</div>
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
function InventoryList({ stage, sections }) {
  var total = sections.fitScheduled.length + sections.staleList.length + sections.active.length

  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: "22px 24px" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>{total} {stage === "qualified" ? "qualified" : "prospects"} — inventory view</div>
        <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>What each person has received so far &middot; click any row to open the full profile</div>
      </div>

      <div style={{ display: "flex", gap: 14, padding: "12px 16px", background: T.bg, borderRadius: 8, marginBottom: 12, fontSize: 11, color: T.textSecondary, flexWrap: "wrap", alignItems: "center" }}>
        <Legend bg={T.memberBg} border={T.memberText} label="Has the item" />
        <Legend bg="transparent" border={T.border} label="Missing" />
        <Legend bg="rgba(220,38,38,0.04)" border="rgba(220,38,38,0.3)" label="Critical gap" />
      </div>

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
    <div style={{ padding: "14px 16px", borderBottom: "1px solid " + T.borderSoft, background: rowBg, cursor: "pointer" }}>
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
    // Has the item — colored badge
    var colorMap = {
      audience: { bg: T.audienceBg, text: T.audienceText },
      prospect: { bg: T.prospectBg, text: T.prospectText },
      qualified: { bg: T.qualifiedBg, text: T.qualifiedText },
      member: { bg: T.memberBg, text: T.memberText },
    }
    var c = colorMap[item.color] || colorMap.audience
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: c.bg, color: c.text }}>
        ✓ {item.label}
      </span>
    )
  }
  // Missing
  var isCritical = !!item.critical
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 500,
      background: isCritical ? "rgba(220,38,38,0.04)" : "transparent",
      color: isCritical ? T.danger : T.textTertiary,
      border: "1px solid " + (isCritical ? "rgba(220,38,38,0.3)" : T.border),
    }}>
      {item.label}
    </span>
  )
}
