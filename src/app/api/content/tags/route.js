export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/content/tags -> full known tag vocabulary (seeded list + any custom
// tags added from a post), alphabetical, for the tag picker's suggestion list.
export async function GET() {
  const sb = serverClient()
  const { data, error } = await sb.from("content_tags").select("name").order("name")
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ tags: (data || []).map(function (r) { return r.name }) })
}
