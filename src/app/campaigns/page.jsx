"use client"
import { useEffect, useState } from "react"
import { T } from "@/lib/pipelineTheme"

const VCOLOR = { GO: "#2e7d32", WAIT: "#b26a00", HOLD: "#c62828" }

function Tile({ label, value, sub, color }) {
  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderTop: "3px solid " + (color || T.accent), borderRadius: 10, padding: "16px", minWidth: 0 }}>
      <div style={{ fontSize: 28, fontWeight: 600, color: T.textPrimary, lineHeight: 1 }}>{value == null ? "–" : value}</div>
      <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      {sub != null && <div style={{ fontSize: 11, color: color || T.accent, marginTop: 4, fontWeight: 600 }}>{sub}</div>}
    </div>
  )
}
function Card({ title, note, children }) {
  return (
    <section style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: "18px", marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, margin: 0 }}>{title}</h2>
        {note && <span style={{ fontSize: 11, color: T.textTertiary }}>{note}</span>}
      </div>
      {children}
    </section>
  )
}
const pct = (n, d) => (d ? (100 * n / d).toFixed(1) + "%" : "–")
const th = { textAlign: "left", fontSize: 11, color: T.textTertiary, fontWeight: 600, padding: "6px 8px", textTransform: "uppercase" }
const td = { fontSize: 13, color: T.textPrimary, padding: "6px 8px", borderTop: "1px solid " + T.border }

export default function CampaignsPage() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  function load() {
    fetch("/api/campaigns/cold-test", { cache: "no-store" }).then(r => r.json()).then(setD).catch(e => setErr(String(e)))
  }
  useEffect(function () { load(); const t = setInterval(load, 30000); return function () { clearInterval(t) } }, [])

  async function disarm() {
    if (!confirm("Stop the drip? No further batches will send until it is re-armed.")) return
    setBusy(true)
    await fetch("/api/campaigns/cold-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disarm" }) })
    setBusy(false); load()
  }

  if (err) return <div style={{ padding: 24, color: "#c62828" }}>{err}</div>
  if (!d) return <div style={{ padding: 24, color: T.textTertiary }}>Loading…</div>
  const s = d.status || {}
  const t = s.totals || {}
  const armed = !!(d.config && d.config.armed)
  const sent = t.sent || 0

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: T.textPrimary, margin: 0 }}>Email campaigns</h1>
          <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 4 }}>Cold test · {d.slug} · source: Apollo · refreshes every 30s</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, background: armed ? "#e8f5e9" : "#eee", color: armed ? "#2e7d32" : "#555" }}>
            {armed ? "DRIP ARMED" : "DRIP OFF"}
          </span>
          {armed && <button onClick={disarm} disabled={busy} style={{ background: "#c62828", color: "#fff", border: 0, borderRadius: 6, padding: "8px 14px", fontWeight: 600, cursor: "pointer" }}>Stop drip</button>}
        </div>
      </div>

      <Card title="Gate" note="checked before every batch">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: VCOLOR[s.verdict] || T.textTertiary }}>{s.verdict || "–"}</span>
          <span style={{ fontSize: 13, color: T.textSecondary || T.textTertiary }}>{s.reason || s.error || ""}</span>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginTop: 18 }}>
        <Tile label="Sent" value={sent} sub={"of " + (d.audience.cold_test_total) + " in audience"} />
        <Tile label="Delivered" value={t.delivered} sub={pct(t.delivered, sent)} color="#2e7d32" />
        <Tile label="Bounced" value={t.bounced} sub={pct(t.bounced, sent)} color={t.bounced ? "#c62828" : undefined} />
        <Tile label="Complaints" value={t.complained} color={t.complained ? "#c62828" : "#2e7d32"} />
        <Tile label="Unsubscribed" value={t.unsubscribed} sub={pct(t.unsubscribed, sent)} color="#b26a00" />
        <Tile label="RSVP requests" value={t.rsvps} sub={pct(t.rsvps, sent)} color="#1565c0" />
      </div>

      <Card title="Batches" note={t.minutes_since_last_batch != null ? t.minutes_since_last_batch + " min since last" : "none sent yet"}>
        {(s.batches || []).length === 0 ? <div style={{ fontSize: 13, color: T.textTertiary }}>No batches yet.</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Sent at", "Sent", "Delivered", "Delayed", "Bounced", "Complained", "Pending"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{s.batches.map(b => (
              <tr key={b.sent_at}>
                <td style={td}>{new Date(b.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                <td style={td}>{b.sent}</td><td style={td}>{b.delivered}</td><td style={td}>{b.delayed}</td>
                <td style={td}>{b.bounced}</td><td style={td}>{b.complained}</td><td style={td}>{b.pending}</td>
              </tr>))}</tbody>
          </table>
        )}
      </Card>

      <Card title="Opt-outs and suppressions" note={d.audience.unsubscribed + " unsubscribed · " + d.audience.suppressed + " suppressed"}>
        {d.opt_outs.length === 0 ? <div style={{ fontSize: 13, color: T.textTertiary }}>None yet.</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Name", "Company", "Status", "Reason"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{d.opt_outs.map(p => (
              <tr key={p.id}>
                <td style={td}><a href={"/people/" + p.id} style={{ color: T.accent }}>{p.full_name}</a></td>
                <td style={td}>{p.company}</td>
                <td style={td}>{p.email_consent === "unsubscribed" ? "Unsubscribed" : "Suppressed"}</td>
                <td style={td}>{p.email_unsub_reason || ""}</td>
              </tr>))}</tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
