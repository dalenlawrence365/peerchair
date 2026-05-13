export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { corsResponse, handleOptions } from "@/lib/cors"
import { verifyGptActionKey } from "@/lib/gpt-auth"

export async function OPTIONS() { return handleOptions() }

// Called by cron OR by GPT after Dalen confirms he sent something
export async function GET(request) {
  // Allow cron (Bearer cfocircle2026) or GPT action key
  const auth = request.headers.get("authorization") || ""
  const isCron = auth === "Bearer cfocircle2026"
  const isGpt = verifyGptActionKey(request)
  if (!isCron && !isGpt) {
    return corsResponse({ error: "Unauthorized" }, { status: 401 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Get token
  const { data: tokenRow } = await sb.from("microsoft_tokens").select("*").eq("id", "dalen").single()
  if (!tokenRow) return corsResponse({ error: "No Microsoft token" }, { status: 401 })

  let accessToken = tokenRow.access_token
  if (new Date(tokenRow.expires_at) < new Date(Date.now() + 60000)) {
    try {
      const r = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.AZURE_CLIENT_ID,
          client_secret: process.env.AZURE_CLIENT_SECRET,
          refresh_token: tokenRow.refresh_token,
          grant_type: "refresh_token",
          scope: "https://graph.microsoft.com/Mail.Read offline_access"
        })
      })
      if (r.ok) { const t = await r.json(); accessToken = t.access_token }
    } catch(e) {}
  }

  // Fetch last 2 hours of sent items
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$filter=sentDateTime ge ${since}&$select=id,subject,sentDateTime,toRecipients,bodyPreview&$orderby=sentDateTime desc&$top=25`,
    { headers: { Authorization: "Bearer " + accessToken } }
  )

  if (!res.ok) return corsResponse({ error: "Outlook fetch failed" }, { status: 500 })

  const { value: messages } = await res.json()
  if (!messages?.length) return corsResponse({ synced: 0, message: "No sent messages in last " + hours + " hours" })

  // Get all recipient emails
  const allEmails = [...new Set(
    messages.flatMap(m => m.toRecipients?.map(r => r.emailAddress?.address?.toLowerCase()) || [])
  )]

  // Match against PeerChair contacts
  const { data: contacts } = await sb.from("contacts").select("id, first_name, last_name, email").in("email", allEmails)
  if (!contacts?.length) return corsResponse({ synced: 0, message: "No known contacts in sent items" })

  const emailToContact = {}
  for (const c of contacts) { if (c.email) emailToContact[c.email.toLowerCase()] = c }

  let synced = 0
  for (const msg of messages) {
    for (const recip of (msg.toRecipients || [])) {
      const email = recip.emailAddress?.address?.toLowerCase()
      const contact = emailToContact[email]
      if (!contact) continue

      // Check if already logged
      const { data: existing } = await sb.from("communications")
        .select("id").eq("contact_id", contact.id)
        .eq("channel", "Email").eq("direction", "OUT")
        .ilike("body", `%${msg.subject}%`)
        .limit(1)

      if (existing?.length) continue

      await sb.from("communications").insert({
        contact_id: contact.id,
        direction: "OUT",
        channel: "Email",
        body: `Subject: ${msg.subject}\n\n${msg.bodyPreview || ""}`,
        occurred_at: msg.sentDateTime,
        step_label: "Sent Email (Outlook)"
      })
      synced++
    }
  }

  return corsResponse({ synced, message: synced > 0 ? `${synced} sent email(s) logged to PeerChair.` : "No new emails to log." })
}
