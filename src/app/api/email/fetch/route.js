import { getAccessToken } from "@/lib/microsoft-auth"
import { createClient }   from "@supabase/supabase-js"

export async function GET() {
  let token
  try { token = await getAccessToken() }
  catch(e) { return Response.json({ error:e.message, needs_auth:true }, {status:401}) }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  // Load contacts with emails
  const { data:contacts } = await sb.from("contacts").select("id,first_name,last_name,company_name,email,pipeline_stage").not("email","is",null).limit(1000)
  const byEmail = {}
  ;(contacts||[]).forEach(c=>{ if(c.email) byEmail[c.email.toLowerCase()]=c })

  if (!Object.keys(byEmail).length) return Response.json({ emails:[], total:0, synced:0 })

  const headers = { "Authorization":"Bearer "+token }

  // Fetch inbox + sent
  const [inboxRes, sentRes] = await Promise.all([
    fetch("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=100&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,body,from,toRecipients,receivedDateTime,isRead,conversationId", {headers}),
    fetch("https://graph.microsoft.com/v1.0/me/mailFolders/sentItems/messages?$top=100&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,body,from,toRecipients,receivedDateTime,conversationId", {headers})
  ])

  const inbox = ((await inboxRes.json()).value||[]).map(m=>({...m,direction:"inbound"}))
  const sent  = ((await sentRes.json()).value||[]).map(m=>({...m,direction:"outbound"}))

  // Match to contacts
  const matched = []
  for (const msg of [...inbox,...sent]) {
    const fromEmail = (msg.from?.emailAddress?.address||"").toLowerCase()
    const toEmails  = (msg.toRecipients||[]).map(r=>(r.emailAddress?.address||"").toLowerCase())
    let contact = byEmail[fromEmail]
    if (!contact) for (const e of toEmails) if (byEmail[e]) { contact=byEmail[e]; break }
    if (!contact) continue

    const bodyText = msg.body?.content || ""
    const cleanBody = bodyText.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,5000)

    matched.push({
      message_id:   msg.id,
      contact_id:   contact.id,
      direction:    msg.direction === "inbound" ? "IN" : "OUT",
      subject:      msg.subject || "",
      body:         cleanBody,
      body_preview: msg.bodyPreview || "",
      from_address: fromEmail,
      to_address:   (msg.toRecipients||[]).map(r=>r.emailAddress?.address||"").join(", "),
      sent_at:      msg.receivedDateTime,
      is_read:      msg.isRead || false,
      thread_id:    msg.conversationId || msg.id,
      contact,
    })
  }

  matched.sort((a,b)=>new Date(b.sent_at)-new Date(a.sent_at))

  // Upsert into email_messages
  let synced = 0
  if (matched.length > 0) {
    const rows = matched.map(m=>({
      message_id:  m.message_id,
      contact_id:  m.contact_id,
      direction:   m.direction,
      subject:     m.subject,
      body:        m.body,
      body_preview:m.body_preview,
      from_address:m.from_address,
      to_address:  m.to_address,
      sent_at:     m.sent_at,
      is_read:     m.is_read,
      thread_id:   m.thread_id,
    }))
    const { error } = await sb.from("email_messages").upsert(rows, { onConflict:"message_id", ignoreDuplicates:true })
    if (!error) synced = rows.length

    // Also write to communications (for timeline visibility) — skip if already logged
    for (const m of matched) {
      const { data:existing } = await sb.from("communications")
        .select("id").eq("contact_id", m.contact_id)
        .ilike("body", m.body_preview.slice(0,50)+"%")
        .eq("channel","email").limit(1)
      if (existing && existing.length > 0) continue

      await sb.from("communications").insert({
        contact_id:  m.contact_id,
        occurred_at: m.sent_at,
        channel:     "email",
        direction:   m.direction === "IN" ? "inbound" : "outbound",
        step_label:  m.subject || "Email",
        body:        m.body_preview || m.subject,
        source:      "Outlook",
        logged_by:   m.direction === "OUT" ? "Dalen Lawrence" : "system",
        send_status: m.direction === "OUT" ? "confirmed" : null,
      })
    }
  }

  return Response.json({
    emails:  matched.map(m=>({ id:m.message_id, subject:m.subject, preview:m.body_preview, direction:m.direction==="IN"?"inbound":"outbound", received_at:m.sent_at, is_read:m.is_read, from_email:m.from_address, contact:{id:m.contact.id,name:m.contact.first_name+" "+m.contact.last_name,company:m.contact.company_name,stage:m.contact.pipeline_stage,email:m.contact.email} })),
    total:   matched.length,
    synced,
    generated_at: new Date().toISOString()
  })
}
