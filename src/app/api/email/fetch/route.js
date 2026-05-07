import { getAccessToken } from "@/lib/microsoft-auth"
import { createClient }   from "@supabase/supabase-js"

export async function GET() {
  let token
  try { token = await getAccessToken() }
  catch(e) { return Response.json({ error:e.message, needs_auth:true },{status:401}) }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data:contacts } = await sb.from("contacts").select("id,first_name,last_name,company_name,email,pipeline_stage").not("email","is",null).limit(1000)
  const byEmail = {}
  ;(contacts||[]).forEach(c=>{ if(c.email) byEmail[c.email.toLowerCase()]=c })
  if (!Object.keys(byEmail).length) return Response.json({ emails:[], total:0 })

  const [inboxRes, sentRes] = await Promise.all([
    fetch("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=100&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,from,toRecipients,receivedDateTime,isRead",{headers:{"Authorization":"Bearer "+token}}),
    fetch("https://graph.microsoft.com/v1.0/me/mailFolders/sentItems/messages?$top=100&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,from,toRecipients,receivedDateTime",{headers:{"Authorization":"Bearer "+token}})
  ])
  const inbox = ((await inboxRes.json()).value||[]).map(m=>({...m,direction:"inbound"}))
  const sent  = ((await sentRes.json()).value||[]).map(m=>({...m,direction:"outbound"}))

  const matched = []
  for (const msg of [...inbox,...sent]) {
    const fromEmail = (msg.from?.emailAddress?.address||"").toLowerCase()
    const toEmails  = (msg.toRecipients||[]).map(r=>(r.emailAddress?.address||"").toLowerCase())
    let contact = byEmail[fromEmail]
    if (!contact) for (const e of toEmails) if (byEmail[e]) { contact=byEmail[e]; break }
    if (contact) matched.push({
      id:msg.id, subject:msg.subject, preview:msg.bodyPreview,
      direction:msg.direction, received_at:msg.receivedDateTime, is_read:msg.isRead,
      from_email:fromEmail,
      contact:{id:contact.id,name:contact.first_name+" "+contact.last_name,company:contact.company_name,stage:contact.pipeline_stage,email:contact.email}
    })
  }
  matched.sort((a,b)=>new Date(b.received_at)-new Date(a.received_at))
  return Response.json({ emails:matched, total:matched.length, generated_at:new Date().toISOString() })
}
