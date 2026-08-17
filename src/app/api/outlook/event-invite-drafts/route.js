export const dynamic = "force-dynamic"
export const maxDuration = 120
import { serverClient } from "@/lib/supabaseServer"
import { graphFetch } from "@/lib/microsoft-auth"

// GET /api/outlook/event-invite-drafts?k=<key>&slug=<event>&status=Unavailable[&dry=1]
// Creates ONE Outlook DRAFT per matching attendee (never sends), via the app's
// own Microsoft path (graphFetch) — the MCP connector lacks Mail.ReadWrite.
// Audience = event_attendees at the given status who have an email + a personal
// tracking token. Body is the Sept-16 first-look copy with each person's tracked
// personal link (src=email). Idempotency is best-effort: re-running makes dupes.
const PROBE_KEY = "pk_draft_9b41c7e2a5"
const SUBJECT = "First look: the September 16 CFO workshop"

function bodyHtml(first, link) {
  const paras = [
    "Hi " + first + "—you had expressed interest in the CFO workshop and peer experience we held in August but weren’t able to attend.",
    "The next session is Wednesday, September 16. Before I open the invitation more broadly on LinkedIn, I wanted to give you the first opportunity to take a look.",
    "It’s a small, CFO-only workshop and facilitated peer experience—not a networking event or sales presentation. Because seating is intentionally limited, I’m reaching out first to the CFOs who had wanted to attend in August.",
    "Here’s your personal link with the details:<br><a href=\"" + link + "\">" + link + "</a>",
    "I hope the timing works for you this time.",
    "—<br>Dalen Lawrence<br>Chapter Director, CFO Circle Los Angeles",
  ]
  return paras.map(function (p) { return "<p>" + p + "</p>" }).join("")
}

export async function GET(request) {
  const url = new URL(request.url)
  if (url.searchParams.get("k") !== PROBE_KEY) return Response.json({ error: "not found" }, { status: 404 })
  const slug = (url.searchParams.get("slug") || "").trim()
  const status = (url.searchParams.get("status") || "Unavailable").trim()
  const dry = url.searchParams.get("dry") === "1"
  if (!slug) return Response.json({ error: "slug required" }, { status: 400 })

  const sb = serverClient()
  const { data: ev } = await sb.from("events").select("id, slug, published").eq("slug", slug).maybeSingle()
  if (!ev) return Response.json({ error: "event not found" }, { status: 404 })

  const { data: rows } = await sb
    .from("event_attendees")
    .select("person_id, status, people!inner(id, first_name, full_name, email)")
    .eq("event_id", ev.id).eq("status", status)
  const withEmail = (rows || []).filter(function (r) { return r.people && r.people.email })
  const ids = withEmail.map(function (r) { return r.person_id })

  const tokenByPerson = {}
  if (ids.length) {
    const { data: toks } = await sb.from("track_tokens").select("person_id, token, created_at").in("person_id", ids)
    ;(toks || []).sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)) })
    ;(toks || []).forEach(function (t) { if (!tokenByPerson[t.person_id]) tokenByPerson[t.person_id] = t.token })
  }

  const results = []
  for (const r of withEmail) {
    const p = r.people
    const token = tokenByPerson[r.person_id]
    if (!token) { results.push({ name: p.full_name, email: p.email, ok: false, reason: "no token" }); continue }
    const link = "https://la-cfo.com/events/" + slug + "/?t=" + token + "&src=email"
    if (dry) { results.push({ name: p.full_name, email: p.email, ok: true, dry: true, link: link }); continue }
    const message = {
      subject: SUBJECT,
      body: { contentType: "HTML", content: bodyHtml(p.first_name || (p.full_name || "").split(" ")[0] || "there", link) },
      toRecipients: [{ emailAddress: { address: p.email } }],
    }
    try {
      const res = await graphFetch("https://graph.microsoft.com/v1.0/me/messages", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message),
      })
      if (!res.ok) {
        const t = await res.text().catch(function () { return "" })
        results.push({ name: p.full_name, email: p.email, ok: false, reason: "graph " + res.status, detail: t.slice(0, 160) })
      } else {
        const d = await res.json().catch(function () { return {} })
        results.push({ name: p.full_name, email: p.email, ok: true, id: d.id || null })
      }
    } catch (e) {
      results.push({ name: p.full_name, email: p.email, ok: false, reason: String(e.message || e) })
    }
  }

  return Response.json({
    event: ev.slug, status: status, matched: withEmail.length,
    created: results.filter(function (x) { return x.ok && !x.dry }).length, dry: dry, results: results,
  })
}
