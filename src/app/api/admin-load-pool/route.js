export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  })
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  })
}

// One-time admin endpoint: bulk upsert rows into pool table.
// Body: { secret, rows: [{ linkedin_url, first_name, last_name, full_name, title, company, location, geo_segment, title_type, heyreach_auto_tag, contactability, internal_tags }] }
export async function POST(request) {
  let body
  try { body = await request.json() } catch(e) {
    return json({ error: "Invalid JSON" }, 400)
  }

  const expected = process.env.LINKEDHELPER_WEBHOOK_SECRET || ""
  if (!expected || body.secret !== expected) {
    return json({ error: "Unauthorized" }, 401)
  }

  const rows = Array.isArray(body.rows) ? body.rows : []
  if (rows.length === 0) {
    return json({ error: "rows array required" }, 400)
  }
  if (rows.length > 1000) {
    return json({ error: "max 1000 rows per call" }, 400)
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Upsert via PostgREST: rows must have linkedin_url as the conflict target
  const { data, error } = await sb.from("pool")
    .upsert(rows, { onConflict: "linkedin_url", ignoreDuplicates: false })
    .select("linkedin_url")

  if (error) {
    console.error("Pool upsert error:", error.message)
    return json({ error: error.message }, 500)
  }

  return json({ ok: true, inserted_or_updated: (data || []).length })
}
