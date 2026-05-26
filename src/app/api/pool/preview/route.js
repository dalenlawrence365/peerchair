export const dynamic = "force-dynamic"

// POST /api/pool/preview
// Body: { rows: [{ linkedin_url, first_name, last_name, full_name, title, company, location, email? }], source_label? }
// Returns: { buckets: { new, in_pool, further_along, ambiguous, invalid }, source_label }
//
// Dedupe priority for matching against the master people table:
//   1. Normalized LinkedIn URL (canonical form) — strongest match
//   2. Email exact match (when present)
//   3. Full name + company fuzzy — flagged as 'ambiguous' for manual review, not auto-merged
//
// 'in_pool'        = already exists at cfo_state='pool' (we'd skip, no value added)
// 'further_along'  = already at audience/prospect/qualified/member (we'd skip, regression-protect)
// 'ambiguous'      = matched by name+company only — surfaces for Dalen to decide
// 'invalid'        = missing both URL and (name + something)
// 'new'            = no match anywhere — eligible for insert

import { createClient } from "@supabase/supabase-js"

function normalizeUrl(u) {
  if (!u) return ""
  return String(u).trim().toLowerCase()
    .replace(/^http:\/\//, "https://")
    .replace(/^https:\/\/linkedin\.com/, "https://www.linkedin.com")
    .replace(/\/$/, "")
    .replace(/\?.*$/, "")
    .replace(/#.*$/, "")
}
function slugFromUrl(u) {
  const m = u.match(/\/in\/([^\/\?#]+)/)
  return m ? m[1].toLowerCase() : ""
}
function normalizeName(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ")
}

export async function POST(request) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  let body
  try { body = await request.json() } catch(e) {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const rows = Array.isArray(body.rows) ? body.rows : []
  if (rows.length === 0) {
    return Response.json({ error: "No rows provided" }, { status: 400 })
  }

  // Load index: every CFO person with linkedin_url and key fields
  const { data: existing } = await sb
    .from("people")
    .select("id, full_name, first_name, last_name, linkedin_url, email, company, cfo_state, roles")
    .filter("roles", "cs", '{"cfo"}')
    .limit(20000)

  const bySlug = {}
  const byEmail = {}
  const byNameCompany = {}
  ;(existing || []).forEach(p => {
    const slug = slugFromUrl(normalizeUrl(p.linkedin_url || ""))
    if (slug) bySlug[slug] = p
    if (p.email) byEmail[p.email.toLowerCase().trim()] = p
    const nameKey = normalizeName(p.full_name || `${p.first_name || ""} ${p.last_name || ""}`)
    const companyKey = normalizeName(p.company || "")
    if (nameKey) {
      if (!byNameCompany[nameKey]) byNameCompany[nameKey] = []
      byNameCompany[nameKey].push({ ...p, _companyKey: companyKey })
    }
  })

  const buckets = { new: [], in_pool: [], further_along: [], ambiguous: [], invalid: [] }

  rows.forEach((raw, idx) => {
    const linkedin_url = normalizeUrl(raw.linkedin_url || raw.linkedinUrl || raw["LinkedIn URL"] || "")
    const first_name = String(raw.first_name || raw.firstName || raw["First Name"] || "").trim()
    const last_name = String(raw.last_name || raw.lastName || raw["Last Name"] || "").trim()
    const full_name = String(raw.full_name || raw.fullName || raw["Full Name"] || `${first_name} ${last_name}`).trim()
    const title = String(raw.title || raw.Title || raw["Position"] || "").trim()
    const company = String(raw.company || raw.Company || raw["Company Name"] || raw["Current Company"] || "").trim()
    const location = String(raw.location || raw.Location || "").trim()
    const email = String(raw.email || raw.Email || "").trim().toLowerCase()

    const slug = linkedin_url ? slugFromUrl(linkedin_url) : ""
    const nameKey = normalizeName(full_name)
    const companyKey = normalizeName(company)

    const out = {
      idx,
      linkedin_url, first_name, last_name, full_name, title, company, location, email,
      reason: null, matched_person_id: null, matched_state: null
    }

    if (!slug && !nameKey) {
      out.reason = "missing both linkedin_url and name"
      buckets.invalid.push(out); return
    }

    // 1. Try LinkedIn URL slug
    if (slug && bySlug[slug]) {
      const m = bySlug[slug]
      out.matched_person_id = m.id
      out.matched_state = m.cfo_state || "pool"
      if (out.matched_state === "pool") buckets.in_pool.push(out)
      else buckets.further_along.push(out)
      return
    }

    // 2. Try email exact match
    if (email && byEmail[email]) {
      const m = byEmail[email]
      out.matched_person_id = m.id
      out.matched_state = m.cfo_state || "pool"
      out.reason = "matched by email"
      if (out.matched_state === "pool") buckets.in_pool.push(out)
      else buckets.further_along.push(out)
      return
    }

    // 3. Name + company fuzzy
    if (nameKey && byNameCompany[nameKey]) {
      const candidates = byNameCompany[nameKey]
      const tight = candidates.find(c => c._companyKey && c._companyKey === companyKey)
      if (tight) {
        out.matched_person_id = tight.id
        out.matched_state = tight.cfo_state || "pool"
        out.reason = "matched by name + company (no LinkedIn URL)"
        buckets.ambiguous.push(out); return
      }
      out.reason = `name matches ${candidates.length} existing person(s) with different/unknown company`
      out.matched_person_id = candidates[0].id
      out.matched_state = candidates[0].cfo_state || "pool"
      buckets.ambiguous.push(out); return
    }

    // 4. Net new
    buckets.new.push(out)
  })

  return Response.json({
    summary: {
      new: buckets.new.length,
      in_pool: buckets.in_pool.length,
      further_along: buckets.further_along.length,
      ambiguous: buckets.ambiguous.length,
      invalid: buckets.invalid.length,
      total: rows.length
    },
    buckets,
    source_label: body.source_label || null
  })
}
