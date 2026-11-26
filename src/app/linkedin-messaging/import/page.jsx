"use client"
import { useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

// Import / audit a LinkedIn data export (messages.csv) into PeerChair.
// The browser parses the file and posts rows in batches to /api/linkedin-messaging/import,
// which writes through ingest_linkedin_message. Safe to re-run: existing messages merge, never duplicate.
// Run this monthly with a fresh export — anything LinkedIn has that PeerChair missed shows up as "new".

const BATCH = 100

function parseCsv(text) {
  const rows = []
  let row = [], field = "", inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ",") { row.push(field); field = "" }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field); field = ""
      if (row.length > 1 || row[0] !== "") rows.push(row)
      row = []
    } else field += c
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row) }
  return rows
}

function htmlToText(s) {
  if (!/<[a-z][\s\S]*>/i.test(s)) return s.trim()
  const withBreaks = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n")
  const doc = new DOMParser().parseFromString(withBreaks, "text/html")
  return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim()
}

function parseDate(s) {
  const d = new Date(String(s).replace(" UTC", "Z").replace(" ", "T"))
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export default function ImportExport() {
  const [owner, setOwner] = useState("dalenlawrence")
  const [scope, setScope] = useState("replied")
  const [file, setFile] = useState(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [totals, setTotals] = useState(null)
  const [error, setError] = useState(null)

  async function run() {
    setError(null); setTotals(null); setRunning(true)
    try {
      const text = await file.text()
      const table = parseCsv(text)
      const head = table[0].map(function (h) { return h.trim().toUpperCase() })
      const ix = function (n) { return head.indexOf(n) }
      const need = ["CONVERSATION ID", "FROM", "SENDER PROFILE URL", "TO", "RECIPIENT PROFILE URLS", "DATE", "CONTENT", "FOLDER"]
      const missing = need.filter(function (n) { return ix(n) < 0 })
      if (missing.length) throw new Error("Missing columns: " + missing.join(", "))

      const all = []
      let sponsored = 0
      table.slice(1).forEach(function (c) {
        const raw = c[ix("CONTENT")] || ""
        if (raw.indexOf("spinmail-quill-editor") >= 0) { sponsored++; return }   // LinkedIn sponsored messages
        const sentAt = parseDate(c[ix("DATE")])
        const body = htmlToText(raw)
        if (!sentAt || !body) return
        const out = String(c[ix("SENDER PROFILE URL")] || "").toLowerCase().indexOf(owner.toLowerCase()) >= 0
        const recips = String(c[ix("RECIPIENT PROFILE URLS")] || "").split(/[,\s]+/).filter(Boolean)
        all.push({
          thread_id: c[ix("CONVERSATION ID")],
          participant_url: out ? (recips[0] || null) : (c[ix("SENDER PROFILE URL")] || null),
          participant_name: out ? c[ix("TO")] : c[ix("FROM")],
          direction: out ? "OUT" : "IN",
          body: body, sent_at: sentAt, folder: String(c[ix("FOLDER")] || "").toLowerCase() || null,
        })
      })

      let rows = all
      if (scope === "replied") {
        const replied = new Set(all.filter(function (r) { return r.direction === "IN" }).map(function (r) { return r.thread_id }))
        rows = all.filter(function (r) { return replied.has(r.thread_id) })
      }

      const t = { parsed: all.length, sponsored_skipped: sponsored, sending: rows.length, inserted: 0, merged: 0, matched: 0, unmatched: 0, invalid: 0, errors: [] }
      for (let i = 0; i < rows.length; i += BATCH) {
        setProgress(Math.min(i + BATCH, rows.length) + " / " + rows.length)
        const res = await fetch("/api/linkedin-messaging/import", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: rows.slice(i, i + BATCH), source: "linkedin_export" }),
        })
        const d = await res.json()
        if (!res.ok || d.error) throw new Error((d && d.error) || "Import failed at row " + i)
        ;["inserted", "merged", "matched", "unmatched", "invalid"].forEach(function (k) { t[k] += d[k] || 0 })
        t.errors.push.apply(t.errors, d.errors || [])
      }
      setTotals(t)
    } catch (e) { setError(e.message || String(e)) }
    setRunning(false); setProgress(null)
  }

  const box = { background: T.cardBg || "#fff", border: "1px solid " + (T.border || "#e5e7eb"), borderRadius: 8, padding: 16, maxWidth: 640 }
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 12 }}><Link href="/linkedin-messaging">← LinkedIn Messaging</Link></div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Import / audit a LinkedIn export</h1>
      <p style={{ fontSize: 13, opacity: 0.75, maxWidth: 640 }}>
        Upload messages.csv from LinkedIn's data export. Messages PeerChair already has are merged, not duplicated.
        Anything new is a message PeerChair missed. Run this monthly with a fresh export.
      </p>
      <div style={box}>
        <div style={{ marginBottom: 10 }}>
          <input type="file" accept=".csv" disabled={running} onChange={function (e) { setFile(e.target.files[0] || null); setTotals(null) }} />
        </div>
        <div style={{ marginBottom: 10, fontSize: 13 }}>
          <label>Scope:&nbsp;
            <select value={scope} onChange={function (e) { setScope(e.target.value) }} disabled={running}>
              <option value="replied">Conversations where they replied (recommended)</option>
              <option value="all">Everything, including unanswered sends</option>
            </select>
          </label>
        </div>
        <div style={{ marginBottom: 12, fontSize: 13 }}>
          <label>Your LinkedIn slug:&nbsp;
            <input value={owner} onChange={function (e) { setOwner(e.target.value) }} disabled={running} style={{ width: 200 }} />
          </label>
        </div>
        <button onClick={run} disabled={!file || running} style={{ padding: "6px 14px", fontWeight: 600 }}>
          {running ? "Importing… " + (progress || "") : "Import"}
        </button>
        {error && <div style={{ color: "#b91c1c", marginTop: 12, fontSize: 13 }}>{error}</div>}
        {totals && (
          <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7 }}>
            <div><b>{totals.inserted}</b> new messages added · <b>{totals.merged}</b> already in PeerChair</div>
            <div>{totals.matched} matched to a person · {totals.unmatched} unmatched (review queue)</div>
            <div>{totals.parsed} rows read · {totals.sponsored_skipped} sponsored skipped · {totals.invalid} invalid</div>
            {totals.errors.length > 0 && <div style={{ color: "#b91c1c" }}>Errors: {JSON.stringify(totals.errors)}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
