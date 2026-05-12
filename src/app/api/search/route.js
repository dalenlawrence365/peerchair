export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") || "").trim().toLowerCase()
  if (!q || q.length < 2) return Response.json({ contacts: [], companies: [] })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const [{ data: contacts }, { data: companies }] = await Promise.all([
    sb.from("contacts")
      .select("id, first_name, last_name, title, company_name, contact_type, pipeline_stage, email")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8),
    sb.from("companies")
      .select("id, name, sponsor_type, is_sponsor")
      .ilike("name", `%${q}%`)
      .eq("is_sponsor", true)
      .limit(4)
  ])

  return Response.json({
    contacts: (contacts || []).map(c => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`.trim(),
      title: c.title || null,
      company: c.company_name || null,
      type: c.contact_type,
      stage: c.pipeline_stage || null,
    })),
    companies: (companies || []).map(co => ({
      id: co.id,
      name: co.name,
      type: co.sponsor_type || "Sponsor",
    }))
  })
}
