export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// POST /api/todos/[id]/complete
//
// Marks the todo done. If the todo has both a person_id AND a known action_type,
// also fires the corresponding action_tag on that person via the existing
// set_action_tag Postgres function (which handles supersession centrally).
//
// Idempotent: re-completing a completed todo is a no-op on the tag side.
export async function POST(_request, { params }) {
  const { id } = await params
  const sb = serverClient()

  // Fetch first to know person_id + action_type + idempotency check
  const { data: existing, error: getErr } = await sb
    .from("todos")
    .select("id, person_id, action_type, completed_at, title")
    .eq("id", id)
    .maybeSingle()

  if (getErr) return Response.json({ error: getErr.message }, { status: 500 })
  if (!existing) return Response.json({ error: "Todo not found" }, { status: 404 })

  // If already completed, just return it
  if (existing.completed_at) {
    return Response.json({ todo: existing, fired_tag: null })
  }

  // Mark completed
  const now = new Date().toISOString()
  const { data: todo, error: updErr } = await sb
    .from("todos")
    .update({ completed_at: now, updated_at: now })
    .eq("id", id)
    .select()
    .maybeSingle()

  if (updErr) return Response.json({ error: updErr.message }, { status: 500 })

  // Fire the action_tag if we have person + action_type
  let firedTag = null
  if (existing.person_id && existing.action_type) {
    const { error: tagErr } = await sb.rpc("set_action_tag", {
      p_person_id:  existing.person_id,
      p_action_type: existing.action_type,
      p_as_of_date:  new Date().toISOString().slice(0, 10),
      p_as_of_time:  now,
      p_set_by:      "todos:complete",
      p_notes:       `Completed todo: ${existing.title}`,
    })
    if (!tagErr) firedTag = existing.action_type
  }

  return Response.json({ todo, fired_tag: firedTag })
}
