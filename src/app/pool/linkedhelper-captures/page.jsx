"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

// Webhook config is URL-only in LinkedHelper; this is the default secret. If you
// set LINKEDHELPER_WEBHOOK_SECRET in Vercel, swap ?k= for that value.
const WEBHOOK_URL = "https://www.peerchair.com/api/webhooks/linkedhelper/company?k=cfocircle-lh-2026"

function fmt(iso) { try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) } catch (e) { return iso } }

export default function LinkedHelperCapturesPage() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [open, setOpen] = useState({})
  const [copied, setCopied] = useState(false)

  function load() {
    setErr(null)
    fetch("/api/webhooks/linkedhelper/company", { cache: "no-store" })
      .then(function (r) { return r.json() })
      .then(function (d) { if (d.error) setErr(d.error); else setData(d) })
      .catch(function (e) { setErr(String(e)) })
  }
  useEffect(function () { load() }, [])

  const captures = (data && data.captures) || []
  const keyCounts = {}
  captures.forEach(function (c) {
    const r = c.raw || {}
    Object.keys(r).forEach(function (k) { keyCounts[k] = (keyCounts[k] || 0) + 1 })
  })
  const keys = Object.entries(keyCounts).sort(function (a, b) { return b[1] - a[1] })

  function copyUrl() {
    try { navigator.clipboard.writeText(WEBHOOK_URL); setCopied(true); setTimeout(function () { setCopied(false) }, 1500) } catch (e) {}
  }

  return (
    <main style={{ padding: "24px 28px 64px", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.textTertiary, marginBottom: 14 }}>
        <Link href="/" style={{ color: T.textTertiary, textDecoration: "none" }}>Dashboard</Link>
        <span>›</span>
        <span style={{ color: T.textPrimary }}>LinkedHelper company captures</span>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: "0 0 6px" }}>LinkedHelper company captures</h1>
      <p style={{ color: T.textSecondary, fontSize: 14, margin: "0 0 20px", maxWidth: 760 }}>
        Raw company data LinkedHelper posts here lands in this list untouched, so you can see exactly what fields it sends
        before we design the schema. Point a LinkedHelper webhook action at the URL below.
      </p>

      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Webhook URL (POST)</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{ flex: 1, fontSize: 12.5, background: T.bg, border: "1px solid " + T.border, borderRadius: 6, padding: "8px 10px", overflowX: "auto", whiteSpace: "nowrap" }}>{WEBHOOK_URL}</code>
          <button onClick={copyUrl} style={{ padding: "8px 14px", background: T.accent, color: "white", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{copied ? "Copied" : "Copy"}</button>
        </div>
        <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 8 }}>Method POST · body JSON. The <code>?k=</code> value is the shared secret; override it by setting LINKEDHELPER_WEBHOOK_SECRET in Vercel.</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{captures.length} capture{captures.length === 1 ? "" : "s"}</div>
        <button onClick={load} style={{ padding: "6px 12px", background: "white", color: T.textPrimary, border: "1px solid " + T.border, borderRadius: 7, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Reload</button>
      </div>

      {err && <div style={{ background: T.dangerBg, border: "1px solid " + T.danger, color: T.danger, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>⚠ {err}</div>}

      {keys.length > 0 && (
        <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Fields LinkedHelper is sending (top-level keys)</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {keys.map(function (kv) {
              return <span key={kv[0]} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 5, background: "#eaf0f8", border: "1px solid #c7d5ea", color: "#1e3a5f" }}>{kv[0]} <span style={{ color: "#6b7f9e" }}>· {kv[1]}</span></span>
            })}
          </div>
        </div>
      )}

      {data && captures.length === 0 && !err && (
        <div style={{ fontSize: 13, color: T.textTertiary, padding: "20px 0" }}>No captures yet. Fire a LinkedHelper company action at the URL above and reload.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {captures.map(function (c) {
          const isOpen = !!open[c.id]
          return (
            <div key={c.id} style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{c.company_name || "(name not detected)"}</div>
                  <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2 }}>
                    {[c.industry, c.company_size, c.location].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {(c.website || c.company_linkedin_url) && (
                    <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 2, wordBreak: "break-all" }}>
                      {c.website || c.company_linkedin_url}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>{fmt(c.received_at)}</div>
              </div>
              <button onClick={function () { setOpen(Object.assign({}, open, { [c.id]: !isOpen })) }} style={{ marginTop: 8, padding: "4px 10px", background: "transparent", color: T.accent, border: "1px solid " + T.border, borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                {isOpen ? "Hide raw payload" : "Show raw payload"}
              </button>
              {isOpen && (
                <pre style={{ marginTop: 10, background: T.bg, border: "1px solid " + T.border, borderRadius: 8, padding: 12, fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>{JSON.stringify(c.raw, null, 2)}</pre>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
