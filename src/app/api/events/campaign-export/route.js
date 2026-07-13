export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/events/campaign-export?slug=<event>&src=li-dm
// CSV for a LinkedHelper campaign: connected CFOs (role cfo + linkedin_url),
// with a per-person tokenized REGISTRATION link in an event_url column.
// No seed tagging — this is a per-event blast, not the cold-outreach seed export.

const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"

function csvEscape(v) {
  if (v === null || v === undefined) return ""
  const s = String(v)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export async function GET(request) {
  const url = new URL(request.url)
  const slug = (url.searchParams.get("slug") || "").trim()
  const src = (url.searchParams.get("src") || "li-dm").trim().slice(0, 64)
  if (!slug) return Response.json({ error: "missing_slug" }, { status: 400 })

  const sb = serverClient()
  const { data: ev } = await sb.from("events").select("slug").eq("slug", slug).eq("published", true).maybeSingle()
  if (!ev) return Response.json({ error: "event_not_found" }, { status: 404 })

  // Connected CFOs: role cfo + has a LinkedIn URL.
  const { data: people, error } = await sb.from("people")
    .select("id, first_name, last_name, full_name, title, company, linkedin_url")
    .filter("roles", "cs", '{"cfo"}')
    .not("linkedin_url", "is", null)
    .neq("linkedin_url", "")
    .order("created_at", { ascending: false })
    .limit(5000)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!people || !people.length) return Response.json({ error: "no_cfos" }, { status: 404 })

  // Exclude opted-out / do-not-contact.
  const ids = people.map(p => p.id)
  const { data: statusRows } = await sb.from("person_status_tags")
    .select("person_id, tag").in("person_id", ids).in("tag", ["do_not_contact", "opted_out"])
  const blocked = new Set((statusRows || []).map(r => r.person_id))
  const selected = people.filter(p => !blocked.has(p.id))

  // Tokens (lazy mint).
  const selIds = selected.map(p => p.id)
  const { data: existing } = await sb.from("track_tokens").select("token, person_id").in("person_id", selIds)
  const tokenBy = new Map((existing || []).map(r => [r.person_id, r.token]))
  const missing = selIds.filter(id => !tokenBy.has(id))
  if (missing.length) {
    const { data: minted } = await sb.from("track_tokens").insert(missing.map(id => ({ person_id: id }))).select("token, person_id")
    ;(minted || []).forEach(r => tokenBy.set(r.person_id, r.token))
  }

  const eventUrl = (pid) => {
    const tok = tokenBy.get(pid)
    return tok ? (SITE + "/events/" + ev.slug + "?t=" + encodeURIComponent(tok) + "&src=" + encodeURIComponent(src)) : ""
  }

  const headers = ["Profile URL", "First Name", "Last Name", "Company", "Position", "event_url"]
  const lines = [headers.join(",")]
  selected.forEach(p => {
    const fn = p.first_name || ((p.full_name || "").split(" ")[0] || "")
    const ln = p.last_name || ((p.full_name || "").split(" ").slice(1).join(" ") || "")
    lines.push([
      csvEscape(p.linkedin_url), csvEscape(fn), csvEscape(ln),
      csvEscape(p.company || ""), csvEscape(p.title || ""), csvEscape(eventUrl(p.id)),
    ].join(","))
  })
  const csv = lines.join("\n") + "\n"

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="' + slug + '-campaign-' + src + '.csv"',
      "X-PeerChair-Exported": String(selected.length),
      "X-PeerChair-TokensMinted": String(missing.length),
    },
  })
}
