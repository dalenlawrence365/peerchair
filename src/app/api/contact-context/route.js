export const dynamic = "force-dynamic"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { createClient } from "@supabase/supabase-js"

export async function GET(request) {
  try {
  if (!verifyGptActionKey(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const name = (searchParams.get("name") || "").trim()
  const contactId = searchParams.get("contact_id") || null

  if (!name && !contactId) {
    return Response.json({ error: "Provide name or contact_id" }, { status: 400 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  let contact = null

  // Lookup by ID directly
  if (contactId) {
    const { data } = await sb.from("contacts").select("*").eq("id", contactId).single()
    contact = data
  }

  // Fuzzy name search
  if (!contact && name) {
    const { data: matches, error: rpcError } = await sb.rpc("search_contacts_fuzzy", {
      search_term: name,
      max_results: 5
    })

    console.log("RPC result:", JSON.stringify({ matches, rpcError }))

    if (rpcError) {
      return Response.json({
        status: "no_match",
        message: `CRM search error: ${rpcError.message}`,
        debug: rpcError
      })
    }

    if (!matches || matches.length === 0) {
      return Response.json({
        status: "no_match",
        message: `No contact found matching "${name}". Try a different name or spelling.`
      })
    }

    // Multiple candidates — let ChatGPT ask the user
    if (matches.length > 1 && matches[0].similarity_score < 0.9) {
      return Response.json({
        status: "multiple_matches",
        message: `Found ${matches.length} possible matches for "${name}". Please clarify which one.`,
        candidates: matches.map(m => ({
          contact_id: m.id,
          name: m.full_name,
          title: m.title,
          company: m.company_name,
          email: m.email,
          type: m.contact_type
        }))
      })
    }

    // Single confident match — fetch full record
    const { data } = await sb.from("contacts").select("*").eq("id", matches[0].id).single()
    contact = data
  }

  if (!contact) {
    return Response.json({ status: "no_match", message: "Contact not found." })
  }

  // Pull last 20 communications
  const { data: comms } = await sb
    .from("communications")
    .select("occurred_at, direction, channel, body, step_label, subject")
    .eq("contact_id", contact.id)
    .order("occurred_at", { ascending: false })
    .limit(20)

  // Format history for ChatGPT
  const history = (comms || []).reverse().map(m => {
    const dir = (m.direction === "OUT" || m.direction === "outbound") ? "Dalen" : contact.first_name
    const date = m.occurred_at ? new Date(m.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""
    const text = (m.body || m.step_label || "").slice(0, 500)
    return `[${date} — ${dir}]: ${text}`
  })

  // Get company info if sponsor
  let company = null
  if (contact.company_id) {
    const { data: co } = await sb.from("companies").select("name, sponsor_type, host_viable, neighborhood_la").eq("id", contact.company_id).single()
    company = co
  }

  return Response.json({
    status: "single_match",
    contact: {
      contact_id: contact.id,
      name: `${contact.first_name} ${contact.last_name}`.trim(),
      first_name: contact.first_name,
      title: contact.title || null,
      company: contact.company_name || company?.name || null,
      email: contact.email || null,
      phone: contact.phone || contact.mobile || null,
      contact_type: contact.contact_type,
      pipeline_stage: contact.pipeline_stage || null,
      lead_source: contact.lead_source || null,
      relationship_strength: contact.relationship_strength || null,
      how_we_met: contact.how_we_met || null,
      notes: contact.personal_notes || null,
      company_info: company || null,
      communication_history: history,
      history_count: history.length
    },
    sender: {
      name: "Dalen Lawrence",
      title: "Chapter Director, CFO Circle Los Angeles",
      email: "dalen.lawrence@cfo-circle.com",
      calendly_fit: "https://calendly.com/cfocirclela/cfo-circle-fit-chat",
      calendly_sponsor: "https://calendly.com/cfocirclela/cfo-circle-sponsor-discovery-call"
    }
  })
  } catch(e) {
    console.error('contact-context error:', e.message, e.stack)
    return Response.json({ status: 'error', error: e.message }, { status: 500 })
  }
}
