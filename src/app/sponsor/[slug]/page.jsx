"use client"
import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"

// Read-only sponsor dashboard for ONE event, gated by the event's
// sponsor_view_key. Marsh opens the link (?k=...) or types the key, and sees the
// room filling in — stats + the confirmed/registered roster with the same
// pipeline timestamps Dalen sees. No CRM chrome, no login, nothing else exposed.

const NAVY = "#121a3c", BRASS = "#c39a4e", INK = "#20242f", MUTE = "#6b7080", LINE = "#e3ddcc", BG = "#f3efe4"

function fmt(iso) {
  if (!iso) return "—"
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }) } catch (e) { return "—" }
}
function longDate(iso) {
  if (!iso) return ""
  try { return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }) } catch (e) { return "" }
}
function daysTo(iso) {
  if (!iso) return null
  try { return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) } catch (e) { return null }
}

function StatusChip({ s }) {
  const confirmed = s === "Confirmed" || s === "Attended"
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap",
      background: confirmed ? "#e7f3ec" : "#fdf2e3", color: confirmed ? "#1b5e36" : "#92600e",
      border: "1px solid " + (confirmed ? "#bfe0cb" : "#f0d9b5"),
    }}>{confirmed ? "Confirmed" : "Registered"}</span>
  )
}

function Tile({ label, value, sub }) {
  return (
    <div style={{ background: "#fff", border: "1px solid " + LINE, borderRadius: 12, padding: "16px 20px", minWidth: 150, flex: "1 1 150px" }}>
      <div style={{ fontSize: 30, fontWeight: 700, color: NAVY, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: INK, marginTop: 6 }}>{label}</div>
      {sub ? <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2 }}>{sub}</div> : null}
    </div>
  )
}

export default function SponsorView() {
  const params = useParams()
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug
  const [key, setKey] = useState("")
  const [data, setData] = useState(null)
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)

  const fetchRoster = useCallback(function (k) {
    if (!k) return
    setLoading(true); setErr("")
    fetch("/api/sponsor/roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: slug, key: k }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j } }) })
      .then(function (res) {
        if (res.ok && res.j && res.j.event) { setData(res.j); setErr("") }
        else { setData(null); setErr(res.j && res.j.error === "unauthorized" ? "That password isn’t right." : "Couldn’t load the guest list.") }
      })
      .catch(function () { setErr("Couldn’t load the guest list.") })
      .finally(function () { setLoading(false) })
  }, [slug])

  // Auto-open from a ?k=... link so Marsh can just click.
  useEffect(function () {
    let k = ""
    try { k = new URLSearchParams(window.location.search).get("k") || "" } catch (e) {}
    if (k) { setKey(k); fetchRoster(k) }
  }, [fetchRoster])

  // Keep it live while they have it open.
  useEffect(function () {
    if (!data) return
    const id = setInterval(function () { fetchRoster(key) }, 60000)
    return function () { clearInterval(id) }
  }, [data, key, fetchRoster])

  const wrap = { minHeight: "100vh", background: BG, fontFamily: "'Inter',system-ui,-apple-system,Segoe UI,sans-serif", color: INK }

  // ---- Gate ----
  if (!data) {
    return (
      <div style={Object.assign({}, wrap, { display: "flex", alignItems: "center", justifyContent: "center", padding: 20 })}>
        <div style={{ width: "100%", maxWidth: 380, background: "#fff", border: "1px solid " + LINE, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ background: NAVY, padding: "22px 26px" }}>
            <img src="https://la-cfo.com/cfo-circle-logo-white.png" alt="CFO Circle · Los Angeles" style={{ height: "clamp(40px,6vw,52px)", width: "auto", display: "block", border: 0 }} />
          </div>
          <form onSubmit={function (e) { e.preventDefault(); fetchRoster(key) }} style={{ padding: "26px 26px 28px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Guest list — sponsor access</div>
            <div style={{ fontSize: 13, color: MUTE, marginBottom: 18, lineHeight: 1.5 }}>Enter the access password to see who’s coming to the CFO happy hour.</div>
            <input type="password" value={key} onChange={function (e) { setKey(e.target.value) }} placeholder="Access password" autoFocus
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", fontSize: 14, border: "1px solid " + LINE, borderRadius: 9, outline: "none", fontFamily: "inherit" }} />
            {err ? <div style={{ color: "#b91c1c", fontSize: 12.5, marginTop: 9 }}>{err}</div> : null}
            <button type="submit" disabled={loading || !key.trim()} style={{ width: "100%", marginTop: 16, padding: "11px 16px", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 9, background: key.trim() ? BRASS : LINE, color: key.trim() ? NAVY : MUTE, cursor: key.trim() && !loading ? "pointer" : "default", fontFamily: "inherit" }}>
              {loading ? "Checking…" : "View the guest list"}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ---- Dashboard ----
  const ev = data.event || {}
  const st = data.stats || {}
  const list = data.attendees || []
  const d = daysTo(ev.event_date)

  return (
    <div style={wrap}>
      <div style={{ background: NAVY, padding: "24px max(18px, env(safe-area-inset-left))" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <img src="https://la-cfo.com/cfo-circle-logo-white.png" alt="CFO Circle · Los Angeles" style={{ height: "clamp(40px,6vw,52px)", width: "auto", display: "block", border: 0 }} />
          {ev.host_name ? <div style={{ color: "#c5cce4", fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase" }}>Hospitality by {ev.host_name}</div> : null}
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "26px max(18px, env(safe-area-inset-left)) 60px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>{ev.name || "CFO Happy Hour"}</div>
        <div style={{ fontSize: 13.5, color: MUTE, marginTop: 3 }}>
          {longDate(ev.event_date)}{ev.venue_name ? " · " + ev.venue_name : (ev.location ? " · " + ev.location : "")}
        </div>
        <div style={{ marginTop: 12 }}>
          <a href={"https://la-cfo.com/events/" + slug} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", fontSize: 13, fontWeight: 700, color: NAVY, background: BRASS, textDecoration: "none", padding: "9px 16px", borderRadius: 8 }}>See the guest registration page →</a>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "20px 0 8px" }}>
          <Tile label="Confirmed" value={st.confirmed || 0} sub={st.target_capacity ? ("of " + st.target_capacity + " seats") : "coming"} />
          <Tile label="Registered" value={st.registered || 0} sub="pending review" />
          <Tile label="Invited" value={st.invited || 0} sub="total outreach" />
          <Tile label="Declined" value={st.declined || 0} sub="said no" />
          <Tile label="Unavailable" value={st.unavailable || 0} sub="date conflict" />
          <Tile label="Days to go" value={d != null && d >= 0 ? d : "—"} sub={d === 0 ? "today" : ""} />
        </div>

        <div style={{ fontSize: 12, color: MUTE, marginBottom: 14 }}>Updates live · last refreshed {fmt(data.generated_at)} {new Date(data.generated_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}</div>

        <div style={{ background: "#fff", border: "1px solid " + LINE, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
              <thead>
                <tr style={{ background: "#faf7ef", textAlign: "left" }}>
                  {["Name", "Company", "Email", "LinkedIn", "Invited", "Registered", "Approved", "Confirmed", ""].map(function (h, i) {
                    return <th key={i} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: MUTE, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "1px solid " + LINE, whiteSpace: "nowrap" }}>{h}</th>
                  })}
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 26, textAlign: "center", color: MUTE }}>No confirmed or registered guests yet — check back soon.</td></tr>
                ) : list.map(function (a, i) {
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #f0ece0" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: INK, whiteSpace: "nowrap" }}>{a.name}</td>
                      <td style={{ padding: "10px 12px", color: INK }}>{a.company || "—"}</td>
                      <td style={{ padding: "10px 12px", color: MUTE }}>{a.email ? <a href={"mailto:" + a.email} style={{ color: "#2563eb", textDecoration: "none" }}>{a.email}</a> : "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{a.linkedin_url ? <a href={a.linkedin_url} target="_blank" rel="noopener noreferrer" title="Open in LinkedIn" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 3, background: "#0a66c2", color: "#fff", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>in</a> : <span style={{ color: MUTE }}>—</span>}</td>
                      <td style={{ padding: "10px 12px", color: MUTE, whiteSpace: "nowrap" }}>{fmt(a.invited_at)}</td>
                      <td style={{ padding: "10px 12px", color: MUTE, whiteSpace: "nowrap" }}>{fmt(a.registered_at)}</td>
                      <td style={{ padding: "10px 12px", color: MUTE, whiteSpace: "nowrap" }}>{fmt(a.approved_at)}</td>
                      <td style={{ padding: "10px 12px", color: MUTE, whiteSpace: "nowrap" }}>{fmt(a.confirmed_at)}</td>
                      <td style={{ padding: "10px 12px" }}><StatusChip s={a.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ fontSize: 11.5, color: MUTE, marginTop: 16, lineHeight: 1.5 }}>
          Private sponsor view for {ev.host_name || "our hospitality partner"} · CFO Circle Los Angeles. Please don’t share this link.
        </div>
      </div>
    </div>
  )
}
