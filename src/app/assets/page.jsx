"use client"
import { useEffect, useRef, useState } from "react"
import { T } from "@/lib/pipelineTheme"

function fmtBytes(b) {
  if (!b) return "—"
  if (b < 1024) return b + " B"
  if (b < 1024 * 1024) return Math.round(b / 1024) + " KB"
  return (b / (1024 * 1024)).toFixed(1) + " MB"
}
function fmtDate(s) {
  if (!s) return "—"
  const d = new Date(s)
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
         ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

export default function AssetsPage() {
  const [assets, setAssets] = useState(null)
  const [err, setErr] = useState(null)

  async function load() {
    try {
      const r = await fetch("/api/assets", { cache: "no-store" })
      if (!r.ok) throw new Error("HTTP " + r.status)
      const j = await r.json()
      setAssets(j.assets || [])
    } catch (e) { setErr(e.message) }
  }
  useEffect(function(){ load() }, [])

  return (
    <main style={{ padding: "32px 36px", maxWidth: 880 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Assets</h1>
      <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 8, marginBottom: 24, maxWidth: 640 }}>
        Files attached to outbound campaigns. Replace any asset here and all future sends pick up the new
        version automatically — no code change, no redeploy. Old versions are retained as history.
      </p>
      {err && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 16 }}>Error: {err}</div>}
      {assets === null && !err && <div style={{ color: T.textTertiary, fontSize: 13 }}>Loading…</div>}
      {assets && assets.length === 0 && (
        <div style={{ color: T.textTertiary, fontSize: 13 }}>No assets configured.</div>
      )}
      {assets && assets.map(function(a){
        return <AssetCard key={a.slug} asset={a} onChange={load} />
      })}
    </main>
  )
}

function AssetCard({ asset, onChange }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState(null)

  async function loadHistory() {
    setShowHistory(true)
    if (history) return
    try {
      const r = await fetch(`/api/assets/${asset.slug}`, { cache: "no-store" })
      const j = await r.json()
      setHistory(j.versions || [])
    } catch(e) { setHistory([]) }
  }

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const r = await fetch(`/api/assets/${asset.slug}`, { method: "POST", body: fd })
      if (!r.ok) {
        const j = await r.json().catch(function(){ return {} })
        alert("Upload failed: " + (j.error || ("HTTP " + r.status)))
      } else {
        setHistory(null)
        setShowHistory(false)
        await onChange()
      }
    } catch(e) {
      alert("Upload error: " + e.message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary }}>{asset.display_name}</div>
          <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 2, fontFamily: "monospace" }}>slug: {asset.slug}</div>
        </div>
      </div>
      {asset.description && (
        <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 10, lineHeight: 1.5 }}>
          {asset.description}
        </div>
      )}

      <div style={{ marginTop: 16, padding: 12, background: "rgba(0,0,0,0.02)", borderRadius: 8, border: "1px solid " + T.borderSoft }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Current file</div>
        {asset.has_file ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: T.textPrimary, wordBreak: "break-all" }}>
                {asset.current_file_original_name || asset.current_file_path}
              </div>
              <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 2 }}>
                {fmtBytes(asset.current_file_size_bytes)} · uploaded {fmtDate(asset.current_file_uploaded_at)}
              </div>
            </div>
            <a href={asset.view_url} target="_blank" rel="noopener noreferrer"
               style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, background: "#3b82f6", color: "white", textDecoration: "none", fontWeight: 500, whiteSpace: "nowrap" }}>
              View →
            </a>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: T.textTertiary, fontStyle: "italic" }}>No file uploaded yet.</div>
        )}
      </div>

      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <input ref={fileRef} type="file" onChange={handleFile} disabled={busy}
               style={{ display: "none" }} accept=".pdf,.png,.jpg,.jpeg,.docx" />
        <button onClick={function(){ fileRef.current && fileRef.current.click() }} disabled={busy}
                style={{ fontSize: 12, padding: "7px 14px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textPrimary, cursor: busy ? "not-allowed" : "pointer", fontWeight: 500, fontFamily: "inherit" }}>
          {busy ? "Uploading…" : (asset.has_file ? "Replace file" : "Upload file")}
        </button>
        <button onClick={loadHistory}
                style={{ fontSize: 12, padding: "7px 12px", borderRadius: 6, border: "none", background: "transparent", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }}>
          {showHistory ? "Hide history" : "Version history →"}
        </button>
      </div>

      {showHistory && history && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + T.borderSoft }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Version history
          </div>
          {history.length === 0 ? (
            <div style={{ fontSize: 12, color: T.textTertiary }}>No previous versions.</div>
          ) : history.map(function(v){
            const isCurrent = v.file_path === asset.current_file_path
            return (
              <div key={v.id} style={{ fontSize: 12, padding: "6px 0", borderBottom: "1px solid " + T.borderSoft, display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <span style={{ color: T.textPrimary, fontWeight: isCurrent ? 600 : 400 }}>
                    {v.original_name || v.file_path}
                  </span>
                  {isCurrent && <span style={{ marginLeft: 8, fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#10b981", color: "white" }}>CURRENT</span>}
                </div>
                <div style={{ color: T.textTertiary, whiteSpace: "nowrap" }}>
                  {fmtBytes(v.file_size_bytes)} · {fmtDate(v.uploaded_at)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
