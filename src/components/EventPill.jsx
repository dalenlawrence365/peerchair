"use client"
import Link from "next/link"

// Compact event-status pill for list rows: "Nov 12 Happy hour · Invited". Same colors/wording as the
// profile's Events box (Requested is shown as Registered).
const COLORS = {
  Queued:      { bg: "#e0e7ff", border: "#a5b4fc", fg: "#3730a3" },
  Invited:     { bg: "#eaf0f8", border: "#c7d5ea", fg: "#1e3a5f" },
  Registered:  { bg: "#fff7e6", border: "#f4d58a", fg: "#8a5a00" },
  Requested:   { bg: "#fff7e6", border: "#f4d58a", fg: "#8a5a00" },
  Confirmed:   { bg: "#dcfce7", border: "#86efac", fg: "#166534" },
  Attended:    { bg: "#16a34a", border: "#16a34a", fg: "#ffffff" },
  Unavailable: { bg: "#fef3c7", border: "#fcd34d", fg: "#92400e" },
  Declined:    { bg: "#fee2e2", border: "#fca5a5", fg: "#991b1b" },
  "No-show":   { bg: "#fee2e2", border: "#fca5a5", fg: "#991b1b" },
}

export default function EventPill({ e }) {
  const c = COLORS[e.status] || COLORS.Invited
  let when = ""
  try { when = new Date(e.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }) } catch (x) {}
  const what = e.kind === "workshop" ? "Workshop" : e.kind === "happy_hour" ? "Happy hour" : String(e.name || "Event").slice(0, 24)
  const label = e.status === "Requested" ? "Registered" : e.status
  return (
    <Link href={"/events/" + e.slug} title={(e.name || "") + " — open the event roster"} style={{
      fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 999, textDecoration: "none", whiteSpace: "nowrap",
      background: c.bg, border: "1px solid " + c.border, color: c.fg,
    }}>{when} {what} · {label}</Link>
  )
}
