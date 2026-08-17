export const dynamic = "force-dynamic"
export const maxDuration = 120
import { serverClient } from "@/lib/supabaseServer"

// GET /api/events/seed-campaign-export?k=<key>&slug=<event>&src=li-dm
// CSV for the cold-outreach seed (B3 export 2026-06-30 and every LinkedHelper
// export after it — see view public.v_seed_b3plus). One row per person with a
// personal Sept-16-style registration link in a `cs_tracking_link` column, which
// is the merge field the campaign message uses. Tokens are person-scoped and
// already exist for the seed; any missing are minted here (self-healing).
const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"
const KEY = "pk_seed_7c1f9e2b"

function csvEscape(v) {
  if (v === null || v === undefined) return ""
  const s = String(v)
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export async function GET(request) {
  const url = new URL(request.url)
  if (url.searchParams.get("k") !== KEY) return Response.json({ error: "not found" }, { status: 404 })
  const slug = (url.searchParams.get("slug") || "").trim()
  const src = (url.searchParams.get("src") || "li-dm").trim().slice(0, 64)
  if (!slug) return Response.json({ error: "missing_slug" }, { status: 400 })

  const sb = serverClient()
  const { data: ev } = await sb.from("events").select("slug, published").eq("slug", slug).maybeSingle()
  if (!ev || !ev.published) return Response.json({ error: "event_not_found_or_unpublished" }, { status: 404 })

  // Page through the seed view (avoids the 1000-row default cap).
  const rows = []
  const size = 1000
  for (let page = 0; ; page++) {
    const { data, error } = await sb
      .from("v_seed_b3plus")
      .select("person_id, first_name, last_name, full_name, company, title, linkedin_url, token")
      .order("person_id", { ascending: true })
      .range(page * size, page * size + size - 1)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    rows.push(...(data || []))
    if (!data || data.length < size) break
  }

  // Self-heal: mint tokens for anyone missing one.
  const missing = rows.filter(r => !r.token).map(r => r.person_id)
  if (missing.length) {
    const { data: minted } = await sb.from("track_tokens").insert(missing.map(id => ({ person_id: id }))).select("person_id, token")
    const m = new Map((minted || []).map(r => [r.person_id, r.token]))
    rows.forEach(r => { if (!r.token && m.has(r.person_id)) r.token = m.get(r.person_id) })
  }

  const headers = ["Profile URL", "First Name", "Last Name", "Company", "Position", "cs_tracking_link"]
  const lines = [headers.join(",")]
  let linked = 0
  for (const r of rows) {
    if (!r.token) continue
    const fn = r.first_name || ((r.full_name || "").split(" ")[0] || "")
    const ln = r.last_name || ((r.full_name || "").split(" ").slice(1).join(" ") || "")
    const link = SITE + "/events/" + slug + "?t=" + encodeURIComponent(r.token) + "&src=" + encodeURIComponent(src)
    lines.push([csvEscape(r.linkedin_url), csvEscape(fn), csvEscape(ln), csvEscape(r.company || ""), csvEscape(r.title || ""), csvEscape(link)].join(","))
    linked++
  }
  const csv = lines.join("\n") + "\n"

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="' + slug + '-seed-b3plus-' + src + '.csv"',
      "X-PeerChair-Rows": String(linked),
      "X-PeerChair-Src": src,
    },
  })
}
