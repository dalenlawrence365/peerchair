export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { checkExtensionAuth, slugFromUrl, stripCreds } from "@/lib/extensionMatch"

// POST /api/extension/match  { linkedin_url?, name?, company? }
// Returns { matched_by, exact, candidates:[...] }. URL first, then name (+ company rank).
// Almost always one exact match; returns a short list when a name is ambiguous.

const SEL = "id, full_name, company, title, linkedin_url, roles, provisors_member, sponsor_state, cfo_state, cfo_circle_member, about"

function shape(p) {
  return {
    id: p.id, full_name: p.full_name, company: p.company, title: p.title,
    linkedin_url: p.linkedin_url, has_linkedin_url: !!p.linkedin_url,
    roles: p.roles || [], provisors_member: !!p.provisors_member,
    sponsor_state: p.sponsor_state, cfo_state: p.cfo_state,
    cfo_circle_member: !!p.cfo_circle_member,
    has_about: !!(p.about && p.about.length),
  }
}

export async function POST(request) {
  const auth = checkExtensionAuth(request)
  if (!auth.ok) return Response.json({ error: "unauthorized" }, { status: 401 })
  let body
  try { body = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }
  const sb = serverClient()

  // 1) URL match (strongest signal)
  const slug = slugFromUrl(body.linkedin_url)
  if (slug) {
    const { data } = await sb.from("people").select(SEL).ilike("linkedin_url", `%${slug}%`).limit(5)
    if (data && data.length) return Response.json({ matched_by: "url", exact: data.length === 1, candidates: data.map(shape) })
  }

  // 2) name match (+ company disambiguation) — this is the no-URL-on-file path
  const name = stripCreds(body.name)
  if (name) {
    let { data } = await sb.from("people").select(SEL).ilike("full_name", `%${name}%`).limit(10)
    if (!data || !data.length) {
      const toks = name.split(/\s+/).filter(Boolean)
      if (toks.length >= 2) {
        const first = toks[0], last = toks[toks.length - 1]
        const r = await sb.from("people").select(SEL).ilike("full_name", `%${first}%`).ilike("full_name", `%${last}%`).limit(10)
        data = r.data
      }
    }
    if (data && data.length) {
      const co = (body.company || "").toLowerCase()
      const ranked = [...data].sort((a, b) => {
        const am = co && a.company && a.company.toLowerCase().includes(co) ? 1 : 0
        const bm = co && b.company && b.company.toLowerCase().includes(co) ? 1 : 0
        return bm - am
      })
      return Response.json({ matched_by: "name", exact: ranked.length === 1, candidates: ranked.map(shape) })
    }
  }

  return Response.json({ matched_by: null, exact: false, candidates: [] })
}
