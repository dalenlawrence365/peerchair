export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// POST /api/people/merge { winner_id, loser_id }
// Merges loser INTO winner via the merge_people() DB function — every reference
// reassigned, survivor keeps its token and gap-fills missing identity fields,
// loser deleted. Idempotent-safe: a missing loser just errors cleanly.
export async function POST(request) {
  const sb = serverClient()
  const body = await request.json().catch(function () { return {} })
  const winner = (body.winner_id || "").toString().trim()
  const loser = (body.loser_id || "").toString().trim()
  if (!winner || !loser) return Response.json({ error: "winner_id and loser_id required" }, { status: 400 })
  if (winner === loser) return Response.json({ error: "same person" }, { status: 400 })

  const { data, error } = await sb.rpc("merge_people", { p_winner: winner, p_loser: loser })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data || { ok: true })
}
