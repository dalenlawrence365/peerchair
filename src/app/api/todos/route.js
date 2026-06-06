export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

const CREATE_FIELDS = new Set([
  "title", "notes", "person_id", "company_id", "action_type", "scheduled_for",
])

// GET /api/todos?scope=<open|today|week|completed|all>&person_id=...&company_id=...
//
// Default scope = open. Returns up to 500 rows.
export async function GET(request) {
  const url = new URL(request.url)
  const scope = url.searchParams.get("scope") || "open"
  const personId = url.searchParams.get("person_id")
  const companyId = url.searchParams.get("company_id")

  const sb = serverClient()

  let q = sb.from("todos").select(`
    id, title, notes, person_id, company_id, action_type,
    scheduled_for, completed_at, created_at, updated_at,
    person:people!todos_person_id_fkey(id, full_name, first_name, last_name, avatar_url),
    company:companies!todos_company_id_fkey(id, name)
  `).limit(500)

  if (personId)  q = q.eq("person_id", personId)
  if (companyId) q = q.eq("company_id", companyId)

  const today = new Date().toISOString().slice(0, 10)
  const weekOut = new Date(); weekOut.setDate(weekOut.getDate() + 7)
  const weekOutStr = weekOut.toISOString().slice(0, 10)

  if (scope === "open") {
    q = q.is("completed_at", null).order("scheduled_for", { ascending: true, nullsFirst: false })
  } else if (scope === "today") {
    q = q.is("completed_at", null).lte("scheduled_for", today).order("scheduled_for", { ascending: true })
  } else if (scope === "week") {
    q = q.is("completed_at", null).gte("scheduled_for", today).lte("scheduled_for", weekOutStr).order("scheduled_for", { ascending: true })
  } else if (scope === "completed") {
    q = q.not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(100)
  } else if (scope === "all") {
    q = q.order("created_at", { ascending: false })
  }

  const { data, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ todos: data || [] })
}

// POST /api/todos
// Body: { title (required), notes, person_id, company_id, action_type, scheduled_for }
export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  if (!body.title || !body.title.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 })
  }
  const payload = {}
  for (const k of Object.keys(body)) {
    if (CREATE_FIELDS.has(k)) payload[k] = body[k]
  }
  payload.title = payload.title.trim()

  const sb = serverClient()
  const { data, error } = await sb.from("todos").insert(payload).select().maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ todo: data }, { status: 201 })
}
