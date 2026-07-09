"use client"
import { useState } from "react"
import Link from "next/link"
import { T, FONT_FAMILY } from "@/lib/pipelineTheme"

// /pool/export — generate a LinkedHelper-ready CSV from the pool.
// Pulls N people who are at cfo_state='pool', have a LinkedIn URL, and don't already
// have export_to_linkedhelper or connection_sent tags. Tags them on commit.

export default function PoolExportPage() {
  const [count, setCount] = useState(300)
  const [batchLabel, setBatchLabel] = useState("")
  const [locationFilter, setLocationFilter] = useState("")
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [committed, setCommitted] = useState(null)
  const [backfill, setBackfill] = useState(null)
  const [backfillLoading, setBackfillLoading] = useState(false)

  function defaultBatch() {
    if (batchLabel) return batchLabel
    const d = new Date()
    return `seed-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`
  }

  async function runPreview() {
    setLoading(true); setError(null); setPreview(null); setCommitted(null)
    try {
      const res = await fetch("/api/pool/export-linkedhelper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: parseInt(count) || 0, batch_label: defaultBatch(), location_filter: locationFilter || null, dry_run: true })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Preview failed"); setLoading(false); return }
      setPreview(data)
    } catch(err) {
      setError(err.message || String(err))
    }
    setLoading(false)
  }

  async function runCommit() {
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/pool/export-linkedhelper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: parseInt(count) || 0, batch_label: defaultBatch(), location_filter: locationFilter || null, dry_run: false })
      })
      if (!res.ok) {
        const data = await res.json().catch(function(){ return { error: "Export failed" } })
        setError(data.error || "Export failed")
        setLoading(false); return
      }
      const exported = parseInt(res.headers.get("X-PeerChair-Exported") || "0")
      const tagged = parseInt(res.headers.get("X-PeerChair-Tagged") || "0")
      const batch = res.headers.get("X-PeerChair-BatchLabel") || defaultBatch()
      const blob = await res.blob()
      // Trigger download
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = batch + ".csv"
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(function(){ URL.revokeObjectURL(url) }, 500)
      setCommitted({ exported, tagged, batch })
      setPreview(null)
    } catch(err) {
      setError(err.message || String(err))
    }
    setLoading(false)
  }

  async function backfillPreview() {
    setBackfillLoading(true); setError(null); setBackfill(null)
    try {
      const res = await fetch("/api/pool/export-tokens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: true })
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || "Backfill preview failed")
      else setBackfill(data)
    } catch (err) { setError(err.message || String(err)) }
    setBackfillLoading(false)
  }

  async function backfillDownload() {
    setBackfillLoading(true); setError(null)
    try {
      const res = await fetch("/api/pool/export-tokens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: false })
      })
      if (!res.ok) {
        const d = await res.json().catch(function(){ return { error: "Backfill failed" } })
        setError(d.error || "Backfill failed"); setBackfillLoading(false); return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = "linkedhelper-token-backfill.csv"
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(function(){ URL.revokeObjectURL(url) }, 500)
    } catch (err) { setError(err.message || String(err)) }
    setBackfillLoading(false)
  }

  return (
    <main style={{ padding: "24px 28px 48px", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.textTertiary, marginBottom: 14 }}>
        <Link href="/" style={{ color: T.textTertiary, textDecoration: "none" }}>Dashboard</Link>
        <span>›</span>
        <Link href="/pipeline/cfo/pool" style={{ color: T.textTertiary, textDecoration: "none" }}>CFO Pipeline</Link>
        <span>›</span>
        <span style={{ color: T.textPrimary }}>Export for LinkedHelper</span>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5, marginBottom: 6 }}>Export for LinkedHelper</h1>
      <p style={{ color: T.textSecondary, fontSize: 14, marginBottom: 22, maxWidth: 760 }}>
        Pull people from the pool, mark them as queued, and download a CSV you can upload directly to LinkedHelper.
        Only people at <strong>pool</strong> stage who haven't been exported or invited before are eligible. Once exported,
        they're tagged so they won't appear in future exports.
      </p>

      {error && (
        <div style={{ background: T.dangerBg, border: "1px solid " + T.danger, borderRadius: 10, padding: "12px 16px", color: T.danger, marginBottom: 16, fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      {committed && (
        <div style={{ background: T.cardBg, border: "1px solid " + T.success, borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.success, marginBottom: 8 }}>✓ Export complete — file downloaded</div>
          <div style={{ fontSize: 14, color: T.textPrimary, marginBottom: 4 }}>
            <strong>{committed.exported}</strong> rows in CSV. <strong>{committed.tagged}</strong> tagged with <code>export_to_linkedhelper</code> — they won't appear in future exports.
          </div>
          <div style={{ fontSize: 12, color: T.textTertiary }}>Batch: <code>{committed.batch}</code></div>
        </div>
      )}

      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <SectionLabel>How many people?</SectionLabel>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 6 }}>
          <input type="number" value={count} onChange={function(e){ setCount(e.target.value); setPreview(null) }} min={1} max={1000}
            style={{ width: 140, padding: "8px 12px", fontSize: 16, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none", background: "white" }} />
          <span style={{ fontSize: 12, color: T.textTertiary }}>max 1000 per export</span>
        </div>
      </div>

      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <SectionLabel>Batch label (becomes the Tags column in the CSV)</SectionLabel>
        <input type="text" value={batchLabel} onChange={function(e){ setBatchLabel(e.target.value); setPreview(null) }} placeholder={defaultBatch()}
          style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none", background: "white", marginBottom: 6 }} />
        <div style={{ fontSize: 11, color: T.textTertiary }}>
          Defaults to <code>{defaultBatch()}</code>. LinkedHelper sees this in the Tags column; the webhook reads it to identify the seed batch.
        </div>
      </div>

      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 24, marginBottom: 22 }}>
        <SectionLabel>Location filter (optional)</SectionLabel>
        <input type="text" value={locationFilter} onChange={function(e){ setLocationFilter(e.target.value); setPreview(null) }} placeholder="e.g. California — leave blank for any location"
          style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none", background: "white", marginBottom: 6 }} />
        <div style={{ fontSize: 11, color: T.textTertiary }}>Case-insensitive substring match on the location field.</div>
      </div>

      {!preview ? (
        <button disabled={loading || !count} onClick={runPreview}
          style={{ padding: "10px 22px", background: count && !loading ? T.accent : T.bg, color: count && !loading ? "white" : T.textTertiary, border: "none", borderRadius: 8, fontSize: 14, cursor: count && !loading ? "pointer" : "not-allowed", fontFamily: "inherit", fontWeight: 500 }}>
          {loading ? "Counting…" : "Preview →"}
        </button>
      ) : (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
            <Tile label="Candidates checked" v={preview.summary.candidates_checked} />
            <Tile label="Excluded (already tagged)" v={preview.summary.excluded_by_tags} tone="warn" />
            <Tile label="Eligible" v={preview.summary.eligible} tone="success" />
            <Tile label="Will export" v={preview.summary.would_export} tone="accent" />
          </div>

          {preview.sample && preview.sample.length > 0 && (
            <details style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 16 }} open>
              <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 }}>First 5 in this batch</summary>
              <div style={{ marginTop: 10 }}>
                {preview.sample.map(function(s, i){
                  return (
                    <div key={i} style={{ padding: "6px 0", borderBottom: i < preview.sample.length - 1 ? "1px solid " + T.borderSoft : "none", fontSize: 12 }}>
                      <strong>{s.name}</strong>
                      {s.title ? <span style={{ color: T.textSecondary }}> — {s.title}</span> : null}
                      {s.company ? <span style={{ color: T.textTertiary }}> · {s.company}</span> : null}
                      {s.location ? <span style={{ color: T.textTertiary }}> · {s.location}</span> : null}
                    </div>
                  )
                })}
              </div>
            </details>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={function(){ setPreview(null) }} style={{ padding: "10px 18px", background: "white", color: T.textPrimary, border: "1px solid " + T.border, borderRadius: 8, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
            <button disabled={loading || preview.summary.would_export === 0} onClick={runCommit}
              style={{ padding: "10px 22px", background: preview.summary.would_export > 0 && !loading ? T.accent : T.bg, color: preview.summary.would_export > 0 && !loading ? "white" : T.textTertiary, border: "none", borderRadius: 8, fontSize: 14, cursor: preview.summary.would_export > 0 && !loading ? "pointer" : "not-allowed", fontFamily: "inherit", fontWeight: 500 }}>
              {loading ? "Exporting…" : `Download CSV & tag ${preview.summary.would_export} people`}
            </button>
          </div>
        </div>
      )}

      <section style={{ marginTop: 34, padding: "18px 18px 20px", background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px", color: T.textPrimary }}>Token backfill — people already in LinkedHelper</h2>
        <p style={{ fontSize: 13, color: T.textSecondary, margin: "0 0 14px", maxWidth: 760 }}>
          The export above only seeds <em>new</em> people. This produces a variables-only CSV for everyone already sitting in a
          LinkedHelper campaign, so their <strong>remaining</strong> messages carry tokenized links. Upload it in LinkedHelper as
          CRM-level custom variables — it matches on Profile URL. Read-only: no tags written, nothing re-sent.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={backfillPreview} disabled={backfillLoading} style={{
            padding: "8px 14px", borderRadius: 7, border: "1px solid " + T.border, background: "white",
            color: T.textPrimary, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            {backfillLoading ? "Working…" : "Preview backfill"}
          </button>
          <button onClick={backfillDownload} disabled={backfillLoading} style={{
            padding: "8px 14px", borderRadius: 7, border: "none", background: T.accent,
            color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Download CSV
          </button>
        </div>
        {backfill && (
          <div style={{ marginTop: 14, fontSize: 13, color: T.textSecondary }}>
            <div><strong style={{ color: T.textPrimary }}>{backfill.exportable}</strong> exportable of {backfill.in_linkedhelper} in LinkedHelper
              {backfill.skipped_missing_url_or_token > 0 && <span style={{ color: T.warning }}> · {backfill.skipped_missing_url_or_token} skipped (no LinkedIn URL)</span>}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: T.textTertiary }}>
              By channel tag: {Object.entries(backfill.by_src || {}).map(function(e){ return e[0] + " (" + e[1] + ")" }).join(" · ")}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

function Tile({ label, v, tone }) {
  const toneColor = tone === "success" ? T.success : tone === "warn" ? T.warning : tone === "accent" ? T.accent : T.textPrimary
  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 10, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, color: toneColor }}>{v}</div>
    </div>
  )
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>{children}</div>
}
