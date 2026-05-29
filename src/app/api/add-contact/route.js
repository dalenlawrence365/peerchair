export const dynamic = "force-dynamic"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { corsResponse, handleOptions } from "@/lib/cors"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"
import { getAccessToken } from "@/lib/microsoft-auth"

// GPT Action: add a contact (and optionally an Outlook contact).
// CHANGED 2026-05-27: writes to unified `people` table instead of legacy
// `contacts`. Previously GPT-added people landed in contacts only, making
// them invisible to the app's people-based views (and vice-versa). Now a
// single source of truth.

export async function OPTIONS() { return handleOptions() }

// Map GPT's legacy contact_type to the new roles array + the per-role state field
function contactTypeToRole(ct) {
  switch (ct) {
    case "SPONSOR_CONTACT":  return "sponsor_contact"
    case "REFERRAL_PARTNER": return "referral_partner"
    case "CFO_PROSPECT":
    default:                 return "cfo"
  }
}

async function addToOutlook({ first_name, last_name, email, company, title, phone }) {
  try {
    const accessToken = await getAccessToken()
    const outlookContact = {
      givenName: first_name,
      surname: last_name || "",
      emailAddresses: [{ address: email, name: `${first_name} ${last_name || ""}`.trim() }],
      ...(company ? { companyName: company } : {}),
      ...(title ? { jobTitle: title } : {}),
      ...(phone ? { businessPhones: [phone] } : {})
    }
    const oRes = await fetch("https://graph.microsoft.com/v1.0/me/contacts", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify(outlookContact)
    })
    if (!oRes.ok) {
      const errText = await oRes.text().catch(() => "")
      console.error("Outlook contact add failed:", oRes.status, errText)
      return { ok: false, reason: `Graph ${oRes.status}` }
    }
    return { ok: true }
  } catch (e) {
    console.error("Outlook contact add threw:", e.message)
    return { ok: false, reason: e.message }
  }
}

export async function POST(request) {
  if (!verifyGptActionKey(request)) {
    return corsResponse({ error: "Unauthorized" }, { status: 401 })
  }

  let body
  try { body = await request.json() } catch (e) {
    return corsResponse({ error: "Invalid JSON" }, { status: 400 })
  }

  const { first_name, last_name, email, company, title, phone, contact_type, add_to_outlook, stage } = body

  if (!email || !first_name) {
    return corsResponse({ error: "first_name and email are required" }, { status: 400 })
  }

  const sb = serverClient()

  // Dedup against people by email
  const { data: existing } = await sb.from("people").select("id").ilike("email", email).maybeSingle()

  // EXISTING PERSON PATH
  if (existing) {
    if (add_to_outlook === false) {
      return corsResponse({
        success: true,
        message: `${first_name} already exists in PeerChair.`,
        contact_id: existing.id,
        already_existed: true,
        outlook_added: false
      })
    }
    const outlook = await addToOutlook({ first_name, last_name, email, company, title, phone })
    return corsResponse({
      success: true,
      message: `${first_name} ${last_name || ""} was already in PeerChair` +
        (outlook.ok ? " and has been added to Outlook contacts." : ` but Outlook add failed (${outlook.reason}).`),
      contact_id: existing.id,
      outlook_added: outlook.ok,
      ...(outlook.ok ? {} : { outlook_error: outlook.reason }),
      already_existed: true
    })
  }

  // NEW PERSON PATH — default state is 'pool' (safe; advance manually)
  const role = contactTypeToRole(contact_type)
  const safeStage = stage || "pool"
  const insertRow = {
    first_name,
    last_name: last_name || "",
    full_name: `${first_name} ${last_name || ""}`.trim(),
    email,
    company: company || null,
    title: title || null,
    phone: phone || null,
    roles: [role],
    cfo_state:      role === "cfo" ? safeStage : null,
    sponsor_state:  role === "sponsor_contact" ? safeStage : null,
    referral_state: role === "referral_partner" ? safeStage : null,
    source: "gpt-add-from-inbox",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  const { data: newPerson, error: pcError } = await sb.from("people").insert(insertRow).select("id").single()

  if (pcError) return corsResponse({ error: "PeerChair insert failed: " + pcError.message }, { status: 500 })

  if (add_to_outlook === false) {
    return corsResponse({
      success: true,
      message: `${first_name} ${last_name || ""} added to PeerChair.`,
      contact_id: newPerson.id,
      outlook_added: false
    })
  }

  const outlook = await addToOutlook({ first_name, last_name, email, company, title, phone })
  return corsResponse({
    success: true,
    message: `${first_name} ${last_name || ""} added to PeerChair${outlook.ok ? " and Outlook contacts" : ""}` +
      (outlook.ok ? "." : ` (Outlook add failed: ${outlook.reason}).`),
    contact_id: newPerson.id,
    outlook_added: outlook.ok,
    ...(outlook.ok ? {} : { outlook_error: outlook.reason })
  })
}
