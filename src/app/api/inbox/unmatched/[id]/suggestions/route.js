export const dynamic = "force-dynamic"

import { serverClient } from "@/lib/supabaseServer"
import { scoreCandidate, confidenceOf, domainOf, localOf } from "@/lib/senderSuggest"

// Who is this sender probably? Ranks candidates and returns the evidence.
// Read-only by design — the answer is a suggestion Dalen confirms, never a write.
export async function GET(req, { params }) {
  const { id } = await params
  const sb = serverClient()

  const { data: row, error: rowErr } = await sb
    .from("unmatched_communications")
    .select("id, from_address, from_name, subject")
    .eq("id", id)
    .single()
  if (rowErr || !row) return Response.json({ error: "Unmatched row not found" }, { status: 404 })

  const domain = domainOf(row.from_address)
  const local = localOf(row.from_address)

  // Narrow the field before scoring: people who share the domain, or whose name
  // shares a token with the From: name or the address local part.
  const nameBits = String(row.from_name || "")
    .toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/[\s'-]+/)
    .concat(local.split(/[._\-+]/))
    .filter(function (t) { return t && t.length > 2 })

  const candidateIds = new Set()

  if (domain) {
    const { data: sameDomain } = await sb
      .from("person_emails")
      .select("person_id, email")
      .ilike("email", "%@" + domain)
      .limit(50)
    for (const r of sameDomain || []) candidateIds.add(r.person_id)
  }

  for (const bit of [...new Set(nameBits)].slice(0, 6)) {
    const { data: byName } = await sb
      .from("people")
      .select("id")
      .ilike("full_name", "%" + bit + "%")
      .limit(25)
    for (const r of byName || []) candidateIds.add(r.id)
  }
  if (domain) {
    const root = domain.split(".").slice(-2, -1)[0]
    if (root && root.length > 3) {
      const { data: byCompany } = await sb
        .from("people").select("id").ilike("company", "%" + root + "%").limit(25)
      for (const r of byCompany || []) candidateIds.add(r.id)
    }
  }

  if (!candidateIds.size) return Response.json({ suggestions: [], sender: row })

  const { data: people, error: pErr } = await sb
    .from("people")
    .select("id, full_name, email, company, title, roles")
    .in("id", Array.from(candidateIds).slice(0, 100))
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 })

  // Every known address for each candidate, so domain matching sees aliases too.
  const { data: aliasRows } = await sb
    .from("person_emails")
    .select("person_id, email")
    .in("person_id", (people || []).map(function (p) { return p.id }))
  const aliasesFor = {}
  for (const a of aliasRows || []) {
    if (!aliasesFor[a.person_id]) aliasesFor[a.person_id] = []
    aliasesFor[a.person_id].push(a.email)
  }

  const scored = (people || [])
    .map(function (p) {
      const withEmails = Object.assign({}, p, { emails: aliasesFor[p.id] || (p.email ? [p.email] : []) })
      const s = scoreCandidate(row, withEmails)
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        company: p.company,
        title: p.title,
        roles: p.roles,
        known_addresses: aliasesFor[p.id] || [],
        score: s.score,
        reasons: s.reasons,
        confidence: confidenceOf(s.score),
      }
    })
    .filter(function (c) { return c.score >= 20 })
    .sort(function (a, b) { return b.score - a.score })
    .slice(0, 4)

  return Response.json({ sender: row, suggestions: scored })
}
