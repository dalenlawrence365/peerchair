export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/cfo/linkedhelper-seed-export?k=<key>&batch=<set_by>
// Streams the LinkedHelper CSV for a cold-CFO seed batch already tagged with
// action_type 'export_to_linkedhelper'. One row per CFO, with FOUR per-person
// tracked links (assessment / Aug 11 registration / homepage), all ?t=<token>.
// Selection + tagging already happened; this just serves the file, so it's
// safe to re-download and always matches what's marked "loaded".
const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"
const PROBE_KEY = "pk_7f3a91c4d2e6"
const SRC = "li-cold"

function q(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"' }

export async function GET(request) {
  const url = new URL(request.url)
  if (url.searchParams.get("k") !== PROBE_KEY) return Response.json({ error: "not found" }, { status: 404 })
  const batch = (url.searchParams.get("batch") || "linkedhelper_seed").slice(0, 64)

  const sb = serverClient()
  // The tagged people, newest first (matches how the batch was picked).
  const { data: tags, error } = await sb.from("person_action_tags")
    .select("person_id, set_at")
    .eq("action_type", "export_to_linkedhelper").eq("set_by", batch)
    .order("set_at", { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const ids = [...new Set((tags || []).map(t => t.person_id))]
  if (!ids.length) return Response.json({ error: "empty_batch" }, { status: 404 })

  // People + tokens (chunked to stay under URL length limits).
  const people = {}
  const tokenBy = {}
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200)
    const { data: pp } = await sb.from("people")
      .select("id, first_name, last_name, full_name, company, title, linkedin_url, created_at").in("id", slice)
    for (const p of (pp || [])) people[p.id] = p
    const { data: tk } = await sb.from("track_tokens").select("person_id, token").in("person_id", slice)
    for (const r of (tk || [])) tokenBy[r.person_id] = r.token
  }

  const rows = ids.map(id => people[id]).filter(Boolean)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

  const link = (tok, path) => tok ? (SITE + path + (path.indexOf("?") === -1 ? "?" : "&") + "t=" + encodeURIComponent(tok) + "&src=" + SRC) : ""
  const header = ["Profile URL", "First Name", "Last Name", "Company", "Position", "assessment_url", "meeting_url", "event_url", "home_url"]
  const lines = [header.join(",")]
  for (const p of rows) {
    const tok = tokenBy[p.id]
    const fn = p.first_name || (p.full_name || "").split(" ")[0] || ""
    const ln = p.last_name || (p.full_name || "").split(" ").slice(1).join(" ") || ""
    lines.push([
      q(p.linkedin_url), q(fn), q(ln), q(p.company), q(p.title),
      q(link(tok, "/assessment")),
      q(link(tok, "/meeting")),
      q(link(tok, "/events/august-11-workshop")),
      q(link(tok, "/")),
    ].join(","))
  }
  const csv = lines.join("\n") + "\n"
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cfo-linkedhelper-cold-seed.csv"',
      "X-PeerChair-Rows": String(rows.length),
    },
  })
}
