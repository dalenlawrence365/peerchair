"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T, FONT_SERIF } from "@/lib/pipelineTheme"

const ROLE_COLOR = { cfo: "#d97706", sponsor_contact: "#a855f7", referral_partner: "#10b981" }
const CHANNEL_COLOR = { LinkedIn: "#0a66c2", Calendly: "#006bff", Email: "#16a34a", Note: "#6b7280", Phone: "#f97316" }

const CFO_STAGES = ["pool", "audience", "prospect", "qualified", "member"]
const SPONSOR_STAGES = ["pool", "audience", "discovery", "proposal", "active"]

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
  const q = data.queues
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  return (
    <main style={{ padding: "26px 32px 64px", maxWidth: 1280 }}>

      {/* Greeting */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: FONT_SERIF, fontSize: 32, fontWeight: 400, margin: 0, letterSpacing: -0.5 }}>{greeting()}, Dalen.</h1>
        <div style={{ fontSize: 13, color: T.textTertiary, marginTop: 4 }}>{today}</div>
      </div>

      {/* Top stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatTile label="CFO pipeline" value={c.cfo_total} color={ROLE_COLOR.cfo} href="/pipeline/cfo/pool" />
        <StatTile label="Sponsor contacts" value={c.sponsor_total} color={ROLE_COLOR.sponsor_contact} href="/pipeline/sponsor/pool" />
        <StatTile label="Referral partners" value={c.referral_total} color={ROLE_COLOR.referral_partner} href="/referral" />
        <StatTile label="Sponsor companies" value={c.sponsor_companies} color="#3b82f6" />
      </div>

      {/* Action queues */}
      <SectionHeader title="Needs your attention" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        <QueueTile label="LinkedIn replies" count={q.reply_received} href="/inbox/follow-up" tone="amber" />
        <QueueTile label="Unread LinkedIn threads" count={q.unread_linkedin} href="/inbox/linkedin" tone="blue" />
        <QueueTile label="Auto-created (need role)" count={q.needs_role_review} href="/queue/review" tone="amber" />
      </div>

      {/* CFO pipeline distribution */}
      <SectionHeader title="CFO pipeline by stage" />
      <PipelineBar stages={CFO_STAGES} counts={c.cfo} hrefBase="/pipeline/cfo" color={ROLE_COLOR.cfo} />

      {/* Sponsor pipeline distribution */}
      <div style={{ marginTop: 18 }}>
        <SectionHeader title="Sponsor pipeline by stage" />
        <PipelineBar stages={SPONSOR_STAGES} counts={c.sponsor} hrefBase="/pipeline/sponsor" color={ROLE_COLOR.sponsor_contact} />
      </div>

      {/* Two-column: Upcoming calls + Recent activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 28 }}>
        <Card title="Upcoming fit calls">
          {data.fit_calls.length === 0 ? <Empty msg="No fit calls scheduled." /> : data.fit_calls.map(function(p){
            return (
              <PersonRow key={p.id} person={p} subtitle={p.tag_notes || "Fit call scheduled"} time={fmtRel(p.tag_set_at)} />
            )
          })}
        </Card>
        <Card title="Sponsor discoveries">
          {data.sponsor_discoveries.length === 0 ? <Empty msg="No sponsor discoveries scheduled." /> : data.sponsor_discoveries.map(function(p){
            return (
              <PersonRow key={p.id} person={p} subtitle={p.tag_notes || "Discovery scheduled"} time={fmtRel(p.tag_set_at)} />
            )
          })}
        </Card>
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
function StatTile({ label, value, color, href }) {
  const inner = (
    <div style={{
      background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10,
      padding: "16px 18px", borderTop: "3px solid " + color,
      cursor: href ? "pointer" : "default"
    }}>
      <div style={{ fontSize: 28, fontWeight: 600, color: T.textPrimary, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 }}>{label}</div>
    </div>
  )
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link> : inner
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

function PipelineBar({ stages, counts, hrefBase, color }) {
  const total = stages.reduce(function(s, k){ return s + (counts[k] || 0) }, 0) || 1
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {stages.map(function(stage){
        const n = counts[stage] || 0
        const pct = Math.round((n / total) * 100)
        return (
          <Link key={stage} href={hrefBase + "/" + stage} style={{ flex: Math.max(1, n), textDecoration: "none", minWidth: 80 }}>
            <div style={{
              background: T.cardBg, border: "1px solid " + T.border, borderRadius: 8,
              padding: "12px 14px", borderLeft: "3px solid " + color, cursor: "pointer"
            }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: T.textPrimary, lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: 10, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 4 }}>{stage}</div>
              <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 2 }}>{pct}%</div>
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
      <div style={{ padding: "8px 0", borderBottom: "1px solid " + (T.borderSoft || "rgba(0,0,0,0.04)"), display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.full_name}</div>
          <div style={{ fontSize: 11, color: T.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[person.title, person.company].filter(Boolean).join(" · ") || subtitle}
          </div>
        </div>
        <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>{time}</div>
      </div>
    </Link>
  )
}
