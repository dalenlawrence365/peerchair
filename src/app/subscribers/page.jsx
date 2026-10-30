"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

function fmtDate(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })
}
function sourceLabel(s) {
  if (!s) return "Unknown"
  if (/-confirmation$/.test(s)) return "After registering · " + s.replace(/-confirmation$/, "")
  if (s === "website" || s === "invitations") return "Invitations page"
  return s
}
function csvCell(v) { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }

export default function SubscribersPage() {
  const [tab, setTab] = useState("subscribed")
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState("")
  const [source, setSource] = useState("all")
  const [unmatchedOnly, setUnmatchedOnly] = useState(false)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    setData(null); setError(null)
    fetch("/api/subscribers?tab=" + tab).then(r => r.json()).then(d => { if (d.error) setError(d.error); else setData(d) }).catch(e => setError(e.message || String(e)))
  }, [tab])

  const sources = useMemo(() => {
    const m = new Map()
    for (const p of (data ? data.people : [])) m.set(p.source || "", sourceLabel(p.source))
    return [...m.entries()]
  }, [data])

  const rows = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    return data.people.filter(p => {
      if (source !== "all" && (p.source || "") !== source) return false
      if (unmatchedOnly && !p.unmatched) return false
      if (needle && !((p.name || "") + " " + (p.email || "") + " " + (p.company || "")).toLowerCase().includes(needle)) return false
      return true
    })
  }, [data, q, source, unmatchedOnly])

  function exportCsv() {
    const head = ["Name", "Email", "Company", "Title", "Opted in", "Source", "Unmatched"]
    const lines = [head.join(",")].concat(rows.map(p => [p.name, p.email, p.company, p.title, p.consent_at ? new Date(p.consent_at).toISOString().slice(0, 10) : "", sourceLabel(p.source), p.unmatched ? "yes" : ""].map(csvCell).join(",")))
    const blob = new Blob([lines.join("\n")], { type: "text/csv" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "subscribers-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click()
  }

  async function act(id, action) {
    setBusy(id + ":" + action)
    try {
      const r = await fetch("/api/subscribers/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ person_id: id, action }) })
      const d = await r.json().catch(() => ({}))
      if (!d.ok) { alert("Failed: " + (d.error || "unknown")); setBusy(null); return }
      setData(prev => prev ? {
        ...prev,
        people: prev.people.filter(p => p.id !== id),
        counts: {
          ...prev.counts,
          pending: Math.max((prev.counts.pending || 0) - 1, 0),
          [action === "approve" ? "subscribed" : "rejected"]: (prev.counts[action === "approve" ? "subscribed" : "rejected"] || 0) + 1,
        },
      } : prev)
    } catch (e) { alert("Error: " + (e.message || e)) }
    setBusy(null)
  }

  const tabBtn = (id, label, n) => (
    <button onClick={() => { setTab(id); setSource("all"); setUnmatchedOnly(false) }} style={{
      padding: "7px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
      border: "1px solid " + (tab === id ? T.accent : T.border), background: tab === id ? T.accent : "white", color: tab === id ? "white" : T.textSecondary,
    }}>{label}{n != null ? " · " + n : ""}</button>
  )

  const isPending = tab === "pending"
  const gridCols = isPending ? "1.6fr 2fr 1fr 1fr 2fr" : "2fr 2fr 1.6fr 1.1fr 1.7fr"

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 1180 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Subscribers</h1>
      <div style={{ fontSize: 13, color: T.textTertiary, marginTop: 4, marginBottom: 18 }}>
        {tab === "subscribed" ? "Approved and on the list — everyone cleared to receive event invitations."
          : tab === "pending" ? "Requested to join and awaiting your review. Open their LinkedIn, then Approve (sends a welcome) or Decline (sends the gracious CFOs-only note)."
          : tab === "rejected" ? "Declined — not a fit for the CFOs-only list. They were sent a polite note and are excluded from every send."
          : "People who opted out or are suppressed. Never email anyone on this list."}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {tabBtn("subscribed", "Subscribed", data ? data.counts.subscribed : null)}
        {tabBtn("pending", "Pending", data ? data.counts.pending : null)}
        {tabBtn("rejected", "Rejected", data ? data.counts.rejected : null)}
        {tabBtn("unsubscribed", "Unsubscribed / suppressed", data ? data.counts.unsubscribed : null)}
        {data && tab === "subscribed" && <span style={{ fontSize: 12, color: T.textTertiary, marginLeft: 6 }}>{data.counts.last_30d} joined in the last 30 days</span>}
      </div>

      {error && <div style={{ color: T.danger }}>⚠ {error}</div>}
      {!error && !data && <div style={{ color: T.textTertiary }}>Loading…</div>}

      {data && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email, company…"
              style={{ padding: "7px 11px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 8, minWidth: 240, fontFamily: "inherit", outline: "none" }} />
            <select value={source} onChange={e => setSource(e.target.value)} style={{ padding: "7px 10px", fontSize: 13, border: "1px solid " + T.border, borderRadius: 8, fontFamily: "inherit", background: "white" }}>
              <option value="all">All sources</option>
              {sources.map(([k, label]) => <option key={k || "none"} value={k}>{label}</option>)}
            </select>
            <label style={{ fontSize: 13, color: T.textSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={unmatchedOnly} onChange={e => setUnmatchedOnly(e.target.checked)} /> Unmatched only
            </label>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: T.textTertiary }}>{rows.length} shown</span>
            <button onClick={exportCsv} disabled={!rows.length} style={{ padding: "7px 14px", fontSize: 13, fontWeight: 600, border: "1px solid " + T.border, borderRadius: 8, background: "white", color: T.textPrimary, cursor: rows.length ? "pointer" : "not-allowed", fontFamily: "inherit" }}>Export CSV</button>
          </div>

          {rows.length === 0 ? (
            <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 32, textAlign: "center", color: T.textTertiary, lineHeight: 1.6 }}>
              {data.people.length === 0
                ? (tab === "subscribed" ? "No subscribers yet. People appear here when they join your invitation list or click “Yes, invite me to other CFO events” after registering."
                  : tab === "pending" ? "Nothing to review — no pending requests right now."
                  : tab === "rejected" ? "No one's been declined."
                  : "No one has opted out.")
                : "No one matches those filters."}
            </div>
          ) : (
            <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 12, padding: "10px 16px", fontSize: 11, fontWeight: 700, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: "1px solid " + T.border }}>
                {isPending
                  ? (<><div>Name</div><div>Email</div><div>LinkedIn</div><div>City</div><div>Review</div></>)
                  : (<><div>Name</div><div>Email</div><div>Company</div><div>{tab === "subscribed" ? "Opted in" : "Opted out"}</div><div>{tab === "subscribed" ? "Source" : "Reason"}</div></>)}
              </div>
              {rows.map((p, i) => (
                <div key={p.id} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 12, padding: "11px 16px", fontSize: 13, alignItems: "center", borderBottom: i === rows.length - 1 ? "none" : "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)") }}>
                  <div style={{ minWidth: 0 }}>
                    <Link href={"/people/" + p.id} style={{ color: T.textPrimary, textDecoration: "none", fontWeight: 500 }}>{p.name}</Link>
                    {p.unmatched && <span title="Identity not yet verified" style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: "#ffe4d6", color: "#9a3412" }}>unmatched</span>}
                    {p.title && <div style={{ fontSize: 11.5, color: T.textTertiary }}>{p.title}</div>}
                    {isPending && p.company && <div style={{ fontSize: 11.5, color: T.textTertiary }}>{p.company}</div>}
                  </div>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email ? <a href={"mailto:" + p.email} style={{ color: "#3b82f6", textDecoration: "none" }}>{p.email}</a> : "—"}</div>
                  {isPending ? (
                    <>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.linkedin_url ? <a href={p.linkedin_url} target="_blank" rel="noopener" style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 600 }}>Profile ↗</a> : <span style={{ color: T.danger }}>none</span>}</div>
                      <div style={{ color: T.textSecondary }}>{p.city || "—"}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => act(p.id, "approve")} disabled={!!busy} style={{ padding: "6px 13px", fontSize: 12.5, fontWeight: 600, borderRadius: 7, border: "none", background: "#2f7d4f", color: "white", cursor: busy ? "wait" : "pointer", fontFamily: "inherit" }}>{busy === p.id + ":approve" ? "…" : "Approve"}</button>
                        <button onClick={() => { if (confirm("Decline " + p.name + "? They'll get the gracious CFOs-only note and be removed from the list.")) act(p.id, "decline") }} disabled={!!busy} style={{ padding: "6px 13px", fontSize: 12.5, fontWeight: 600, borderRadius: 7, border: "1px solid " + T.border, background: "white", color: "#b91c1c", cursor: busy ? "wait" : "pointer", fontFamily: "inherit" }}>{busy === p.id + ":decline" ? "…" : "Decline"}</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ color: T.textSecondary }}>{p.company || "—"}</div>
                      <div style={{ color: T.textSecondary }}>{fmtDate(tab === "subscribed" ? p.consent_at : (p.unsubscribed_at || p.consent_at))}</div>
                      <div style={{ color: T.textSecondary, fontSize: 12 }}>{tab === "subscribed" ? sourceLabel(p.source) : (p.unsub_reason || (p.suppressed ? "Suppressed" : "—"))}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
