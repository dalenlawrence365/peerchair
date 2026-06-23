"use client"
import { T } from "@/lib/pipelineTheme"
export default function TemplatesPage() {
  return (
    <main style={{ padding: "32px 36px", maxWidth: 880 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Templates</h1>
      <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 8, marginBottom: 24, maxWidth: 640 }}>
        Message templates — coming next.
      </p>
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.6 }}>
          Your LinkedIn invite copy, fit-call intro, and sponsor outreach drafts are being migrated here.
          A modernized version with variable substitution and one-click send-via-GPT is on the build queue.
        </div>
      </div>
    </main>
  )
}
