export const dynamic = "force-dynamic"
export const runtime = "nodejs"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/pipeline?type=cfo|sponsor&stage=<stage>&limit=&offset=&q=
// Funnel counts per stage use head:true (uncapped). The requested stage returns a
// PAGINATED, SEARCHABLE list with an exact list_total — EVERY stage is browsable,
// including big top-of-funnel stages (pool, audience). Mirrors the
// linkedin-connections pagination pattern (limit/offset + {count:'exact'} + ilike search).

const CONFIG = {
  cfo: {
    field: "cfo_state",
    role: "cfo",
    stages: ["pool", "audience", "prospect", "qualified", "member"],
    listable: ["prospect", "qualified", "member"],
  },
  sponsor: {
    field: "sponsor_state",
    role: "sponsor_contact",
    stages: ["pool", "audience", "discovery", "proposal", "active"],
    listable: ["discovery", "proposal", "active"],
  },
}

// roles + connection flags are selected so the list can render the canonical
// PersonBadges pill cluster (1st / ProVisor / Sponsor / CFO / Referral / CFO Circle).
const SEL = "id, full_name, first_name, last_name, title, company, email, linkedin_url, avatar_url, last_meaningful_touch, next_action_date, roles, provisors_member, cfo_circle_member, linkedin_connected"

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

  // Funnel — count per stage (head:true, uncapped)
  const funnel = {}
  await Promise.all(cfg.stages.map(async function(s){
    const { count } = await sb.from("people").select("id", { count: "exact", head: true }).eq(cfg.field, s)
    funnel[s] = count || 0
  }))
  const total = Object.values(funnel).reduce((a, b) => a + b, 0)

  // Paginated + searchable list for the requested stage (every stage is browsable)
  let list = null
  let list_total = 0
  if (stage && cfg.stages.indexOf(stage) >= 0) {
    let query = sb.from("people")
      .select(SEL + ", " + cfg.field, { count: "exact" })
      .eq(cfg.field, stage)
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
        stage: p[cfg.field], last_touch: p.last_meaningful_touch, next_action: p.next_action_date,
      }
    })
  }

  return Response.json({
    type, stage,
    listable: cfg.listable,
    stages: cfg.stages,
    funnel, total,
    list, list_total,
    limit, offset, q: q || "",
  })
}
