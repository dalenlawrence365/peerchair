export const dynamic = "force-dynamic"

// POST /api/pool/commit
// Body: { rows: [<new+approved>], source_label?: string }
// Inserts each row into the people table at cfo_state='pool', roles=['cfo'].
// Also writes audit_log entry with the import details.
//
// SAFETY:
// - Does NOT re-check dedupe. The caller (UI) is expected to have run /preview
//   and only forward the 'new' bucket plus any 'ambiguous' rows Dalen manually
//   approved. Server is intentionally trusting here so manual decisions stick.
// - Inserts in batches of 200 to keep individual queries small.
// - On per-row insert error, logs to audit_log errors[] and continues.

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
  const sourceLabel = body.source_label || `import-${new Date().toISOString().slice(0,10)}`
  const inserted = []
  const errors = []

  if (rows.length === 0) {
    return Response.json({ error: "No rows provided" }, { status: 400 })
  }

  const insertRows = rows.map(r => ({
    first_name: String(r.first_name || "").trim() || null,
    last_name: String(r.last_name || "").trim() || null,
    full_name: String(r.full_name || `${r.first_name || ""} ${r.last_name || ""}`).trim() || null,
    title: String(r.title || "").trim() || null,
    company: String(r.company || "").trim() || null,
    location: String(r.location || "").trim() || null,
    email: String(r.email || "").trim().toLowerCase() || null,
    linkedin_url: normalizeUrl(r.linkedin_url) || null,
    roles: ["cfo"],
    cfo_state: "pool",
    source: sourceLabel,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }))

  for (let i = 0; i < insertRows.length; i += 200) {
    const batch = insertRows.slice(i, i + 200)
    const { data, error } = await sb.from("people").insert(batch).select("id, linkedin_url, full_name")
    if (error) {
      errors.push({ batch_start: i, message: error.message })
    } else {
      inserted.push(...(data || []))
    }
  }

  try {
    await sb.from("audit_log").insert({
      run_at: new Date().toISOString(),
      audit_type: "pool_import",
      contacts_checked: rows.length,
      contacts_created: inserted.length,
      summary: `pool_import · ${inserted.length}/${rows.length} inserted · source: ${sourceLabel}`,
      errors: errors.map(e => `batch ${e.batch_start}: ${e.message}`)
    })
  } catch(e) { /* audit failure is fine */ }

  return Response.json({
    summary: { requested: rows.length, inserted: inserted.length, failed: rows.length - inserted.length },
    source_label: sourceLabel,
    errors
  })
}
