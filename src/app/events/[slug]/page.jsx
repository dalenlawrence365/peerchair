"use client"
import { useParams } from "next/navigation"
import EventRoster from "../EventRoster"

// Each event gets its own page at /events/<slug>. The roster component reads the
// slug from the URL, so every date is a real, linkable page.
export default function EventBySlug() {
  const params = useParams()
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug
  return <EventRoster slug={slug} />
}
