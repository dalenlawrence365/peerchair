export const dynamic = "force-dynamic"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { corsResponse, handleOptions } from "@/lib/cors"
import { createClient } from "@supabase/supabase-js"
import { getAccessToken } from "@/lib/microsoft-auth"

export async function OPTIONS() { return handleOptions() }

async function addToOutlook({ first_name, last_name, email, company, title, phone }) {
  // Returns { ok: true } on success, { ok: false, reason } on failure.
  // Never throws — callers can ignore the failure and still report PeerChair success.
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

  const { first_name, last_name, email, company, title, phone, contact_type, add_to_outlook } = body

  if (!email || !first_name) {
    return corsResponse({ error: "first_name and email are required" }, { status: 400 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Check if already in PeerChair
  const { data: existing } = await sb.from("contacts").select("id").eq("email", email).maybeSingle()

  // EXISTING CONTACT PATH
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

  // NEW CONTACT PATH
  const { data: newContact, error: pcError } = await sb.from("contacts").insert({
    first_name,
    last_name: last_name || "",
    email,
    company_name: company || null,
    title: title || null,
    phone: phone || null,
    contact_type: contact_type || "CFO_PROSPECT",
    lead_source: "Email Inbox",
    created_at: new Date().toISOString()
  }).select("id").single()

  if (pcError) return corsResponse({ error: "PeerChair insert failed: " + pcError.message }, { status: 500 })

  if (add_to_outlook === false) {
    return corsResponse({
      success: true,
      message: `${first_name} ${last_name || ""} added to PeerChair.`,
      contact_id: newContact.id,
      outlook_added: false
    })
  }

  const outlook = await addToOutlook({ first_name, last_name, email, company, title, phone })
  return corsResponse({
    success: true,
    message: `${first_name} ${last_name || ""} added to PeerChair${outlook.ok ? " and Outlook contacts" : ""}` +
      (outlook.ok ? "." : ` (Outlook add failed: ${outlook.reason}).`),
    contact_id: newContact.id,
    outlook_added: outlook.ok,
    ...(outlook.ok ? {} : { outlook_error: outlook.reason })
  })
}
