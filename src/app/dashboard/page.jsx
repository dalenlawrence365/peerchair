"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T, FONT_SERIF } from "@/lib/pipelineTheme"
import Avatar from "@/components/Avatar"

const ROLE_COLOR = { cfo: "#d97706", sponsor_contact: "#a855f7", referral_partner: "#10b981" }
const CHANNEL_COLOR = { LinkedIn: "#0a66c2", Calendly: "#006bff", Email: "#16a34a", Note: "#6b7280", Phone: "#f97316" }

const CFO_STAGES = ["pool", "audience", "prospect", "qualified", "member"]
const SPONSOR_STAGES = ["pool", "audience", "discovery", "proposal", "active"]
const REFERRAL_STAGES = ["pool", "audience", "active"]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}
function fmtRel(iso) {
  if (!iso) return ""
  const d = new Date(iso); const now = new Date()
  const diffMs = now - d
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return diffMin + "m ago"
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return diffHr + "h ago"
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 7) return diffDay + "d ago"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
function fmtShort(iso) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(function(){
    fetch("/api/dashboard")
      .then(function(r){ return r.json() })
      .then(function(d){ if (d.error) setError(d.error); else setData(d) })
      .catch(function(e){ setError(e.message || String(e)) })
  }, [])

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  const c = data.counts
  const a = data.audience || {}
  const q = data.queues
  const s = data.segments || {}
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  return (
    <main style={{ padding: "26px 32px 64px", maxWidth: 1280 }}>

      {/* Greeting */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: FONT_SERIF, fontSize: 32, fontWeight: 400, margin: 0, letterSpacing: -0.5 }}>{greeting()}, Dalen.</h1>
        <div style={{ fontSize: 13, color: T.textTertiary, marginTop: 4 }}>{today}</div>
      </div>

      {/* Audience — one row, largest to smallest */}
      <SectionHeader title="My audience" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 8 }}>
        {[
          { label: "Total reachable", value: a.reachable, color: "#0a66c2", href: "/linkedin-connections", wk: (a.wk || {}).reachable },
          { label: "Total relevant", value: a.relevant, color: "#15803d", href: "/linkedin-connections", wk: (a.wk || {}).relevant },
          { label: "ProVisor audience", value: a.provisor, color: "#7c3aed", href: "/linkedin-connections?role=provisor", wk: (a.wk || {}).provisor },
          { label: "CFO audience", value: a.cfo, color: "#d97706", href: "/linkedin-connections?role=cfo", wk: (a.wk || {}).cfo },
          { label: "Sponsor audience", value: a.sponsor, color: "#a855f7", href: "/linkedin-connections?role=sponsor", wk: (a.wk || {}).sponsor },
        ].sort(function(x, y){ return (y.value || 0) - (x.value || 0) }).map(function(t){
          return <StatTile key={t.label} label={t.label} value={(t.value || 0).toLocaleString()} color={t.color} href={t.href}
            pct={pctOf(t.value, a.reachable)} delta={t.wk} />
        })}
      </div>
      <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 24, lineHeight: 1.5 }}>
        Reachable = every first-degree LinkedIn connection. Relevant = reachable minus legacy (pre-2024). ProVisor / CFO / Sponsor overlap and never sum to the total.
      </div>

      {/* Top stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatTile label="CFO pipeline" value={c.cfo_total} color={ROLE_COLOR.cfo} href="/pipeline/cfo/pool" />
        <StatTile label="Sponsor contacts" value={c.sponsor_total} color={ROLE_COLOR.sponsor_contact} href="/pipeline/sponsor/pool" />
        <StatTile label="Referral partners" value={c.referral_total} color={ROLE_COLOR.referral_partner} href="/referral" />
        <StatTile label="Sponsor companies" value={c.sponsor_companies} color="#3b82f6" href="/pipeline/sponsor/pool" />
        <StatTile label="Upcoming meetings (7d)" value={c.upcoming_meetings} color="#0d9488" href="/meetings" />
        <StatTile label={c.linkedin_connections_unrated > 0 ? `First-degree connections (${c.linkedin_connections_unrated} no role)` : "First-degree connections"}
          value={c.linkedin_connections} color="#0a66c2" href="/linkedin-connections" />
      </div>

      {/* Action queues */}
      <SectionHeader title="Needs your attention" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        <QueueTile label="LinkedIn replies" count={q.reply_received} href="/inbox/follow-up" tone="amber" />
        <QueueTile label="Unread LinkedIn threads" count={q.unread_linkedin} href="/inbox/linkedin" tone="blue" />
        <QueueTile label="Auto-created (need role)" count={q.needs_role_review} href="/queue/review" tone="amber" />
      </div>

      {/* LinkedIn connection funnel — live segments off connection tags */}
      <SectionHeader title="LinkedIn connection funnel" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 8 }}>
        <StatTile label="Uninvited" value={s.uninvited ?? "—"} color="#64748b" />
        <StatTile label="Invite Pending" value={s.invite_pending ?? "—"} color="#b45309" href="/segment/invite_pending" />
        <StatTile label="Silent Connections" value={s.silent_connections ?? "—"} color="#0f3d6e" href="/segment/silent_connections" />
        <StatTile label="Replied" value={s.replied ?? "—"} color="#15803d" href="/segment/replied" />
      </div>
      <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 24, lineHeight: 1.5 }}>
        Click a tile for the list (Uninvited is count-only — too long to scroll). Excludes opt-outs / do-not-contact / not-a-fit.
      </div>

      {/* CFO + Sponsor pipeline distributions — side-by-side with clear separation */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        <div>
          <SectionHeader title="CFO pipeline by stage" />
          <PipelineBar stages={CFO_STAGES} counts={c.cfo} hrefBase="/pipeline/cfo" color={ROLE_COLOR.cfo} compact />
        </div>
        <div>
          <SectionHeader title="Sponsor pipeline by stage" />
          <PipelineBar stages={SPONSOR_STAGES} counts={c.sponsor} hrefBase="/pipeline/sponsor" color={ROLE_COLOR.sponsor_contact} compact />
        </div>
      </div>

      {/* Referral + this-week KPIs — three grouped tile clusters on one row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32, marginTop: 24 }}>
        <div>
          <SectionHeader title="Referral partners by stage" />
          <PipelineBar stages={REFERRAL_STAGES} counts={c.referral} hrefBase="/referral" color={ROLE_COLOR.referral_partner} referralMode compact />
        </div>
        <div>
          <SectionHeader title="Fit calls (this week)" />
          <PipelineBar
            stages={["Scheduled", "Completed"]}
            counts={{ Scheduled: (data.weekly && data.weekly.fit_scheduled) || 0, Completed: (data.weekly && data.weekly.fit_completed) || 0 }}
            hrefBase="/meetings"
            color={ROLE_COLOR.cfo}
            referralMode
            compact
            hidePct
          />
        </div>
        <div>
          <SectionHeader title="Sponsor discoveries (this week)" />
          <PipelineBar
            stages={["Scheduled", "Completed"]}
            counts={{ Scheduled: (data.weekly && data.weekly.discovery_scheduled) || 0, Completed: (data.weekly && data.weekly.discovery_completed) || 0 }}
            hrefBase="/meetings"
            color={ROLE_COLOR.sponsor_contact}
            referralMode
            compact
            hidePct
          />
        </div>
      </div>

      {/* Left half: upcoming calls + discoveries (condensed, stacked) · Right half: connection volume */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 28, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 18 }}>
          <Card title="Upcoming fit calls">
            {data.fit_calls.length === 0 ? <Empty msg="No fit calls scheduled." /> : data.fit_calls.map(function(p){
              return (
                <PersonRow key={p.id} person={p} subtitle={p.tag_notes || "Fit call scheduled"} time={fmtRel(p.tag_set_at)} />
              )
            })}
          </Card>
          <Card title="Upcoming sponsor discoveries">
            {data.sponsor_discoveries.length === 0 ? <Empty msg="No sponsor discoveries scheduled." /> : data.sponsor_discoveries.map(function(p){
              return (
                <PersonRow key={p.id} person={p} subtitle={p.tag_notes || "Discovery scheduled"} time={fmtRel(p.tag_set_at)} />
              )
            })}
          </Card>
        </div>
        <div style={{ display: "grid", gap: 18, gridAutoRows: "min-content" }}>
          <ConnStat label="Connection requests sent" total={(data.connections && data.connections.requests_total) || 0} week={(data.connections && data.connections.requests_week) || 0} color="#0a66c2" />
          <ConnStat label="Connections made" total={(data.connections && data.connections.accepted_total) || 0} week={(data.connections && data.connections.accepted_week) || 0} color="#15803d" />
        </div>
      </div>

      {/* Recent activity */}
      <div style={{ marginTop: 18 }}>
        <Card title="Recent activity">
          {data.activity.length === 0 ? <Empty msg="No activity yet." /> : data.activity.map(function(a){
            const isOut = a.direction === "OUT" || a.direction === "outbound"
            const accent = CHANNEL_COLOR[a.channel] || "#888"
            return (
              <Link key={a.id} href={`/people/${a.person_id}`} style={{
                display: "block", padding: "10px 12px", borderRadius: 6,
                borderLeft: "3px solid " + accent, marginBottom: 4,
                textDecoration: "none", color: T.textPrimary,
                background: "rgba(0,0,0,0.015)"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{a.person_name}</span>
                    <span style={{ fontSize: 11, color: T.textTertiary, marginLeft: 8 }}>
                      {a.channel} · {isOut ? "→ outgoing" : "← incoming"}{a.step_label ? " · " + a.step_label : ""}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>{fmtRel(a.occurred_at)}</span>
                </div>
                {a.body && (
                  <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.body}</div>
                )}
              </Link>
            )
          })}
        </Card>
      </div>

    </main>
  )
}

// ─── Reusable bits ───────────────────────────────────────────────────────────
function pctOf(v, total) {
  if (!total || v == null) return null
  const p = (v / total) * 100
  return (p >= 100 ? "100" : p >= 10 ? p.toFixed(0) : p.toFixed(1)) + "%"
}
function StatTile({ label, value, color, href, pct, delta }) {
  const inner = (
    <div style={{
      background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10,
      padding: "16px 18px", borderTop: "3px solid " + color,
      cursor: href ? "pointer" : "default"
    }}>
      <div style={{ fontSize: 28, fontWeight: 600, color: T.textPrimary, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 }}>{label}</div>
      {(pct != null || delta != null) && (
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginTop: 7 }}>
          {pct != null && <span style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary }}>{pct}</span>}
          {delta != null && (
            <span style={{ fontSize: 11, fontWeight: 500, color: delta > 0 ? "#15803d" : T.textTertiary }}>
              {delta > 0 ? "\u25B2 " + delta + " this wk" : "\u2014"}
            </span>
          )}
        </div>
      )}
    </div>
  )
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link> : inner
}

function ConnStat({ label, total, week, color }) {
  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: "18px 20px", borderTop: "3px solid " + color }}>
      <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 600, color: T.textPrimary, lineHeight: 1.1, marginTop: 8 }}>{total}</div>
      <div style={{ fontSize: 12, color: week > 0 ? color : T.textTertiary, marginTop: 6, fontWeight: 500 }}>
        {week > 0 ? "\u25B2 " + week + " this week" : "none this week"}
      </div>
      <div style={{ fontSize: 10.5, color: T.textTertiary, marginTop: 8 }}>manual + automated</div>
    </div>
  )
}

function QueueTile({ label, count, href, tone }) {
  const bg = tone === "amber" && count > 0 ? "#fef3c7" : tone === "blue" && count > 0 ? "#dbeafe" : T.cardBg
  const fg = tone === "amber" && count > 0 ? "#92400e" : tone === "blue" && count > 0 ? "#1e40af" : T.textPrimary
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        background: bg, border: "1px solid " + T.border, borderRadius: 10,
        padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer"
      }}>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: count > 0 ? fg : T.textTertiary, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>{count > 0 ? "Open →" : "Clear"}</div>
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, color: count > 0 ? fg : T.textTertiary }}>{count}</div>
      </div>
    </Link>
  )
}

function SectionHeader({ title }) {
  return <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7, color: T.textTertiary, fontWeight: 600, margin: "8px 2px 10px" }}>{title}</div>
}

function PipelineBar({ stages, counts, hrefBase, color, referralMode, compact, hidePct }) {
  const total = stages.reduce(function(s, k){ return s + (counts[k] || 0) }, 0) || 1
  const padding = compact ? "8px 10px" : "12px 14px"
  const numSize = compact ? 18 : 22
  const minW    = compact ? 56 : 80
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {stages.map(function(stage){
        const n = counts[stage] || 0
        const pct = Math.round((n / total) * 100)
        const href = referralMode ? hrefBase : hrefBase + "/" + stage
        return (
          <Link key={stage} href={href} style={{ flex: 1, textDecoration: "none", minWidth: minW }}>
            <div style={{
              background: T.cardBg, border: "1px solid " + T.border, borderRadius: 8,
              padding: padding, borderLeft: "3px solid " + color, cursor: "pointer"
            }}>
              <div style={{ fontSize: numSize, fontWeight: 600, color: T.textPrimary, lineHeight: 1 }}>{n.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 4 }}>{stage}</div>
              {!hidePct && <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 2 }}>{pct}%</div>}
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

function Empty({ msg }) {
  return <div style={{ color: T.textTertiary, fontSize: 13, padding: "8px 0" }}>{msg}</div>
}

function PersonRow({ person, subtitle, time }) {
  return (
    <Link href={`/people/${person.id}`} style={{ textDecoration: "none", color: T.textPrimary }}>
      <div style={{ padding: "8px 0", borderBottom: "1px solid " + (T.borderSoft || "rgba(0,0,0,0.04)"), display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          <Avatar name={person.full_name} src={person.avatar_url} size={32} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.full_name}</div>
            <div style={{ fontSize: 11, color: T.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[person.title, person.company].filter(Boolean).join(" · ") || subtitle}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>{time}</div>
      </div>
    </Link>
  )
}
