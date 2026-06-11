export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { checkExtensionAuth, canonicalUrl } from "@/lib/extensionMatch"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-extension-token",
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }
const J = (data, status) => Response.json(data, { status: status || 200, headers: CORS })

const ROLE_KEYS = ["cfo", "sponsor_contact", "referral_partner"]
const STATE_FIELD = { cfo: "cfo_state", sponsor_contact: "sponsor_state", referral_partner: "referral_state" }

export async function POST(request) {
  const auth = checkExtensionAuth(request)
  if (!auth.ok) return J({ error: "unauthorized" }, 401)
  let body
  try { body = await request.json() } catch (e) { return J({ error: "invalid JSON" }, 400) }
  const sb = serverClient()

  const roles = Array.isArray(body.roles) ? body.roles.filter(r => ROLE_KEYS.includes(r)) : []
  const provisor = !!body.provisors_member
  const connected = /^1/.test(String(body.connection_degree || "").trim())
  const url = canonicalUrl(body.linkedin_url)
  const fullName = (body.full_name || "").trim()

  // Resolve the target person. Honor the human's pick (match_id) first; otherwise run the
  // shared de-dup matcher as a BACKSTOP so "Create new" cannot mint a duplicate when an
  // exact identity (normalized slug / email / name+company) already exists. This is the same
  // matcher every other write path uses -> the Claudia / Albert duplicate classes can't recur.
  let matchId = body.match_id || null
  let backstopped = false
  if (!matchId) {
    const { data: pid } = await sb.rpc("find_existing_person", {
      p_linkedin_url: body.linkedin_url || null,
      p_email: body.email || null,
      p_full_name: fullName || null,
      p_company: body.company || null,
    })
    if (pid) { matchId = pid; backstopped = true }
  }

  if (matchId) {
    const { data: ex } = await sb.from("people")
      .select("id, linkedin_url, roles, provisors_member, linkedin_connected, cfo_state, sponsor_state, referral_state")
      .eq("id", matchId).maybeSingle()
    if (!ex) return J({ error: "match_id not found" }, 404)

    const patch = { updated_at: new Date().toISOString() }
    if (url && !ex.linkedin_url) patch.linkedin_url = url
    if (body.about) patch.about = body.about
    if (body.headline) patch.headline = body.headline
    if (connected && !ex.linkedin_connected) patch.linkedin_connected = true
    if (provisor && !ex.provisors_member) patch.provisors_member = true

    if (roles.length) {
      patch.roles = Array.from(new Set([...(ex.roles || []), ...roles]))
      for (const r of roles) {
        const f = STATE_FIELD[r]
        if (f && !ex[f]) patch[f] = connected ? "audience" : "pool"
      }
    }
    const { error } = await sb.from("people").update(patch).eq("id", ex.id)
    if (error) return J({ error: error.message }, 500)
    return J({ ok: true, action: backstopped ? "linked_existing" : "updated", id: ex.id, backstopped })
  }

  if (!fullName) return J({ error: "full_name required to create" }, 400)
  const ins = { full_name: fullName, roles, provisors_member: provisor, linkedin_connected: connected, source: "chrome_extension" }
  if (url) ins.linkedin_url = url
  if (body.title) ins.title = body.title
  if (body.company) ins.company = body.company
  if (body.location) ins.location = body.location
  if (body.about) ins.about = body.about
  if (body.headline) ins.headline = body.headline
  for (const r of roles) { const f = STATE_FIELD[r]; if (f) ins[f] = connected ? "audience" : "pool" }
  const { data: row, error } = await sb.from("people").insert(ins).select("id").single()
  if (error || !row) return J({ error: error ? error.message : "insert failed" }, 500)
  return J({ ok: true, action: "created", id: row.id })
}
