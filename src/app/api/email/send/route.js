import { getAccessToken } from "@/lib/microsoft-auth"
import { createClient }   from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

export async function POST(request) {
  const { to, subject, html, text, contact_id } = await request.json()
  if (!to || !subject || (!html && !text)) return Response.json({ error:"Missing to, subject, or body" },{status:400})
  let token
  try { token = await getAccessToken() }
  catch(e) { return Response.json({ error:e.message, needs_auth:true },{status:401}) }

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method:"POST", headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body: JSON.stringify({ message:{ subject, body:{contentType:html?"HTML":"Text",content:html||text}, toRecipients:[{emailAddress:{address:to}}] }, saveToSentItems:true })
  })
  if (!res.ok) return Response.json({ error:"Send failed: "+await res.text() },{status:500})

  if (contact_id) {
    const sb = serverClient()
    await sb.from("communications").insert({contact_id,occurred_at:new Date().toISOString(),channel:"email",direction:"outbound",step_label:"Email Sent",body:text||subject,source:"PeerChair",logged_by:"Dalen Lawrence",send_status:"confirmed"})
  }
  return Response.json({ success:true })
}
