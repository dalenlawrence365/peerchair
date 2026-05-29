export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/referral-partners — metrics + full list (small population, listable).

export async function GET() {
  const sb = serverClient()

  const STAGES = ["pool", "audience", "active"]
  const counts = {}
  await Promise.all(STAGES.map(async function(stage){
    const { count } = await sb.from("people").select("id", { count: "exact", head: true })
      .contains("roles", ["referral_partner"]).eq("referral_state", stage)
    counts[stage] = count || 0
  }))
  const { count: total } = await sb.from("people").select("id", { count: "exact", head: true }).contains("roles", ["referral_partner"])

  const { data: people } = await sb.from("people")
    .select("id, full_name, first_name, last_name, title, company, email, linkedin_url, referral_state, last_meaningful_touch")
    .contains("roles", ["referral_partner"])
    .order("referral_state", { ascending: true })
    .order("full_name", { ascending: true })
    .limit(500)

  return Response.json({
    total: total || 0,
    counts,
    people: (people || []).map(function(p){
      return {
        id: p.id, name: p.full_name || `${p.first_name||""} ${p.last_name||""}`.trim(),
        title: p.title, company: p.company, email: p.email, linkedin_url: p.linkedin_url,
        state: p.referral_state, last_touch: p.last_meaningful_touch
      }
    })
  })
}
