export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

const ALLOWED_FIELDS = new Set([
  "company_id", "label", "address_line1", "address_line2",
  "city", "state", "zip", "neighborhood", "is_primary", "notes",
])

// POST /api/host-locations
// Body must include company_id; everything else is optional.
export async function POST(request) {
  const body = await request.json().catch(() => ({}))

  if (!body.company_id) {
    return Response.json({ error: "company_id is required" }, { status: 400 })
  }

  const payload = {}
  for (const k of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(k)) payload[k] = body[k]
  }

  const sb = serverClient()
  const { data, error } = await sb
    .from("host_locations")
    .insert(payload)
    .select()
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ location: data }, { status: 201 })
}
