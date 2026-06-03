"use client"
import { useRef, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

export default function ImportPage() {
  const fileRef = useRef(null)
  const [source, setSource] = useState("linkedin_organic")
  const [defaultRelevance, setDefaultRelevance] = useState("unrated")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState(null)

  async function submit() {
    const f = fileRef.current && fileRef.current.files && fileRef.current.files[0]
    if (!f) { alert("Choose a CSV first."); return }
    setBusy(true); setErr(null); setResult(null)
    try {
      const fd = new FormData()
      fd.append("file", f)
      fd.append("source", source)
      fd.append("default_relevance", defaultRelevance)
      const r = await fetch("/api/linkedin-connections", { method: "POST", body: fd })
      const j = await r.json()
      if (!r.ok) { setErr(j.error || ("HTTP " + r.status)); return }
      setResult(j)
    } catch(e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <main style={{ padding: "32px 36px", maxWidth: 720 }}>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        <Link href="/linkedin-connections" style={{ color: T.textTertiary, textDecoration: "none" }}>← Back to connections</Link>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Import LinkedIn connections</h1>
      <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 8, marginBottom: 24 }}>
        Upload a CSV from LinkedHelper, LinkedIn's native export (Settings → Data privacy → Get a copy of your data → Connections), or Sales Navigator.
        Matching is by LinkedIn URL — existing rows update, new rows are added with the source and default relevance you choose.
      </p>

      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>CSV file</div>
          <input ref={fileRef} type="file" accept=".csv,text/csv"
            style={{ fontSize: 13, fontFamily: "inherit" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Source label</div>
            <input value={source} onChange={e => setSource(e.target.value)}
              style={{ fontSize: 13, padding: "6px 10px", borderRadius: 6, border: "1px solid " + T.border, width: "100%", boxSizing: "border-box", fontFamily: "inherit" }} />
            <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 4 }}>
              e.g. <code>linkedin_organic</code>, <code>provisors</code>, <code>seed_b1_outreach</code>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Default relevance for new rows</div>
            <select value={defaultRelevance} onChange={e => setDefaultRelevance(e.target.value)}
              style={{ fontSize: 13, padding: "6px 10px", borderRadius: 6, border: "1px solid " + T.border, background: "white", width: "100%", boxSizing: "border-box", fontFamily: "inherit" }}>
              <option value="unrated">Unrated</option>
              <option value="cfo_circle">CFO Circle</option>
              <option value="stalliant">Stalliant</option>
              <option value="network_visibility">Network visibility</option>
              <option value="legacy">Legacy</option>
            </select>
            <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 4 }}>
              Applied only to brand-new rows. Existing rows keep their current relevance.
            </div>
          </div>
        </div>

        <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 6, padding: 10, fontSize: 12, color: "#78350f", marginBottom: 14 }}>
          <strong>Heads up:</strong> imports of 1,000+ rows are treated as <em>full LinkedIn exports</em> — connections previously marked <code>connected</code> but absent from the file will be set to <code>disconnected</code>. For partial lists (e.g. your 351 ProVisors), stay under 1,000 rows.
        </div>

        <button onClick={submit} disabled={busy}
          style={{ fontSize: 13, padding: "9px 18px", borderRadius: 8, background: busy ? "#9ca3af" : T.textPrimary, color: "white", border: "none", cursor: busy ? "not-allowed" : "pointer", fontWeight: 500, fontFamily: "inherit" }}>
          {busy ? "Importing…" : "Import CSV"}
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 16, padding: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: 13 }}>
          {err}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 16, padding: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, color: "#14532d", fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Import complete</div>
          <table style={{ fontSize: 12, borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={{ paddingRight: 16 }}>Rows in CSV</td><td>{result.rows_in_csv}</td></tr>
              <tr><td style={{ paddingRight: 16 }}>Rows with a LinkedIn URL</td><td>{result.rows_with_url}</td></tr>
              <tr><td style={{ paddingRight: 16 }}>Newly inserted</td><td><strong>{result.inserted}</strong></td></tr>
              <tr><td style={{ paddingRight: 16 }}>Updated existing</td><td>{result.updated}</td></tr>
              <tr><td style={{ paddingRight: 16 }}>Skipped (no URL)</td><td>{result.skipped_no_url}</td></tr>
              {result.disconnected > 0 && <tr><td style={{ paddingRight: 16 }}>Marked disconnected</td><td>{result.disconnected}</td></tr>}
            </tbody>
          </table>
          {result.errors && result.errors.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#991b1b" }}>
              {result.errors.length} error(s): {result.errors.join("; ")}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Link href="/linkedin-connections" style={{ color: "#14532d", fontWeight: 500 }}>View imported connections →</Link>
          </div>
        </div>
      )}
    </main>
  )
}
