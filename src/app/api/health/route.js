export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/health — runs the full data-integrity audit via the
// get_health_report() Postgres function. Single round-trip, all counts
// computed in the database (no row-fetch, no 1000-row cap).

export async function GET() {
  const sb = serverClient()
  const { data, error } = await sb.rpc("get_health_report")
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

// POST /api/health  { fix: "clear_stray_cfo_state" | "relink_orphans" }
// One-click remediations for the safe, well-understood issues.
export async function POST(request) {
  let body
  try { body = await request.json() } catch(e) { return Response.json({ error: "bad json" }, { status: 400 }) }
  const fix = body.fix

  const sb = serverClient()

  if (fix === "clear_stray_cfo_state") {
    // Null out cfo_state for people who are NOT tagged as cfo.
    const { data, error } = await sb.rpc("clear_stray_cfo_state")
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true, cleared: data })
  }

  return Response.json({ error: "unknown fix" }, { status: 400 })
}
