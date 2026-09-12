"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

function fmtLine(slot) {
  const start = new Date(slot.starts_at)
  const end = slot.ends_at ? new Date(slot.ends_at) : null
  const day = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
  const startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  const endTime = end ? end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null
  const timeRange = endTime ? `${startTime}–${endTime}` : startTime
  return `${slot.title} — ${day}, ${timeRange}`
}

export default function PotentialTroikaPage() {
  const [slots, setSlots] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch("/api/provisors/potential-troika").then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else setSlots(d.slots || [])
    }).catch(e => setError(String(e)))
  }, [])

  const text = (slots || []).map(fmtLine).join("\n")

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setError("Couldn't copy — select the text below and copy manually.")
    }
  }

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Potential Troika</h1>
        <Link href="/provisors" style={{ fontSize: 12, color: T.textTertiary, textDecoration: "none" }}>← ProVisors</Link>
      </div>
      <div style={{ fontSize: 13, color: T.textTertiary, marginTop: 4, marginBottom: 22 }}>
        Open future slots you've held for a potential Troika. Copy the list straight into an email offering times.
      </div>

      {error && <div style={{ color: T.danger, marginBottom: 16 }}>⚠ {error}</div>}
      {!slots && !error && <div style={{ color: T.textTertiary }}>Loading…</div>}

      {slots && slots.length === 0 && (
        <div style={{ padding: 32, color: T.textTertiary, fontSize: 13, textAlign: "center", background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12 }}>
          No open Potential Troika slots on the calendar right now.
        </div>
      )}

      {slots && slots.length > 0 && (
        <>
          <button onClick={copyAll} style={{
            fontSize: 12, padding: "6px 12px", borderRadius: 6,
            background: copied ? T.success : T.textPrimary, color: "white",
            border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 500, marginBottom: 14,
          }}>
            {copied ? "Copied ✓" : "Copy to clipboard"}
          </button>

          <div style={{
            background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12,
            padding: "16px 20px", fontSize: 13.5, lineHeight: 1.9, color: T.textPrimary,
            whiteSpace: "pre-wrap", fontFamily: "inherit",
          }}>
            {text}
          </div>
        </>
      )}
    </main>
  )
}
