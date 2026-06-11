export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { checkExtensionAuth, slugFromUrl, stripCreds } from "@/lib/extensionMatch"

// POST /api/extension/match  { linkedin_url?, name?, company?, email? }
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-extension-token",
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }
const J = (data, status) => Response.json(data, { status: status || 200, headers: CORS })

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
  if (!auth.ok) return J({ error: "unauthorized" }, 401)
  let body
  try { body = await request.json() } catch (e) { return J({ error: "invalid JSON" }, 400) }
  const sb = serverClient()

  const out = []
  const seen = new Set()
  const push = (rows) => { for (const r of (rows || [])) { if (r && !seen.has(r.id)) { seen.add(r.id); out.push(r) } } }
  let matchedBy = null

  // 1) Authoritative exact identity via the shared de-dup matcher (normalized slug -> email
  //    -> normalized name+company). Pinned first so the human always sees the real match,
  //    even when encoding/middle-initial/suffix differences would hide it from fuzzy search.
  const { data: exactId } = await sb.rpc("find_existing_person", {
    p_linkedin_url: body.linkedin_url || null,
    p_email: body.email || null,
    p_full_name: body.name || null,
    p_company: body.company || null,
  })
  if (exactId) {
    const { data } = await sb.from("people").select(SEL).eq("id", exactId).maybeSingle()
    if (data) { push([data]); matchedBy = "exact" }
  }

  // 2) Fuzzy URL-slug candidates (substring) for human review
  const slug = slugFromUrl(body.linkedin_url)
  if (slug) {
    const { data } = await sb.from("people").select(SEL).ilike("linkedin_url", `%${slug}%`).limit(5)
    if (data && data.length) { push(data); matchedBy = matchedBy || "url" }
  }

  // 3) Fuzzy name candidates, ranked by company overlap
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
      data.sort((a, b) => {
        const am = co && a.company && a.company.toLowerCase().includes(co) ? 1 : 0
        const bm = co && b.company && b.company.toLowerCase().includes(co) ? 1 : 0
        return bm - am
      })
      push(data); matchedBy = matchedBy || "name"
    }
  }

  return J({ matched_by: matchedBy, exact: !!exactId, exact_id: exactId || null, candidates: out.map(shape) })
}
