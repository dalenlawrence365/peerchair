"use client"
import { T } from "@/lib/pipelineTheme"
export default function MeetingsPage() {
  return (
    <main style={{ padding: "32px 36px", maxWidth: 880 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Meetings</h1>
      <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 8, marginBottom: 24, maxWidth: 640 }}>
        Calendly bookings and Outlook calendar — coming next.
      </p>
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.6 }}>
          For now, your fit calls and sponsor discoveries surface on the <a href="/dashboard" style={{ color: T.accent || "#3b82f6" }}>Dashboard</a> as action-tag rows.
          Each booking auto-logs to the booker&apos;s profile timeline, and the Calendly webhook handles stage advancement.
          A dedicated calendar grid view (Outlook + Calendly merged) is queued for the next build session.
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: T.textTertiary }}>
          Need to see what&apos;s on your calendar right now? Check Outlook directly or your Calendly &quot;Scheduled Events&quot; page.
        </div>
      </div>
    </main>
  )
}
