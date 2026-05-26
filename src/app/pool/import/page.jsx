"use client"
import { useState } from "react"
import Link from "next/link"
import { T, FONT_FAMILY } from "@/lib/pipelineTheme"

// /pool/import — upload a CSV (or paste rows), preview dedupe against the master
// people table, then commit only the new rows. Audience-vs-pool-aware: rows that
// match someone already at audience/prospect/qualified/member are protected from
// regression (never re-inserted, never reset to pool).

function parseCSV(text) {
  // Minimal CSV parser supporting quoted fields and commas inside quotes.
  // Not for huge files (>50k rows); fine for our scale.
  const rows = []
  let row = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else { field += c }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ",") { row.push(field); field = "" }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = "" }
      else if (c === "\r") { /* skip */ }
      else field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].length > 0))
}

function rowsToObjects(matrix) {
  if (matrix.length === 0) return []
  const header = matrix[0].map(h => h.trim())
  return matrix.slice(1).map(cells => {
    const obj = {}
    header.forEach((h, i) => { obj[h] = cells[i] || "" })
    return obj
  })
}

export default function PoolImportPage() {
  const [csvText, setCsvText] = useState("")
  const [sourceLabel, setSourceLabel] = useState("")
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [approvedAmbiguous, setApprovedAmbiguous] = useState({})  // idx → bool
  const [committed, setCommitted] = useState(null)

  function handleFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCsvText(ev.target.result)
    reader.readAsText(file)
    if (!sourceLabel) setSourceLabel(file.name.replace(/\.[^.]+$/, ""))
  }

  async function runPreview() {
    setLoading(true); setError(null); setPreview(null); setCommitted(null); setApprovedAmbiguous({})
    try {
      const matrix = parseCSV(csvText)
      const rows = rowsToObjects(matrix)
      if (rows.length === 0) { setError("No rows parsed from input"); setLoading(false); return }
      const res = await fetch("/api/pool/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, source_label: sourceLabel || null })
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
    if (!preview) return
    setLoading(true); setError(null)
    const newRows = preview.buckets.new
    const approvedRows = preview.buckets.ambiguous.filter(r => approvedAmbiguous[r.idx])
    const rowsToInsert = newRows.concat(approvedRows)
    if (rowsToInsert.length === 0) { setError("Nothing to commit"); setLoading(false); return }
    try {
      const res = await fetch("/api/pool/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsToInsert, source_label: sourceLabel || preview.source_label })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Commit failed"); setLoading(false); return }
      setCommitted(data)
    } catch(err) {
      setError(err.message || String(err))
    }
    setLoading(false)
  }

  return (
    <main style={{ padding: "24px 28px 48px", maxWidth: 1200 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.textTertiary, marginBottom: 14 }}>
        <Link href="/" style={{ color: T.textTertiary, textDecoration: "none" }}>Dashboard</Link>
        <span>›</span>
        <Link href="/pipeline/cfo/pool" style={{ color: T.textTertiary, textDecoration: "none" }}>CFO Pipeline</Link>
        <span>›</span>
        <span style={{ color: T.textPrimary }}>Import pool</span>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5, marginBottom: 6 }}>Import pool</h1>
      <p style={{ color: T.textSecondary, fontSize: 14, marginBottom: 24, maxWidth: 720 }}>
        Upload a CSV or paste rows from a Sales Navigator export. The system will dedupe against
        the master people table — new rows are added at <strong>pool</strong> stage; anyone already in
        the pipeline (audience, prospect, qualified, member) is protected from regression and
        won't be touched.
      </p>

      {error && (
        <div style={{ background: T.dangerBg, border: "1px solid " + T.danger, borderRadius: 10, padding: "12px 16px", color: T.danger, marginBottom: 16, fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      {committed ? (
        <CommittedResult committed={committed} onReset={function(){ setCsvText(""); setPreview(null); setCommitted(null); setSourceLabel("") }} />
      ) : !preview ? (
        <UploadStep csvText={csvText} setCsvText={setCsvText} sourceLabel={sourceLabel} setSourceLabel={setSourceLabel} onFile={handleFile} onPreview={runPreview} loading={loading} />
      ) : (
        <PreviewStep preview={preview} loading={loading} approvedAmbiguous={approvedAmbiguous} setApprovedAmbiguous={setApprovedAmbiguous} onCommit={runCommit} onBack={function(){ setPreview(null) }} />
      )}
    </main>
  )
}

function UploadStep({ csvText, setCsvText, sourceLabel, setSourceLabel, onFile, onPreview, loading }) {
  return (
    <div>
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <SectionLabel>1. Source label</SectionLabel>
        <input type="text" value={sourceLabel} onChange={function(e){ setSourceLabel(e.target.value) }} placeholder="e.g. salesnav-westside-cfos-2026-05-22"
          style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "inherit", outline: "none", background: "white", marginBottom: 8 }} />
        <div style={{ fontSize: 11, color: T.textTertiary }}>Saved on each new row as <code>source</code> so you can find this batch later.</div>
      </div>

      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <SectionLabel>2. Upload CSV or paste rows</SectionLabel>
        <input type="file" accept=".csv,.tsv,.txt" onChange={onFile} style={{ marginBottom: 12, fontFamily: "inherit", fontSize: 13 }} />
        <textarea value={csvText} onChange={function(e){ setCsvText(e.target.value) }} placeholder="Or paste CSV here. First row should be column headers (LinkedIn URL, First Name, Last Name, Title, Company, Location, Email)..."
          style={{ width: "100%", minHeight: 240, padding: 12, fontSize: 12, lineHeight: 1.4, border: "1px solid " + T.border, borderRadius: 6, fontFamily: "ui-monospace, monospace", outline: "none", resize: "vertical" }} />
        <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 6 }}>
          Recognized headers: LinkedIn URL · First Name · Last Name · Full Name · Title / Position · Company / Company Name · Location · Email
        </div>
      </div>

      <button disabled={!csvText.trim() || loading} onClick={onPreview}
        style={{ padding: "10px 22px", background: csvText.trim() && !loading ? T.accent : T.bg, color: csvText.trim() && !loading ? "white" : T.textTertiary, border: "none", borderRadius: 8, fontSize: 14, cursor: csvText.trim() && !loading ? "pointer" : "not-allowed", fontFamily: "inherit", fontWeight: 500 }}>
        {loading ? "Analyzing…" : "Preview dedupe →"}
      </button>
    </div>
  )
}

function PreviewStep({ preview, loading, approvedAmbiguous, setApprovedAmbiguous, onCommit, onBack }) {
  const s = preview.summary
  const willCommit = s.new + Object.keys(approvedAmbiguous).filter(k => approvedAmbiguous[k]).length

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 24 }}>
        <BucketTile label="New (will add)" count={s.new} tone="success" />
        <BucketTile label="Already in pool" count={s.in_pool} tone="neutral" />
        <BucketTile label="Already engaged" count={s.further_along} tone="active" hint="audience+" />
        <BucketTile label="Ambiguous" count={s.ambiguous} tone="warn" />
        <BucketTile label="Invalid" count={s.invalid} tone={s.invalid > 0 ? "danger" : "neutral"} />
      </div>

      {preview.buckets.ambiguous.length > 0 && (
        <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 22, marginBottom: 16 }}>
          <SectionLabel>Ambiguous — review and approve to include</SectionLabel>
          <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: 14 }}>
            These rows partially match someone already in your master. Approve only if you're sure it's a different person.
          </div>
          {preview.buckets.ambiguous.map(function(r){
            const isApproved = !!approvedAmbiguous[r.idx]
            return (
              <div key={r.idx} style={{ padding: "10px 12px", borderBottom: "1px solid " + T.borderSoft, display: "flex", alignItems: "center", gap: 12 }}>
                <input type="checkbox" checked={isApproved} onChange={function(){
                  setApprovedAmbiguous(Object.assign({}, approvedAmbiguous, { [r.idx]: !isApproved }))
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.full_name || `${r.first_name} ${r.last_name}`.trim() || "(no name)"}</div>
                  <div style={{ fontSize: 11, color: T.textSecondary }}>
                    {[r.title, r.company, r.location].filter(Boolean).join(" · ") || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: T.warning, marginTop: 2, fontStyle: "italic" }}>{r.reason} · existing person is at {r.matched_state}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {preview.buckets.invalid.length > 0 && (
        <details style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <summary style={{ cursor: "pointer", fontWeight: 500, fontSize: 13 }}>{preview.buckets.invalid.length} invalid rows (missing both LinkedIn URL and name) — click to inspect</summary>
          <div style={{ marginTop: 12, maxHeight: 200, overflow: "auto", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
            {preview.buckets.invalid.map(function(r, i){
              return <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid " + T.borderSoft }}>Row {r.idx + 2}: {r.reason}</div>
            })}
          </div>
        </details>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={onBack} style={{ padding: "10px 18px", background: "white", color: T.textPrimary, border: "1px solid " + T.border, borderRadius: 8, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
        <button disabled={loading || willCommit === 0} onClick={onCommit}
          style={{ padding: "10px 22px", background: willCommit > 0 && !loading ? T.accent : T.bg, color: willCommit > 0 && !loading ? "white" : T.textTertiary, border: "none", borderRadius: 8, fontSize: 14, cursor: willCommit > 0 && !loading ? "pointer" : "not-allowed", fontFamily: "inherit", fontWeight: 500 }}>
          {loading ? "Inserting…" : `Insert ${willCommit} row${willCommit === 1 ? "" : "s"} into pool`}
        </button>
        {s.in_pool + s.further_along > 0 && (
          <span style={{ fontSize: 12, color: T.textTertiary, marginLeft: 12 }}>
            {s.in_pool + s.further_along} duplicate row{s.in_pool + s.further_along === 1 ? "" : "s"} will be skipped
          </span>
        )}
      </div>
    </div>
  )
}

function CommittedResult({ committed, onReset }) {
  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.success, borderRadius: 12, padding: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: T.success, marginBottom: 8 }}>✓ Import complete</div>
      <div style={{ fontSize: 14, color: T.textPrimary, marginBottom: 6 }}>
        Inserted <strong>{committed.summary.inserted}</strong> of <strong>{committed.summary.requested}</strong> requested rows into the pool.
      </div>
      <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: 16 }}>Source label: <code>{committed.source_label}</code></div>
      {committed.errors && committed.errors.length > 0 && (
        <div style={{ background: T.dangerBg, padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 12, color: T.danger }}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{committed.errors.length} error(s):</div>
          {committed.errors.map(function(e, i){ return <div key={i}>{e.batch_start ? `batch ${e.batch_start}: ` : ""}{e.message}</div> })}
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onReset} style={{ padding: "8px 18px", background: T.accent, color: "white", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>Import another batch</button>
        <Link href="/pipeline/cfo/pool" style={{ padding: "8px 18px", background: "white", color: T.textPrimary, border: "1px solid " + T.border, borderRadius: 6, fontSize: 13, textDecoration: "none", fontFamily: "inherit" }}>→ View CFO pool</Link>
      </div>
    </div>
  )
}

function BucketTile({ label, count, tone, hint }) {
  const toneColor = tone === "success" ? T.success : tone === "danger" ? T.danger : tone === "warn" ? T.warning : tone === "active" ? T.accent : T.textPrimary
  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1, color: toneColor }}>{count}</div>
      {hint && <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>{children}</div>
}
