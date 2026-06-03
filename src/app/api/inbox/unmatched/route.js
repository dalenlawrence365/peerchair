export const dynamic = "force-dynamic"

import { serverClient } from "@/lib/supabaseServer"

export async function GET(request) {
  const sb = serverClient()
  const url = new URL(request.url)
  const status = url.searchParams.get("status") || "new"
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500)

  let q = sb.from("unmatched_communications")
    .select("id, direction, from_address, from_name, subject, body_preview, occurred_at, status, seen_at, merged_into_person_id, resulted_in_person_id")
    .order("occurred_at", { ascending: false })
    .limit(limit)

  if (status !== "all") q = q.eq("status", status)

  const { data, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Tallies for the tab badges
  const { data: tally } = await sb.from("unmatched_communications").select("status")
  const counts = { new: 0, added_to_peerchair: 0, merged_into_existing: 0, ignored: 0 }
  for (const r of tally || []) counts[r.status] = (counts[r.status] || 0) + 1

  return Response.json({ items: data || [], counts })
}
