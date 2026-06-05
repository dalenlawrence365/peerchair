export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// Editable fields. company_id intentionally not editable — to move a
// location to a different firm, delete + recreate.
const ALLOWED_FIELDS = new Set([
  "label", "address_line1", "address_line2",
  "city", "state", "zip", "neighborhood", "is_primary", "notes",
])

// PATCH /api/host-locations/[id]
export async function PATCH(request, { params }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const patch = {}
  for (const k of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(k)) patch[k] = body[k]
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No allowed fields in body" }, { status: 400 })
  }
  patch.updated_at = new Date().toISOString()

  const sb = serverClient()
  const { data, error } = await sb
    .from("host_locations")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: "Location not found" }, { status: 404 })

  return Response.json({ location: data })
}

// DELETE /api/host-locations/[id]
export async function DELETE(_request, { params }) {
  const { id } = await params
  const sb = serverClient()
  const { error } = await sb.from("host_locations").delete().eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
