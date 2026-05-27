export const dynamic = "force-dynamic"

// GET /api/search?q=<text>
//
// Global app search — used by GlobalSearch.jsx (the search box anywhere in
// the app chrome). Returns matching people + sponsor companies.
//
// CHANGED 2026-05-27: switched from legacy `contacts` table to the unified
// `people` table. Previously, anything added via AddPersonModal or
// /pool/import (which write to people directly) was invisible to global
// search because the query was reading from contacts only. Now people is
// the single source of truth here too.

import { createClient } from "@supabase/supabase-js"

// Roles array → short label, e.g. ["cfo"] → "CFO", ["sponsor_contact"] → "Sponsor"
function rolesToType(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return "Person"
  if (roles.includes("cfo") && roles.includes("sponsor_contact")) return "CFO + Sponsor"
  if (roles.includes("cfo")) return "CFO"
  if (roles.includes("sponsor_contact")) return "Sponsor contact"
  if (roles.includes("referral_partner")) return "Referral partner"
  return roles[0]
}

// Pick the most-meaningful per-role state to show as the search-result subtitle.
// Prefer the state of the most "engaged" role.
function rolesToStage(roles, cfo_state, sponsor_state, referral_state) {
  if (!Array.isArray(roles)) return null
  if (roles.includes("cfo") && cfo_state) return "CFO: " + cfo_state
  if (roles.includes("sponsor_contact") && sponsor_state) return "Sponsor: " + sponsor_state
  if (roles.includes("referral_partner") && referral_state) return "Referral: " + referral_state
  return null
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") || "").trim()
  if (!q || q.length < 2) return Response.json({ contacts: [], companies: [] })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Strip % and _ to neutralize ILIKE wildcards in user input
  const safe = q.replace(/[%_]/g, "")

  const [{ data: people }, { data: companies }] = await Promise.all([
    sb.from("people")
      .select("id, first_name, last_name, full_name, title, company, email, roles, cfo_state, sponsor_state, referral_state")
      .or(`full_name.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,company.ilike.%${safe}%,email.ilike.%${safe}%`)
      .limit(8),
    sb.from("companies")
      .select("id, name, sponsor_type, is_sponsor")
      .ilike("name", `%${safe}%`)
      .eq("is_sponsor", true)
      .limit(4)
  ])

  return Response.json({
    // Key kept as "contacts" for backward compatibility with GlobalSearch.jsx
    contacts: (people || []).map(function(p){
      return {
        id: p.id,
        name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        title: p.title || null,
        company: p.company || null,
        type: rolesToType(p.roles),
        stage: rolesToStage(p.roles, p.cfo_state, p.sponsor_state, p.referral_state),
      }
    }),
    companies: (companies || []).map(function(co){
      return {
        id: co.id,
        name: co.name,
        type: co.sponsor_type || "Sponsor",
      }
    })
  })
}
