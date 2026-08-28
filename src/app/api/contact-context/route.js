export const dynamic = "force-dynamic"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"
import { SENDER_CONTEXT } from "@/lib/dalenContext"

// GPT Action contact lookup.
// CHANGED 2026-05-27: migrated from legacy `contacts` table to unified `people`.
// Previously this searched contacts (and the search_contacts_fuzzy RPC, which is
// contacts-based), so anyone added via AddPersonModal / pool import / direct
// people insert (e.g. William Chiem) returned "no match". Now reads people.

// roles[] -> legacy-style contact_type string (kept so the GPT prompt logic,
// which keys off CFO_PROSPECT / SPONSOR_CONTACT / REFERRAL_PARTNER, still works)
function rolesToContactType(roles) {
  if (!Array.isArray(roles)) return null
  if (roles.includes("cfo")) return "CFO_PROSPECT"
  if (roles.includes("sponsor_contact")) return "SPONSOR_CONTACT"
  if (roles.includes("referral_partner")) return "REFERRAL_PARTNER"
  return null
}
// Pick the most-relevant per-role state to expose as pipeline_stage
function rolesToStage(roles, cfo_state, sponsor_state, referral_state) {
  if (!Array.isArray(roles)) return null
  if (roles.includes("cfo")) return cfo_state || null
  if (roles.includes("sponsor_contact")) return sponsor_state || null
  if (roles.includes("referral_partner")) return referral_state || null
  return null
}

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

  const sb = serverClient()

  let contact = null

  // Lookup by ID directly (people)
  if (contactId) {
    const { data } = await sb.from("people").select("*").eq("id", contactId).maybeSingle()
    contact = data
  }

  // Fuzzy name search — inline ILIKE on people (replaces contacts-based RPC)
  if (!contact && name) {
    const safe = name.replace(/[%_]/g, "")
    const { data: matches, error: sErr } = await sb
      .from("people")
      .select("id, first_name, last_name, full_name, title, company, email, roles, cfo_state, sponsor_state, referral_state")
      .or(`full_name.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`)
      .limit(6)

    if (sErr) {
      return Response.json({ status: "no_match", message: `CRM search error: ${sErr.message}` })
    }
    if (!matches || matches.length === 0) {
      return Response.json({
        status: "no_match",
        message: `No contact found matching "${name}". Try a different name or spelling.`
      })
    }

    // Exact full-name match collapses ambiguity
    const exact = matches.filter(m => (m.full_name || "").toLowerCase() === name.toLowerCase())
    const pool = exact.length === 1 ? exact : matches

    if (pool.length > 1) {
      return Response.json({
        status: "multiple_matches",
        message: `Found ${pool.length} possible matches for "${name}". Please clarify which one.`,
        candidates: pool.map(m => ({
          contact_id: m.id,
          name: m.full_name || `${m.first_name || ""} ${m.last_name || ""}`.trim(),
          title: m.title,
          company: m.company,
          email: m.email,
          type: rolesToContactType(m.roles)
        }))
      })
    }

    const { data } = await sb.from("people").select("*").eq("id", pool[0].id).maybeSingle()
    contact = data
  }

  if (!contact) {
    return Response.json({ status: "no_match", message: "Contact not found." })
  }

  // Pull last 20 communications — matched on person_id
  const { data: comms } = await sb
    .from("communications")
    .select("occurred_at, direction, channel, body, step_label, subject, person_id")
    .eq("person_id", contact.id)
    .order("occurred_at", { ascending: false })
    .limit(20)

  const history = (comms || []).reverse().map(m => {
    const dir = (m.direction === "OUT" || m.direction === "outbound") ? "Dalen" : (contact.first_name || "Them")
    const date = m.occurred_at ? new Date(m.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""
    const text = (m.body || m.step_label || "").slice(0, 500)
    return `[${date} — ${dir}]: ${text}`
  })

  // Company info if linked
  let company = null
  if (contact.company_id) {
    const { data: co } = await sb.from("companies").select("name, sponsor_type, host_viable").eq("id", contact.company_id).maybeSingle()
    company = co
  }

  return Response.json({
    status: "single_match",
    contact: {
      contact_id: contact.id,
      name: contact.full_name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
      first_name: contact.first_name,
      title: contact.title || null,
      company: contact.company || company?.name || null,
      email: contact.email || null,
      phone: contact.phone || contact.mobile || null,
      contact_type: rolesToContactType(contact.roles),
      roles: contact.roles || [],
      pipeline_stage: rolesToStage(contact.roles, contact.cfo_state, contact.sponsor_state, contact.referral_state),
      cfo_state: contact.cfo_state || null,
      sponsor_state: contact.sponsor_state || null,
      referral_state: contact.referral_state || null,
      notes: contact.notes || null,
      company_info: company || null,
      communication_history: history,
      history_count: history.length
    },
    sender: SENDER_CONTEXT
  })
  } catch(e) {
    console.error('contact-context error:', e.message, e.stack)
    return Response.json({ status: 'error', error: e.message }, { status: 500 })
  }
}
