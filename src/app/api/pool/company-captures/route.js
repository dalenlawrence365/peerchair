export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/pool/company-captures — recent LinkedHelper company-scrape captures
// for the in-app viewer. Read-only; the capture WRITE path is the LinkedHelper
// webhook at /api/linkedhelper-webhook?event=company.
export async function GET(request) {
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500)
  const sb = serverClient()
  const { data, error } = await sb.from("linkedhelper_company_captures")
    .select("id, received_at, event_type, company_name, company_linkedin_url, website, industry, company_size, location, raw, processed")
    .order("received_at", { ascending: false }).limit(limit)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ count: (data || []).length, captures: data || [] })
}
