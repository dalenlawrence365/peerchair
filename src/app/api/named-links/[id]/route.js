export const dynamic = "force-dynamic"

import { serverClient } from "@/lib/supabaseServer"

// PATCH /api/named-links/[id]  { label?, url?, notes?, active? } -> { link }
// DELETE /api/named-links/[id]                                   -> { ok }

export async function PATCH(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })
  let b
  try { b = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }

  const patch = { updated_at: new Date().toISOString() }
  if (typeof b.label === "string") {
    const label = b.label.trim()
    if (!label) return Response.json({ error: "label cannot be blank" }, { status: 400 })
    patch.label = label
  }
  if (typeof b.url === "string") {
    const url = b.url.trim()
    if (!/^https?:\/\//i.test(url)) return Response.json({ error: "url must start with http:// or https://" }, { status: 400 })
    patch.url = url
  }
  if (typeof b.use_for === "string") {
    const useFor = b.use_for.trim()
    if (!useFor) return Response.json({ error: "use_for cannot be blank" }, { status: 400 })
    patch.use_for = useFor
  }
  if (typeof b.active === "boolean") patch.active = b.active

  const sb = serverClient()
  const { data, error } = await sb.from("named_links")
    .update(patch).eq("id", id).select().maybeSingle()
  if (error) {
    const msg = error.code === "23505" ? "A link with that label already exists." : error.message
    return Response.json({ error: msg }, { status: error.code === "23505" ? 409 : 500 })
  }
  if (!data) return Response.json({ error: "not found" }, { status: 404 })
  return Response.json({ link: data })
}

export async function DELETE(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })
  const sb = serverClient()
  const { error } = await sb.from("named_links").delete().eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
