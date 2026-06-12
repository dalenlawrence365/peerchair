export const dynamic = "force-dynamic"
export const runtime = "nodejs"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/pipeline?type=cfo|sponsor&stage=<stage>&limit=&offset=&q=
//
// NESTED / CUMULATIVE model — stages are NOT mutually exclusive:
//   pool      = the entire role universe (everyone with the role). Never shrinks; the denominator.
//   audience  = DERIVED from linkedin_connected (first-degree). NOT a stored stage, so a connected
//               CFO stays in the audience no matter how far they advance.
//   engagement (prospect ⊇ qualified ⊇ member, or discovery ⊇ proposal ⊇ active) = cumulative
//               progress markers. A member is still qualified, prospect, audience, and pool.

const CONFIG = {
  cfo: {
    role: "cfo",
    stateField: "cfo_state",
    stages: ["pool", "audience", "prospect", "qualified", "member"],
    engagement: ["prospect", "qualified", "member"],
  },
  sponsor: {
    role: "sponsor_contact",
    stateField: "sponsor_state",
    stages: ["pool", "audience", "discovery", "proposal", "active"],
    engagement: ["discovery", "proposal", "active"],
  },
}

const SEL = "id, full_name, first_name, last_name, title, company, email, linkedin_url, avatar_url, last_meaningful_touch, next_action_date, roles, provisors_member, cfo_circle_member, linkedin_connected, cfo_state, sponsor_state"

// Apply a stage predicate to a query already scoped to the role.
function applyStage(query, cfg, stage) {
  if (stage === "audience") return query.eq("linkedin_connected", true)
  const ei = cfg.engagement.indexOf(stage)
  if (ei >= 0) return query.in(cfg.stateField, cfg.engagement.slice(ei))  // cumulative
  return query  // pool = role universe, no extra filter
}

export async function GET(request) {
  const url = new URL(request.url)
  const type = url.searchParams.get("type") || "cfo"
  const stage = url.searchParams.get("stage") || ""
  const q = url.searchParams.get("q")
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500)
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0)
  const cfg = CONFIG[type]
  if (!cfg) return Response.json({ error: "invalid type" }, { status: 400 })

  const sb = serverClient()

  // Funnel — cumulative counts per stage (head:true, uncapped)
  const funnel = {}
  await Promise.all(cfg.stages.map(async function(s){
    let cq = sb.from("people").select("id", { count: "exact", head: true }).contains("roles", [cfg.role])
    cq = applyStage(cq, cfg, s)
    const { count } = await cq
    funnel[s] = count || 0
  }))
  const total = funnel.pool || 0  // the universe is the denominator

  // Paginated + searchable list for the requested stage
  let list = null
  let list_total = 0
  if (stage && cfg.stages.indexOf(stage) >= 0) {
    let query = sb.from("people").select(SEL, { count: "exact" }).contains("roles", [cfg.role])
    query = applyStage(query, cfg, stage)
    if (q) query = query.or(`full_name.ilike.%${q}%,company.ilike.%${q}%,title.ilike.%${q}%`)
    query = query
      .order("last_meaningful_touch", { ascending: false, nullsFirst: false })
      .order("full_name", { ascending: true })
      .range(offset, offset + limit - 1)
    const { data: people, count } = await query
    list_total = count || 0
    list = (people || []).map(function(p){
      return {
        id: p.id, name: p.full_name || `${p.first_name||""} ${p.last_name||""}`.trim(),
        title: p.title, company: p.company, email: p.email, linkedin_url: p.linkedin_url,
        avatar_url: p.avatar_url || null,
        roles: p.roles || [],
        provisors_member: p.provisors_member === true,
        cfo_circle_member: p.cfo_circle_member === true,
        linkedin_connected: p.linkedin_connected === true,
        stage: p[cfg.stateField], last_touch: p.last_meaningful_touch, next_action: p.next_action_date,
      }
    })

    // Silent = connected CFO with no reply_received and not excluded — same definition as the dashboard funnel.
    if (type === "cfo" && list.length) {
      const ids = list.map(function(r){ return r.id })
      const [replyRes, exclRes] = await Promise.all([
        sb.from("person_action_tags").select("person_id").eq("action_type", "reply_received").in("person_id", ids),
        sb.from("person_status_tags").select("person_id").is("removed_at", null).in("tag", ["do_not_contact", "opted_out", "not_a_fit"]).in("person_id", ids),
      ])
      const replied = new Set((replyRes.data || []).map(function(t){ return t.person_id }))
      const excluded = new Set((exclRes.data || []).map(function(t){ return t.person_id }))
      list = list.map(function(r){
        return Object.assign({}, r, { silent: r.linkedin_connected === true && !replied.has(r.id) && !excluded.has(r.id) })
      })
    }
  }

  return Response.json({
    type, stage,
    stages: cfg.stages,
    funnel, total,
    list, list_total,
    limit, offset, q: q || "",
  })
}
