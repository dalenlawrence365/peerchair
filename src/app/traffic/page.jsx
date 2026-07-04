"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T, FONT_SERIF } from "@/lib/pipelineTheme"

const WINDOWS = [7, 30, 90]

function fmtRel(iso) {
  if (!iso) return ""
  const mins = (Date.now() - new Date(iso)) / 60000
  if (mins < 60) return Math.max(1, Math.round(mins)) + "m ago"
  if (mins < 1440) return Math.round(mins / 60) + "h ago"
  const days = mins / 1440
  if (days < 30) return Math.round(days) + "d ago"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const PAGE_LABEL = { home: "Home", overview: "Brochure", assessment: "Assessment", meeting: "Meeting" }

function Tile({ label, value, sub, color }) {
  return (
    <div style={{
      background: T.cardBg, border: "1px solid " + T.border,
      borderTop: "3px solid " + (color || T.accent),
      borderRadius: 10, padding: "16px 16px", minWidth: 0,
    }}>
      <div style={{ fontSize: 28, fontWeight: 600, color: T.textPrimary, lineHeight: 1 }}>
        {(value ?? 0).toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      {sub != null && <div style={{ fontSize: 11, color: color || T.accent, marginTop: 4, fontWeight: 600 }}>{sub}</div>}
    </div>
  )
}

function Card({ title, note, children }) {
  return (
    <section style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: "18px 18px 20px", marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, margin: 0 }}>{title}</h2>
        {note && <span style={{ fontSize: 11, color: T.textTertiary }}>{note}</span>}
      </div>
      {children}
    </section>
  )
}

function Trend({ rows }) {
  if (!rows || rows.length === 0) return <Empty text="No views in this window yet." />
  const w = 720, h = 120, pad = 4
  const max = Math.max(1, ...rows.map(r => r.views))
  const bw = (w - pad * 2) / rows.length
  return (
    <svg viewBox={`0 0 ${w} ${h + 22}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {rows.map((r, i) => {
        const x = pad + i * bw
        const bh = Math.round((r.views / max) * h)
        const ah = Math.round((r.attributed_views / max) * h)
        return (
          <g key={r.day}>
            <title>{r.day}: {r.views} views, {r.unique_visitors} unique, {r.attributed_views} attributed</title>
            <rect x={x + 1} y={h - bh} width={Math.max(1, bw - 2)} height={bh} rx={2} fill={T.audienceBg} />
            {ah > 0 && <rect x={x + 1} y={h - ah} width={Math.max(1, bw - 2)} height={ah} rx={2} fill={T.accent} />}
          </g>
        )
      })}
      {rows.length > 1 && [rows[0], rows[rows.length - 1]].map((r, k) => (
        <text key={k} x={k === 0 ? pad : w - pad} y={h + 16} textAnchor={k === 0 ? "start" : "end"}
          fontSize={10} fill={T.textTertiary}>
          {new Date(r.day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </text>
      ))}
    </svg>
  )
}

function Empty({ text }) {
  return <div style={{ fontSize: 13, color: T.textTertiary, padding: "10px 2px" }}>{text}</div>
}

function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0 }

function Bar({ label, value, of, color }) {
  const p = pct(value, of)
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: T.textSecondary, fontWeight: 500 }}>{label}</span>
        <span style={{ color: T.textTertiary }}>{value.toLocaleString()} <span style={{ color: T.textTertiary }}>· {p}%</span></span>
      </div>
      <div style={{ height: 8, background: T.borderSoft, borderRadius: 999 }}>
        <div style={{ width: p + "%", height: "100%", background: color, borderRadius: 999 }} />
      </div>
    </div>
  )
}

export default function TrafficPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(function () {
    setData(null); setError(null)
    fetch("/api/traffic-metrics?days=" + days)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(e => setError(String(e)))
  }, [days])

  const t = data?.totals || {}
  const funnel = data?.funnel || {}
  const bySource = data?.by_source || []
  const byPage = data?.by_page || []
  const recent = data?.recent || []

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: FONT_SERIF, fontSize: 30, fontWeight: 400, color: T.textPrimary, margin: 0, lineHeight: 1.1 }}>Site traffic</h1>
          <p style={{ fontSize: 13, color: T.textSecondary, margin: "6px 0 0", maxWidth: 620 }}>
            Every view of the CFO Circle pages. <strong>Attributed</strong> = resolved to a person via their outreach link;
            the rest is anonymous volume. Bots and link-preview crawlers are filtered out.
          </p>
        </div>
        <div style={{ display: "flex", gap: 4, background: T.cardBg, border: "1px solid " + T.border, borderRadius: 8, padding: 3 }}>
          {WINDOWS.map(function (d) {
            const on = d === days
            return (
              <button key={d} onClick={() => setDays(d)} style={{
                border: "none", cursor: "pointer", fontFamily: "inherit",
                padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: on ? T.accent : "transparent", color: on ? "white" : T.textSecondary,
              }}>{d}d</button>
            )
          })}
        </div>
      </div>

      {error && <div style={{ color: T.danger, marginTop: 20 }}>⚠ {error}</div>}
      {!data && !error && <div style={{ color: T.textTertiary, marginTop: 20 }}>Loading…</div>}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 20 }}>
            <Tile label="Views" value={t.views} color={T.accent} />
            <Tile label="Unique visitors" value={t.unique_visitors} color="#0891b2" />
            <Tile label="Attributed views" value={t.attributed_views} sub={pct(t.attributed_views, t.views) + "% of views"} color={T.success} />
            <Tile label="People reached" value={t.attributed_people} color="#7c3aed" />
            <Tile label="Bots filtered" value={t.bot_views} color={T.textTertiary} />
          </div>

          <Card title="Views over time" note={days + "-day trend · brass = attributed to a person"}>
            <Trend rows={data.by_day} />
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 0 }}>
            <Card title="By channel" note="which source drives traffic">
              {bySource.length === 0 ? <Empty text="No traffic yet." /> : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: T.textTertiary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>
                      <th style={{ padding: "0 0 8px", fontWeight: 500 }}>Source</th>
                      <th style={{ padding: "0 0 8px", fontWeight: 500, textAlign: "right" }}>Views</th>
                      <th style={{ padding: "0 0 8px", fontWeight: 500, textAlign: "right" }}>Unique</th>
                      <th style={{ padding: "0 0 8px", fontWeight: 500, textAlign: "right" }}>Attrib.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySource.map(function (s) {
                      return (
                        <tr key={s.src} style={{ borderTop: "1px solid " + T.borderSoft }}>
                          <td style={{ padding: "8px 0", color: T.textPrimary, fontWeight: 500 }}>{s.src}</td>
                          <td style={{ padding: "8px 0", textAlign: "right", color: T.textSecondary }}>{s.views.toLocaleString()}</td>
                          <td style={{ padding: "8px 0", textAlign: "right", color: T.textSecondary }}>{s.unique_visitors.toLocaleString()}</td>
                          <td style={{ padding: "8px 0", textAlign: "right", color: s.attributed_views > 0 ? T.success : T.textTertiary, fontWeight: s.attributed_views > 0 ? 600 : 400 }}>{s.attributed_views.toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Page-chain reach" note="unique visitors per step">
              <Bar label="Brochure" value={funnel.overview || 0} of={Math.max(funnel.overview || 0, 1)} color={T.audienceText} />
              <Bar label="Assessment" value={funnel.assessment || 0} of={Math.max(funnel.overview || 0, 1)} color="#7c3aed" />
              <Bar label="Meeting" value={funnel.meeting || 0} of={Math.max(funnel.overview || 0, 1)} color={T.success} />
              <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 6 }}>
                Bars are % of brochure reach — the drop-off from brochure → assessment → meeting is where the funnel leaks.
              </div>
            </Card>
          </div>

          <Card title="Recent attributed activity" note="named people, most recent first">
            {recent.length === 0 ? (
              <Empty text="No attributed views yet. Attribution starts once outreach links carry a person token (from the next tokenized CSV export)." />
            ) : (
              <div>
                {recent.map(function (r, i) {
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid " + T.borderSoft }}>
                      <Link href={"/people/" + r.person_id} style={{ color: T.textPrimary, fontWeight: 500, textDecoration: "none", minWidth: 160 }}>{r.name}</Link>
                      <span style={{ fontSize: 12, color: T.textSecondary }}>{r.event === "engaged" ? "engaged with" : "viewed"} <strong>{PAGE_LABEL[r.page] || r.page}</strong></span>
                      {r.src && r.src !== "(direct)" && <span style={{ fontSize: 11, color: T.textTertiary }}>· {r.src}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 11, color: T.textTertiary }}>{fmtRel(r.created_at)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </main>
  )
}
