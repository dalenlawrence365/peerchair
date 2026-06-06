export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

const PATCH_FIELDS = new Set([
  "title", "notes", "person_id", "company_id", "action_type", "scheduled_for", "completed_at",
])

// PATCH /api/todos/[id]
export async function PATCH(request, { params }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const patch = {}
  for (const k of Object.keys(body)) {
    if (PATCH_FIELDS.has(k)) patch[k] = body[k]
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No allowed fields in body" }, { status: 400 })
  }
  patch.updated_at = new Date().toISOString()

  const sb = serverClient()
  const { data, error } = await sb.from("todos").update(patch).eq("id", id).select().maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: "Todo not found" }, { status: 404 })

  return Response.json({ todo: data })
}

// DELETE /api/todos/[id]
export async function DELETE(_request, { params }) {
  const { id } = await params
  const sb = serverClient()
  const { error } = await sb.from("todos").delete().eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
