export const dynamic = "force-dynamic"

// GET /api/people/search?q=<text>
// Returns up to 10 people whose full_name, email, or company matches q.
// Used by the AddPersonModal's referrer picker. Searches across all roles
// (cfo, sponsor_contact, referral_partner) since referrals can come from anywhere.

import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

// Same relevance scoring as /api/search — name matches outrank loose
// company/email hits, and linkedin_url is included so people whose LinkedIn
// "last name" field is a vanity credential (full_name "Phil CPA" for
// /in/philoseas, real surname only in the URL slug) are still findable.
function scorePerson(p, qLower) {
  const full = (p.full_name || `${p.first_name || ""} ${p.last_name || ""}`).trim().toLowerCase()
  const first = (p.first_name || "").toLowerCase()
  const last = (p.last_name || "").toLowerCase()
  const company = (p.company || "").toLowerCase()
  const email = (p.email || "").toLowerCase()
  const linkedin = (p.linkedin_url || "").toLowerCase()

  if (full === qLower) return 100
  if (first === qLower || last === qLower) return 95
  if (full.startsWith(qLower)) return 85
  if (first.startsWith(qLower) || last.startsWith(qLower)) return 80
  if (new RegExp(`\\b${qLower.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&")}`).test(full)) return 65
  if (full.includes(qLower)) return 45
  if (email.startsWith(qLower)) return 35
  if (linkedin.includes(qLower)) return 30
  if (company.startsWith(qLower)) return 20
  if (company.includes(qLower) || email.includes(qLower)) return 10
  return 0
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") || "").trim()
  if (q.length < 2) return Response.json({ results: [] })

  const sb = serverClient()

  const escaped = q.replace(/[%_]/g, "")
  const qLower = escaped.toLowerCase()
  const { data: dataRaw, error } = await sb
    .from("people")
    .select("id, full_name, first_name, last_name, title, company, email, roles, cfo_state, linkedin_url")
    .or(`full_name.ilike.%${escaped}%,first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,company.ilike.%${escaped}%,email.ilike.%${escaped}%,linkedin_url.ilike.%${escaped}%`)
    .limit(40)

  if (error) return Response.json({ results: [], error: error.message }, { status: 500 })

  const data = (dataRaw || [])
    .map(function(p) { return { p, score: scorePerson(p, qLower) } })
    .sort(function(a, b) { return b.score - a.score || (a.p.full_name || "").localeCompare(b.p.full_name || "") })
    .slice(0, 10)
    .map(function(x) { return x.p })

  return Response.json({
    results: (data || []).map(function(p) {
      return {
        id: p.id,
        name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        // The unmatched merge picker renders r.full_name and r.email. Both were
        // selected from the DB and then dropped here, so the dialog showed a blank
        // name and "(no email)" for everyone — you couldn't tell which person you
        // were about to attribute a message to.
        full_name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        email: p.email || null,
        title: p.title || null,
        company: p.company || null,
        roles: p.roles || [],
        cfo_state: p.cfo_state || null
      }
    })
  })
}
