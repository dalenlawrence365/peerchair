export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { checkExtensionAuth, canonicalUrl } from "@/lib/extensionMatch"

// POST /api/extension/capture
// { match_id?, linkedin_url, full_name, title, company, location, about, headline,
//   connection_degree, roles?:[cfo|sponsor_contact|referral_partner], provisors_member? }
// match_id present -> UPDATE existing (attach URL + About, set connection, merge roles).
// match_id absent  -> CREATE new from page fields + chosen roles.

const ROLE_KEYS = ["cfo", "sponsor_contact", "referral_partner"]
const STATE_FIELD = { cfo: "cfo_state", sponsor_contact: "sponsor_state", referral_partner: "referral_state" }

export async function POST(request) {
  const auth = checkExtensionAuth(request)
  if (!auth.ok) return Response.json({ error: "unauthorized" }, { status: 401 })
  let body
  try { body = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }
  const sb = serverClient()

  const roles = Array.isArray(body.roles) ? body.roles.filter(r => ROLE_KEYS.includes(r)) : []
  const provisor = !!body.provisors_member
  const connected = /^1/.test(String(body.connection_degree || "").trim())  // "1st" -> true
  const url = canonicalUrl(body.linkedin_url)
  const fullName = (body.full_name || "").trim()

  if (body.match_id) {
    const { data: ex } = await sb.from("people")
      .select("id, linkedin_url, roles, provisors_member, linkedin_connected, cfo_state, sponsor_state, referral_state")
      .eq("id", body.match_id).maybeSingle()
    if (!ex) return Response.json({ error: "match_id not found" }, { status: 404 })

    const patch = { updated_at: new Date().toISOString() }
    if (url && !ex.linkedin_url) patch.linkedin_url = url            // fill, never clobber an existing URL
    if (body.about) patch.about = body.about                         // About is authoritative from LinkedIn
    if (body.headline) patch.headline = body.headline
    if (connected && !ex.linkedin_connected) patch.linkedin_connected = true
    if (provisor && !ex.provisors_member) patch.provisors_member = true

    if (roles.length) {
      patch.roles = Array.from(new Set([...(ex.roles || []), ...roles]))
      // default a stage for any newly-added role that has none yet
      for (const r of roles) {
        const f = STATE_FIELD[r]
        if (f && !ex[f]) patch[f] = connected ? "audience" : "pool"
      }
    }
    const { error } = await sb.from("people").update(patch).eq("id", ex.id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true, action: "updated", id: ex.id })
  }

  // CREATE
  if (!fullName) return Response.json({ error: "full_name required to create" }, { status: 400 })
  const ins = { full_name: fullName, roles, provisors_member: provisor, linkedin_connected: connected, source: "chrome_extension" }
  if (url) ins.linkedin_url = url
  if (body.title) ins.title = body.title
  if (body.company) ins.company = body.company
  if (body.location) ins.location = body.location
  if (body.about) ins.about = body.about
  if (body.headline) ins.headline = body.headline
  for (const r of roles) {
    const f = STATE_FIELD[r]
    if (f) ins[f] = connected ? "audience" : "pool"
  }
  const { data: row, error } = await sb.from("people").insert(ins).select("id").single()
  if (error || !row) return Response.json({ error: error ? error.message : "insert failed" }, { status: 500 })
  return Response.json({ ok: true, action: "created", id: row.id })
}
