export const dynamic = "force-dynamic"

// GET /api/people/search?q=<text>
// Returns up to 10 people whose full_name, email, or company matches q.
// Used by the AddPersonModal's referrer picker. Searches across all roles
// (cfo, sponsor_contact, referral_partner) since referrals can come from anywhere.

import { createClient } from "@supabase/supabase-js"

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") || "").trim()
  if (q.length < 2) return Response.json({ results: [] })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const escaped = q.replace(/[%_]/g, "")
  const { data, error } = await sb
    .from("people")
    .select("id, full_name, first_name, last_name, title, company, email, roles, cfo_state")
    .or(`full_name.ilike.%${escaped}%,first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,company.ilike.%${escaped}%,email.ilike.%${escaped}%`)
    .limit(10)

  if (error) return Response.json({ results: [], error: error.message }, { status: 500 })

  return Response.json({
    results: (data || []).map(function(p) {
      return {
        id: p.id,
        name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        title: p.title || null,
        company: p.company || null,
        roles: p.roles || []
      }
    })
  })
}
