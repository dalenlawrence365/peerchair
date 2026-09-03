export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { getAllWarmthRows } from "@/lib/warmthScore"

// GET /api/reports/warmth — every CFO/sponsor-contact/referral-partner with
// a computed Warmth Index, sorted hottest first. Backs the dashboard's
// "Hot leads" tile and the /reports/warmth page.

export async function GET() {
  const sb = serverClient()
  const rows = await getAllWarmthRows(sb)
  const hotCount = rows.filter(function (r) { return r.tier === "hot" }).length
  const warmCount = rows.filter(function (r) { return r.tier === "warm" }).length
  return Response.json({ rows, count: rows.length, hot_count: hotCount, warm_count: warmCount })
}
