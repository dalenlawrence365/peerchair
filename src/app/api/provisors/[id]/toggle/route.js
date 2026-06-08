export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// POST /api/provisors/[id]/toggle
// Body: { provisors_member: boolean }   — sets the flag explicitly
// or no body                            — flips the current value
//
// Used by the /provisors page (flag/unflag from the row) and any person
// profile that wants a ProVisor toggle in the future.

export async function POST(req, { params }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const sb = serverClient()

  let newValue
  if (typeof body.provisors_member === "boolean") {
    newValue = body.provisors_member
  } else {
    // Toggle from current
    const { data: cur, error: getErr } = await sb
      .from("people").select("provisors_member").eq("id", id).maybeSingle()
    if (getErr) return Response.json({ error: getErr.message }, { status: 500 })
    if (!cur) return Response.json({ error: "Person not found" }, { status: 404 })
    newValue = !cur.provisors_member
  }

  const { error: upErr } = await sb.from("people")
    .update({ provisors_member: newValue, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

  return Response.json({ ok: true, provisors_member: newValue })
}
