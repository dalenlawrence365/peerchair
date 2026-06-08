export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// POST /api/unmatched/[id]/resolve
// Body: { disposition: 'cfo_prospect' | 'sponsor' | 'referral' | 'not_a_fit' | 'delete' }
// For non-delete dispositions, adds the right role to roles array, sets the
// right state, and removes the 'unmatched' status_tag.
// For 'delete', hard-deletes the person and all their FK references.

const DISPOSITIONS = {
  cfo_prospect:    { role_state: "cfo",      new_state: "prospect", roles_add: "cfo" },
  sponsor:         { role_state: "sponsor",  new_state: "pool",     roles_add: "sponsor_contact" },
  referral:        { role_state: "referral", new_state: "audience", roles_add: "referral_partner" },
  not_a_fit:       { add_status_tag: "not_a_fit" },
  delete:          { hard_delete: true },
}

export async function POST(req, { params }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { disposition } = body || {}

  const cfg = DISPOSITIONS[disposition]
  if (!cfg) return Response.json({ error: "Invalid disposition" }, { status: 400 })

  const sb = serverClient()

  // --- Hard delete path ---
  if (cfg.hard_delete) {
    await sb.from("person_action_tags").delete().eq("person_id", id)
    await sb.from("person_status_tags").delete().eq("person_id", id)
    await sb.from("linkedin_connections").delete().eq("peerchair_person_id", id)
    const { error } = await sb.from("people").delete().eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true, action: "deleted" })
  }

  // --- Re-role path (cfo_prospect, sponsor, referral) ---
  if (cfg.role_state) {
    // Set the state (cfo_state / sponsor_state / referral_state)
    const { error: rsErr } = await sb.rpc("set_role_state", {
      p_person_id: id,
      p_role: cfg.role_state,
      p_new_state: cfg.new_state,
      p_set_by: "unmatched_resolver",
    })
    if (rsErr) return Response.json({ error: "set_role_state failed: " + rsErr.message }, { status: 500 })

    // Add the role to the roles array (idempotent)
    const { data: person, error: pErr } = await sb.from("people").select("roles").eq("id", id).single()
    if (pErr) return Response.json({ error: pErr.message }, { status: 500 })
    const newRoles = Array.from(new Set([...(person.roles || []), cfg.roles_add]))
    await sb.from("people").update({ roles: newRoles }).eq("id", id)
  }

  // --- Not a fit path ---
  if (cfg.add_status_tag) {
    await sb.rpc("set_status_tag", {
      p_person_id: id,
      p_tag: cfg.add_status_tag,
      p_set_by: "unmatched_resolver",
    })
  }

  // Always remove the 'unmatched' tag for non-delete paths
  await sb.rpc("remove_status_tag", {
    p_person_id: id,
    p_tag: "unmatched",
    p_removed_by: "unmatched_resolver",
  })

  return Response.json({ ok: true, action: disposition })
}
