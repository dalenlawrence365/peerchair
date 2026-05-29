export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/pipeline?type=cfo|sponsor&stage=<stage>
// Always returns the full funnel (count per stage, via count queries — no
// 1000-row cap). Returns a people list ONLY for the small/actionable stages;
// the big top-of-funnel stages (pool, audience) return list:null so the UI
// shows a search bar instead of dumping thousands of rows.

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

export async function GET(request) {
  const url = new URL(request.url)
  const type = url.searchParams.get("type") || "cfo"
  const stage = url.searchParams.get("stage") || ""
  const cfg = CONFIG[type]
  if (!cfg) return Response.json({ error: "invalid type" }, { status: 400 })

  const sb = serverClient()

  // Funnel — count per stage
  const funnel = {}
  await Promise.all(cfg.stages.map(async function(s){
    const { count } = await sb.from("people").select("id", { count: "exact", head: true }).eq(cfg.field, s)
    funnel[s] = count || 0
  }))
  const total = Object.values(funnel).reduce((a, b) => a + b, 0)

  // List only if this stage is small/actionable
  let list = null
  if (stage && cfg.listable.indexOf(stage) >= 0) {
    const { data: people } = await sb.from("people")
      .select("id, full_name, first_name, last_name, title, company, email, linkedin_url, avatar_url, " + cfg.field + ", last_meaningful_touch, next_action_date")
      .eq(cfg.field, stage)
      .order("last_meaningful_touch", { ascending: false, nullsFirst: false })
      .limit(500)
    list = (people || []).map(function(p){
      return {
        id: p.id, name: p.full_name || `${p.first_name||""} ${p.last_name||""}`.trim(),
        title: p.title, company: p.company, email: p.email, linkedin_url: p.linkedin_url,
        avatar_url: p.avatar_url || null,
        stage: p[cfg.field], last_touch: p.last_meaningful_touch, next_action: p.next_action_date,
      }
    })
  }

  return Response.json({
    type, stage,
    listable: cfg.listable,
    stages: cfg.stages,
    funnel, total,
    list,
  })
}
