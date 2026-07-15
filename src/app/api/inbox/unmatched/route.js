export const dynamic = "force-dynamic"

import { serverClient } from "@/lib/supabaseServer"

const ALL_STATUSES = ["new", "added_to_peerchair", "merged_into_existing", "archived", "ignored", "filed"]

export async function GET(request) {
  const sb = serverClient()
  const url = new URL(request.url)
  const status = url.searchParams.get("status") || "new"
  const disposition = url.searchParams.get("disposition")  // 'file' | 'ignore' — sub-filter of the Filed tab
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500)

  let q = sb.from("unmatched_communications")
    .select("id, direction, from_address, from_name, subject, body_preview, occurred_at, status, seen_at, merged_into_person_id, resulted_in_person_id, filed_by_rule_id, filed_label, filed_disposition, filed_at, unfiled_at")
    .order("occurred_at", { ascending: false })
    .limit(limit)

  if (status !== "all") q = q.eq("status", status)
  if (disposition) q = q.eq("filed_disposition", disposition)

  const { data, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Tallies for the tab badges. Filed splits into org-mail vs system noise so
  // the count on the tab tells you what kind of pile you're looking at.
  const { data: tally, error: tErr } = await sb
    .from("unmatched_communications")
    .select("status, filed_disposition")
  if (tErr) return Response.json({ error: tErr.message }, { status: 500 })

  const counts = {}
  for (const s of ALL_STATUSES) counts[s] = 0
  let filed_org = 0
  let filed_noise = 0
  for (const r of tally || []) {
    counts[r.status] = (counts[r.status] || 0) + 1
    if (r.status === "filed") {
      if (r.filed_disposition === "ignore") filed_noise++
      else filed_org++
    }
  }
  counts.all = (tally || []).length

  // The rules themselves, so the Filed tab can show what's doing the filtering.
  const { data: rules } = await sb
    .from("sender_rules")
    .select("id, pattern, match_type, label, disposition, notes, active")
    .eq("active", true)
    .order("disposition")
    .order("label")

  return Response.json({
    items: data || [],
    counts,
    filed_breakdown: { org: filed_org, noise: filed_noise },
    rules: rules || [],
  })
}
