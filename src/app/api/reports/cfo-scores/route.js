export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { getCfoScoreRows, avgScore } from "@/lib/cfoScores"

// GET /api/reports/cfo-scores — every CFO with a scored research note,
// latest score only, sorted highest first. Backs the "Average CFO score"
// dashboard tile and the /reports/cfo-scores page.

export async function GET() {
  const sb = serverClient()
  const rows = await getCfoScoreRows(sb)
  return Response.json({ rows, avg_score: avgScore(rows), count: rows.length })
}
