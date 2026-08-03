export const dynamic = "force-dynamic"
export const maxDuration = 120
import { serverClient } from "@/lib/supabaseServer"
import { graphFetch } from "@/lib/microsoft-auth"

// POST /api/events/reminder-drafts?k=<key>&slug=<event>[&dry=1]
// Creates ONE personalized Outlook DRAFT per Confirmed attendee (never sends).
// The "one week out / Die Hard building" reminder. No sign-off, no signature —
// Dalen adds his own. Returns per-person result. Re-runnable: creates fresh drafts.
const PROBE_KEY = "pk_7f3a91c4d2e6"

function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }

function bodyHtml(first) {
  const hi = first ? ("Hi " + esc(first) + ",") : "Hi,"
  const row = (label, value) => '<li style="margin:0 0 7px;font-size:15px;line-height:1.5"><strong>' + label + '</strong> ' + value + '</li>'
  return '<div style="font-family:Georgia,serif;max-width:560px;color:#20242f">' +
    '<p style="font-size:16px;margin:0 0 14px">' + hi + '</p>' +
    '<p style="font-size:15px;line-height:1.6;margin:0 0 14px">We’re officially one week out. A week from tomorrow you’ll be in a room with a small group of Los Angeles CFOs for a morning built around the calls you can’t take anywhere else — and I couldn’t be more looking forward to having you there.</p>' +
    '<p style="font-size:15px;line-height:1.6;margin:0 0 14px">First, the fun part: we’re on the <strong>15th floor of 2121 Avenue of the Stars</strong> — a.k.a. <strong>Fox Plaza</strong>, the tower that played <strong>Nakatomi Plaza in <em>Die Hard</em></strong>. Floor-to-ceiling views over Century City, a great room, and I can promise no hostage situations on the agenda.</p>' +
    '<p style="font-size:15px;font-weight:bold;margin:0 0 6px">The details:</p>' +
    '<ul style="margin:0 0 16px;padding-left:20px">' +
      row("When:", "Tuesday, August 11 · 8:30–11:30 AM (doors at 8:15)") +
      row("Where:", "2121 Avenue of the Stars, 15th Floor, Century City") +
      row("Parking:", "pull into the building structure and take a ticket — it’s validated") +
      row("Getting in:", "secured building, so bring a photo ID; your name will be at the lobby desk and they’ll send you up") +
      row("Breakfast:", "coffee and a light breakfast are on us — come as you are, skip the stop") +
    '</ul>' +
    '<p style="font-size:15px;line-height:1.6;margin:0 0 14px">One thing to bring: a live issue you’re wrestling with. The room’s at its best applied to something real.</p>' +
    '<p style="font-size:15px;line-height:1.6;margin:0 0 6px">Anything comes up between now and then, just reply here. Otherwise — see you at Fox Plaza.</p>' +
    '</div>'
}

export async function POST(request) {
  const url = new URL(request.url)
  if (url.searchParams.get("k") !== PROBE_KEY) return Response.json({ error: "not found" }, { status: 404 })
  const slug = (url.searchParams.get("slug") || "august-11-workshop").trim()
  const dry = url.searchParams.get("dry") === "1"

  const sb = serverClient()
  const { data: ev } = await sb.from("events").select("id").eq("slug", slug).maybeSingle()
  if (!ev) return Response.json({ error: "event_not_found" }, { status: 404 })

  const { data: rows } = await sb.from("event_attendees")
    .select("status, people:person_id ( first_name, full_name, email )")
    .eq("event_id", ev.id).eq("status", "Confirmed")
  const people = (rows || []).map(r => r.people).filter(p => p && p.email)

  const subject = "One week from tomorrow — and yes, it’s the Die Hard building"
  if (dry) return Response.json({ would_draft: people.length, recipients: people.map(p => p.email) })

  const results = []
  for (const p of people) {
    const first = p.first_name || (p.full_name || "").split(" ")[0] || ""
    const payload = JSON.stringify({
      subject,
      body: { contentType: "HTML", content: bodyHtml(first) },
      toRecipients: [{ emailAddress: { address: p.email } }],
    })
    try {
      const res = await graphFetch("https://graph.microsoft.com/v1.0/me/messages", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
      })
      if (!res.ok) { results.push({ email: p.email, ok: false, error: "Graph " + res.status }); continue }
      const d = await res.json().catch(() => ({}))
      results.push({ email: p.email, ok: true, webLink: d.webLink || null })
    } catch (e) { results.push({ email: p.email, ok: false, error: String(e.message || e) }) }
  }
  return Response.json({ drafted: results.filter(r => r.ok).length, total: people.length, results })
}
