"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

// /events has no event of its own — it sends you to the newest one, which is
// where you almost always want to be. If there are none yet, it says so instead
// of redirecting into a 404.
export default function EventsIndex() {
  const router = useRouter()
  const [events, setEvents] = useState(null)

  useEffect(function () {
    fetch("/api/events/all", { cache: "no-store" })
      .then(function (r) { return r.json() })
      .then(function (d) {
        const evs = (d && d.events) || []
        setEvents(evs)
        if (evs[0]) router.replace("/events/" + evs[0].slug)
      })
      .catch(function () { setEvents([]) })
  }, [router])

  if (events === null || events.length > 0) {
    return <div style={{ padding: "32px", color: T.textTertiary, fontSize: 14 }}>Opening your latest event…</div>
  }
  return (
    <div style={{ padding: "32px", maxWidth: 640 }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: T.textPrimary, marginBottom: 8 }}>No events yet</div>
      <div style={{ fontSize: 14, color: T.textTertiary }}>Once an event is published it will appear here, and this page will open the newest one automatically.</div>
    </div>
  )
}
