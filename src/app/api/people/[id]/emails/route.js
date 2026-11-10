export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* A person can have several email addresses (work, personal, an old employer).
   person_emails holds them all and is what inbound mail is matched against;
   people.email is the ONE address outbound mail goes to.

   POST  { email, label? }        add an address to this person
   PATCH { email }                make an existing address the primary (what we send to)

   Never moves an address that already belongs to someone else: that is a duplicate
   person, and the fix is a merge, not a silent steal. */

const RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request, { params }) {
  const { id } = await params
  let b = {}
  try { b = await request.json() } catch (e) { return Response.json({ error: "bad_request" }, { status: 400 }) }
  const email = String(b.email || "").trim().toLowerCase()
  const label = String(b.label || "").trim().slice(0, 40) || null
  if (!RE.test(email)) return Response.json({ error: "invalid_email" }, { status: 400 })

  const sb = serverClient()
  const { data: p } = await sb.from("people").select("id, email").eq("id", id).maybeSingle()
  if (!p) return Response.json({ error: "not_found" }, { status: 404 })

  const { data: ex } = await sb.from("person_emails").select("person_id").eq("email", email).maybeSingle()
  if (ex) {
    if (ex.person_id === id) return Response.json({ ok: true, already: true })
    const { data: other } = await sb.from("people").select("id, full_name, company").eq("id", ex.person_id).maybeSingle()
    return Response.json({ error: "belongs_to_other", other: other || { id: ex.person_id } }, { status: 409 })
  }

  const isPrimary = !p.email
  const { error } = await sb.from("person_emails").insert({ person_id: id, email, label, is_primary: isPrimary, source: "manual" })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (isPrimary) await sb.from("people").update({ email }).eq("id", id)
  return Response.json({ ok: true })
}

export async function PATCH(request, { params }) {
  const { id } = await params
  let b = {}
  try { b = await request.json() } catch (e) { return Response.json({ error: "bad_request" }, { status: 400 }) }
  const email = String(b.email || "").trim().toLowerCase()
  const sb = serverClient()
  const { data: row } = await sb.from("person_emails").select("id").eq("person_id", id).eq("email", email).maybeSingle()
  if (!row) return Response.json({ error: "not_on_person" }, { status: 404 })
  await sb.from("person_emails").update({ is_primary: false }).eq("person_id", id)
  await sb.from("person_emails").update({ is_primary: true }).eq("id", row.id)
  await sb.from("people").update({ email }).eq("id", id)
  return Response.json({ ok: true })
}
