export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/traffic-metrics?days=30
// One RPC returns every cut: totals, daily trend, by-page, by-source (channel),
// funnel reach across the page chain, and the recent attributed-person feed.
export async function GET(req) {
  const raw = parseInt(new URL(req.url).searchParams.get("days") || "30", 10)
  const days = Math.min(Math.max(Number.isFinite(raw) ? raw : 30, 1), 365)
  const sb = serverClient()
  const { data, error } = await sb.rpc("traffic_summary", { days })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data || {})
}
