// POST /api/email/draft
// Creates a draft email in Outlook via Microsoft Graph
// Body: { to, subject, html, text, contact_id }

import { getAccessToken } from "@/lib/microsoft-auth"
import { createClient }   from "@supabase/supabase-js"

export async function POST(request) {
  const { to, subject, html, text, contact_id } = await request.json()
  if (!subject || (!html && !text)) return Response.json({ error:"Missing subject or body" }, {status:400})

  let token
  try { token = await getAccessToken() }
  catch(e) { return Response.json({ error:e.message, needs_auth:true }, {status:401}) }

  // Create draft via Graph API
  const message = {
    subject,
    body: { contentType: html ? "HTML" : "Text", content: html || text },
    ...(to ? { toRecipients: [{ emailAddress: { address: to } }] } : {})
  }

  const res = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
    method:  "POST",
    headers: { "Authorization":"Bearer "+token, "Content-Type":"application/json" },
    body:    JSON.stringify(message)
  })

  if (!res.ok) {
    const err = await res.text()
    return Response.json({ error:"Draft creation failed: "+err }, {status:500})
  }

  const draft = await res.json()

  // Log to communications
  if (contact_id) {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    await sb.from("communications").insert({
      contact_id,
      occurred_at: new Date().toISOString(),
      channel:     "email",
      direction:   "outbound",
      step_label:  "Draft Created — " + subject,
      body:        text || (html||"").replace(/<[^>]*>/g," ").trim().slice(0,500),
      source:      "PeerChair",
      logged_by:   "Dalen Lawrence",
      send_status: "draft"
    })
  }

  return Response.json({ success:true, draft_id:draft.id, web_link:draft.webLink })
}
