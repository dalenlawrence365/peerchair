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
import { serverClient } from "@/lib/supabaseServer"

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

// Score a candidate person against the query so name matches always outrank
// loose company/email substring hits, and so people whose LinkedIn "last name"
// field is actually a vanity credential (e.g. full_name "Phil CPA" with the
// real surname only living in the profile URL slug, like /in/philoseas) can
// still be found and still rank sensibly once found.
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
  if (!q || q.length < 2) return Response.json({ contacts: [], companies: [] })

  const sb = serverClient()

  // Strip % and _ to neutralize ILIKE wildcards in user input
  const safe = q.replace(/[%_]/g, "")
  const qLower = safe.toLowerCase()

  // Pull a wider candidate pool than we'll return (40, not 8) so the relevance
  // ranking below has real signal to work with instead of just whatever order
  // Postgres happened to return. linkedin_url is included in the match so
  // people whose real surname isn't in first/last/full name (their LinkedIn
  // "last name" field is a credential like "CPA"/"MBA", e.g. full_name "Phil
  // CPA" for /in/philoseas) are still findable by their actual name.
  const [{ data: peopleRaw }, { data: companies }] = await Promise.all([
    sb.from("people")
      .select("id, first_name, last_name, full_name, title, company, email, roles, cfo_state, sponsor_state, referral_state, avatar_url, linkedin_url")
      .or(`full_name.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,company.ilike.%${safe}%,email.ilike.%${safe}%,linkedin_url.ilike.%${safe}%`)
      .limit(40),
    sb.from("companies")
      .select("id, name, sponsor_type, is_sponsor")
      .ilike("name", `%${safe}%`)
      .eq("is_sponsor", true)
      .limit(4)
  ])

  // Rank name matches above loose company/email/URL substring matches, then
  // trim to the 8 we actually show.
  const people = (peopleRaw || [])
    .map(function(p) { return { p, score: scorePerson(p, qLower) } })
    .sort(function(a, b) { return b.score - a.score || (a.p.full_name || "").localeCompare(b.p.full_name || "") })
    .slice(0, 8)
    .map(function(x) { return x.p })

  return Response.json({
    // Key kept as "contacts" for backward compatibility with GlobalSearch.jsx
    contacts: (people || []).map(function(p){
      return {
        id: p.id,
        name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        // full_name + email are what identify a person in a picker. They were
        // selected from the DB but never returned, so the unmatched merge dialog
        // rendered a blank name and "(no email)" for everyone — you couldn't tell
        // which Cyrus you were about to attribute an email to.
        full_name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        email: p.email || null,
        title: p.title || null,
        company: p.company || null,
        type: rolesToType(p.roles),
        avatar_url: p.avatar_url || null,
        stage: rolesToStage(p.roles, p.cfo_state, p.sponsor_state, p.referral_state),
        // Routing data for the in-app search bar
        roles: p.roles || [],
        cfo_state: p.cfo_state || null,
        sponsor_state: p.sponsor_state || null,
        referral_state: p.referral_state || null,
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
