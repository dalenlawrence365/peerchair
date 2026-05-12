export const dynamic = "force-dynamic"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { corsResponse, handleOptions } from "@/lib/cors"
import { createClient } from "@supabase/supabase-js"

export async function OPTIONS() { return handleOptions() }

export async function POST(request) {
  if (!verifyGptActionKey(request)) {
    return corsResponse({ error: "Unauthorized" }, { status: 401 })
  }

  let body
  try { body = await request.json() } catch(e) {
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
  // If already in PeerChair, just add to Outlook if requested
  if (existing) {
    if (add_to_outlook !== false) {
      // Still add to Outlook
      try {
        const { data: tokenRow } = await sb.from("microsoft_tokens").select("access_token, expires_at, refresh_token").eq("id", "dalen").single()
        if (tokenRow) {
          let accessToken = tokenRow.access_token
          const outlookContact = {
            givenName: first_name, surname: last_name || "",
            emailAddresses: [{ address: email, name: (first_name + " " + (last_name||"")).trim() }],
            ...(company ? { companyName: company } : {}),
            ...(title ? { jobTitle: title } : {})
          }
          const oRes = await fetch("https://graph.microsoft.com/v1.0/me/contacts", {
            method: "POST",
            headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
            body: JSON.stringify(outlookContact)
          })
          const outlookOk = oRes.ok
          return corsResponse({
            success: true,
            message: first_name + " " + (last_name||"") + " was already in PeerChair" + (outlookOk ? " and has been added to Outlook contacts." : " but Outlook add failed."),
            contact_id: existing.id,
            outlook_added: outlookOk,
            already_existed: true
          })
        }
      } catch(e) { console.error("Outlook add for existing contact failed:", e.message) }
    }
    return corsResponse({ success: true, message: first_name + " already exists in PeerChair.", contact_id: existing.id, already_existed: true })
  }

  // Add to PeerChair
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

  let outlookAdded = false

  // Optionally add to Outlook contacts
  if (add_to_outlook !== false) {
    try {
      const { data: tokenRow } = await sb.from("microsoft_tokens").select("access_token, expires_at, refresh_token").eq("id", "dalen").single()
      if (tokenRow) {
        let accessToken = tokenRow.access_token
        if (new Date(tokenRow.expires_at) < new Date(Date.now() + 60000)) {
          const r = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: process.env.AZURE_CLIENT_ID, client_secret: process.env.AZURE_CLIENT_SECRET,
              refresh_token: tokenRow.refresh_token, grant_type: "refresh_token",
              scope: "https://graph.microsoft.com/Contacts.ReadWrite offline_access"
            })
          })
          if (r.ok) { const t = await r.json(); accessToken = t.access_token }
        }

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
        outlookAdded = oRes.ok
      }
    } catch(e) { console.error("Outlook contact add failed:", e.message) }
  }

  return corsResponse({
    success: true,
    message: `${first_name} ${last_name || ""} added to PeerChair${outlookAdded ? " and Outlook contacts" : ""}.`,
    contact_id: newContact.id,
    outlook_added: outlookAdded
  })
}
