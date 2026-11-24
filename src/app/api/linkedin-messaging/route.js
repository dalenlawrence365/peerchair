export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
import { serverClient } from "@/lib/supabaseServer"
import { loadLinkedInMessages } from "@/lib/linkedinMessages"

// GET /api/linkedin-messaging
// Every person with at least one captured LinkedIn message, most recent message first,
// plus a summary of the overall extent (counts, sources, date range, by month).
// The full thread for one person is /api/linkedin-messaging/[personId].

function bump(map, key, n) { map[key] = (map[key] || 0) + (n || 1) }

export async function GET() {
  try {
    const sb = serverClient()
    const { messages, unattached } = await loadLinkedInMessages(sb)

    const byPerson = {}
    const summary = { total: messages.length, inbound: 0, outbound: 0, unattached,
      by_source: {}, by_channel: {}, by_month: {}, first_at: null, last_at: null }

    messages.forEach(function (m) {
      const p = byPerson[m.person_id] || (byPerson[m.person_id] = { person_id: m.person_id, inbound: 0, outbound: 0, total: 0, sources: {}, last: null })
      p.total++
      if (m.direction === "in") { p.inbound++; summary.inbound++ }
      if (m.direction === "out") { p.outbound++; summary.outbound++ }
      m.sources.forEach(function (s) { bump(p.sources, s); bump(summary.by_source, s) })
      bump(summary.by_channel, m.channel || "unknown")
      if (m.at) bump(summary.by_month, String(m.at).slice(0, 7))
      p.last = m   // messages are sorted oldest -> newest, so the last one wins
      if (!summary.first_at) summary.first_at = m.at
      summary.last_at = m.at
    })

    const ids = Object.keys(byPerson)
    const peopleById = {}
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      const { data, error } = await sb.from("people")
        .select("id, full_name, first_name, last_name, title, company, linkedin_url, roles")
        .in("id", chunk)
      if (error) throw new Error(error.message)
      ;(data || []).forEach(function (p) { peopleById[p.id] = p })
    }

    const people = ids.map(function (id) {
      const p = byPerson[id]
      const person = peopleById[id] || {}
      return {
        id,
        name: person.full_name || ((person.first_name || "") + " " + (person.last_name || "")).trim() || "(person not found)",
        title: person.title || null,
        company: person.company || null,
        roles: person.roles || [],
        linkedin_url: person.linkedin_url || null,
        inbound: p.inbound, outbound: p.outbound, total: p.total,
        sources: Object.keys(p.sources),
        last_at: p.last.at,
        last_direction: p.last.direction,
        last_preview: String(p.last.body || "").replace(/\s+/g, " ").slice(0, 160),
      }
    }).sort(function (a, b) { return new Date(b.last_at) - new Date(a.last_at) })

    return Response.json({ summary, people_count: people.length, people })
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 })
  }
}
