"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"
import Avatar from "@/components/Avatar"

const META = {
  uninvited:          { label: "Uninvited",          desc: "CFOs you've never sent a connection request to.", action: "Send a connection request", color: "#64748b" },
  invite_pending:     { label: "Invite Pending",     desc: "Invited within the last 30 days, not yet accepted.", action: "Wait — auto-withdraws at 30 days",  color: "#b45309" },
  invite_lapsed:      { label: "Lapsed",             desc: "Invite auto-withdrawn after 30 days, never accepted — re-invitable next pass.", action: "Re-invite next pass", color: "#9a3412" },
  silent_connections: { label: "Silent Connections", desc: "Connected, but never replied to anything.",       action: "Re-ping about CFO Circle",        color: "#0f3d6e" },
  replied:            { label: "Replied",            desc: "CFOs who have ever replied to you (recovered from threads + tags).", action: "Move into the conversation / triage", color: "#15803d" },
  cfo_circle:         { label: "CFO Circle",          desc: "Everyone carrying the CFO Circle label — members and Blueprint affiliates, regardless of LinkedIn connection.", action: "Nurture / keep warm", color: "#ea580c" },
  out_of_market:      { label: "CFO audience · Out of market", desc: "CFO first-degree connections located outside the LA market. Part of the audience, but excluded from live in-person events.", action: "Invite to virtual / Lunch & Learn only", color: "#b91c1c" },
}

function fmtShort(iso) { if (!iso) return null; try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) } catch (e) { return iso } }
function daysSince(iso) { if (!iso) return null; const d = new Date(iso); if (isNaN(d)) return null; return Math.floor((Date.now() - d.getTime()) / 86400000) }
function csvEscape(v) { if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
function buildCsv(rows) {
  const cols = ["full_name", "title", "company", "location", "cfo_state", "linkedin_url", "last_meaningful_touch", "next_action_date"]
  const lines = [cols.join(",")]
  rows.forEach(function (r) { lines.push(cols.map(function (c) { return csvEscape(r[c]) }).join(",")) })
  return lines.join("\n")
}

const DAY_PRESETS = [30, 60, 90, 180, 365]

export default function SegmentPage() {
  const params = useParams()
  const key = params?.key
  const [people, setPeople] = useState(null)
  const [error, setError] = useState(null)
  const [days, setDays] = useState(30)
  const meta = META[key] || { label: key, desc: "", action: "", color: "#64748b" }
  const isLapsed = key === "invite_lapsed"

  function downloadCsv() {
    const csv = buildCsv(people || [])
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = key + "-" + new Date().toISOString().slice(0, 10) + ".csv"
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  useEffect(function () {
    if (!key) return
    setPeople(null)
    const qs = isLapsed ? `&days=${days}` : ""
    fetch(`/api/segment?key=${key}${qs}`)
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j } }) })
      .then(function (res) {
        if (!res.ok) { setError(res.j.error || "Failed to load"); setPeople([]); return }
        setPeople(res.j.people || [])
      })
      .catch(function (e) { setError(String(e)); setPeople([]) })
  }, [key, isLapsed, days])

  return (
    <main style={{ padding: "24px 28px 64px", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.textTertiary, marginBottom: 14 }}>
        <Link href="/dashboard" style={{ color: T.textTertiary, textDecoration: "none" }}>← Dashboard</Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: meta.color, display: "inline-block" }} />
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>{meta.label}</h1>
          {people && <span style={{ fontSize: 15, color: T.textTertiary, fontWeight: 500 }}>· {people.length}</span>}
        </div>
        {people && people.length > 0 && (
          <button onClick={downloadCsv} style={{ fontSize: 12, fontWeight: 600, color: meta.color, background: "transparent", border: "1px solid " + meta.color, borderRadius: 8, padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
            ↓ Download CSV
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 4 }}>
        {isLapsed ? `Sent a connection request, never accepted or replied, and not asked again in the last ${days} days -- eligible to ask again.` : meta.desc}
      </div>
      <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: isLapsed ? 10 : 18 }}>Next action: <strong style={{ color: meta.color }}>{isLapsed ? "Re-invite" : meta.action}</strong></div>

      {isLapsed && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: T.textTertiary }}>Not asked again in the last</span>
          <input type="number" min={1} value={days} onChange={function (e) { const v = parseInt(e.target.value, 10); setDays(Number.isFinite(v) && v > 0 ? v : 1) }}
            style={{ width: 70, padding: "5px 8px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none", background: "white" }} />
          <span style={{ fontSize: 12, color: T.textTertiary }}>days</span>
          <div style={{ display: "flex", gap: 5, marginLeft: 6 }}>
            {DAY_PRESETS.map(function (d) {
              return (
                <button key={d} onClick={function () { setDays(d) }}
                  style={{ fontSize: 11, fontWeight: 500, padding: "4px 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                    border: "1px solid " + (days === d ? meta.color : T.border), background: days === d ? meta.color : "white", color: days === d ? "white" : T.textSecondary }}>
                  {d >= 365 ? "1yr" : d + "d"}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {error && <div style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>⚠ {error}</div>}
      {people === null && <div style={{ fontSize: 13, color: T.textTertiary }}>Loading…</div>}
      {people && people.length === 0 && !error && <div style={{ fontSize: 13, color: T.textTertiary }}>Nobody in this segment right now.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 1, background: T.border, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden" }}>
        {(people || []).map(function (p) {
          const days = daysSince(p.last_meaningful_touch)
          return (
            <Link key={p.id} href={`/people/${p.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: T.cardBg }}>
                <Avatar name={p.full_name} src={p.avatar_url} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: T.textPrimary }}>{p.full_name || "(no name)"}</div>
                  <div style={{ fontSize: 12, color: T.textTertiary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[p.title, p.company].filter(Boolean).join(" · ") || "—"}</div>
                  {p.location && <div style={{ fontSize: 12, color: T.textTertiary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {p.location}</div>}
                  {p.status_tags && p.status_tags.length > 0 && (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 3 }}>
                      {p.status_tags.map(function (tg) {
                        return <span key={tg} style={{ fontSize: 10.5, fontWeight: 500, padding: "1px 7px", borderRadius: 4, background: "#eaf0f8", border: "1px solid #c7d5ea", color: "#1e3a5f" }}>{tg}</span>
                      })}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: days !== null && days >= 20 ? "#b91c1c" : days !== null && days >= 14 ? "#b45309" : T.textTertiary, whiteSpace: "nowrap" }}>
                  {days === null ? "no touch" : days === 0 ? "today" : days + "d ago"}
                </div>
                {p.next_action_date && (
                  <div style={{ fontSize: 11, color: meta.color, whiteSpace: "nowrap" }}>→ {fmtShort(p.next_action_date)}</div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </main>
  )
}
