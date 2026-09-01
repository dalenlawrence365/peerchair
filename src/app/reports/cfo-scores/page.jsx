"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"
import { scoreColor } from "@/lib/cfoScores"

function fmtDate(iso) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function ScorePill({ score, verdict }) {
  const c = scoreColor(score, verdict)
  return (
    <span style={{ display: "inline-block", minWidth: 30, textAlign: "center", padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: c.bg, color: c.fg, border: "1px solid " + c.border }}>
      {score}
    </span>
  )
}

export default function CfoScoresReportPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [sortKey, setSortKey] = useState("score")
  const [sortDir, setSortDir] = useState("desc")

  useEffect(function () {
    fetch("/api/reports/cfo-scores")
      .then(function (r) { return r.json() })
      .then(function (d) { if (d.error) setError(d.error); else setData(d) })
      .catch(function (e) { setError(e.message || String(e)) })
  }, [])

  function sortBy(key) {
    if (key === sortKey) setSortDir(sortDir === "desc" ? "asc" : "desc")
    else { setSortKey(key); setSortDir(key === "full_name" || key === "company" ? "asc" : "desc") }
  }

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!data) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  const rows = (data.rows || []).slice().sort(function (a, b) {
    let av = a[sortKey], bv = b[sortKey]
    if (typeof av === "string") { av = (av || "").toLowerCase(); bv = (bv || "").toLowerCase() }
    if (av == null) return 1
    if (bv == null) return -1
    if (av < bv) return sortDir === "asc" ? -1 : 1
    if (av > bv) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const th = function (key, label) {
    return (
      <th onClick={function () { sortBy(key) }} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer", userSelect: "none", borderBottom: "1px solid " + T.border }}>
        {label}{sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
      </th>
    )
  }

  return (
    <main style={{ padding: "26px 32px 64px", maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: T.textPrimary, margin: "0 0 4px" }}>CFO research scores</h1>
      <div style={{ fontSize: 13, color: T.textTertiary, marginBottom: 20 }}>
        {data.count} CFO{data.count === 1 ? "" : "s"} scored{data.avg_score != null ? " · average " + data.avg_score + "/100" : ""}. Latest research note only — click a name for the full writeup.
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: T.textTertiary }}>No scored research notes yet.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, overflow: "hidden" }}>
          <thead>
            <tr>
              {th("full_name", "Name")}
              {th("company", "Company")}
              {th("score", "Score")}
              {th("verdict", "Verdict")}
              {th("as_of", "As of")}
            </tr>
          </thead>
          <tbody>
            {rows.map(function (r) {
              return (
                <tr key={r.person_id} style={{ borderBottom: "1px solid " + T.borderSoft }}>
                  <td style={{ padding: "9px 12px", fontSize: 13 }}>
                    <Link href={"/people/" + r.person_id} style={{ color: T.textPrimary, fontWeight: 500, textDecoration: "none" }}>{r.full_name || "—"}</Link>
                  </td>
                  <td style={{ padding: "9px 12px", fontSize: 13, color: T.textSecondary }}>{r.company || "—"}</td>
                  <td style={{ padding: "9px 12px" }}><ScorePill score={r.score} verdict={r.verdict} /></td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: T.textSecondary }}>{r.verdict || "—"}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: T.textTertiary }}>{fmtDate(r.as_of)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}
