export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/pool/profile-captures — recent LinkedHelper profile-scrape captures
// for the in-app viewer. Read-only; the WRITE path is the LinkedHelper webhook
// at /api/linkedhelper-webhook?event=profile.
export async function GET(request) {
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500)
  const sb = serverClient()
  const { data, error } = await sb.from("linkedhelper_profile_captures")
    .select("id, received_at, full_name, headline, title, company, location, profile_url, connection_degree, industry, campaign, tags, raw, processed")
    .order("received_at", { ascending: false }).limit(limit)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ count: (data || []).length, captures: data || [] })
}
