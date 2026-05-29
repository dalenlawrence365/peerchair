import { getAccessToken } from "@/lib/microsoft-auth"
import { createClient }   from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}

export async function POST(request) {
  const { to, subject, html, text, contact_id, attachments } = await request.json()
  if (!subject || (!html && !text)) return Response.json({ error:"Missing subject or body" }, {status:400})

  let token
  try { token = await getAccessToken() }
  catch(e) { return Response.json({ error:e.message, needs_auth:true }, {status:401}) }

  // Resolve attachments — fetch base64 for each named file
  const resolvedAttachments = []
  if (attachments && attachments.length > 0) {
    const sb = serverClient()
    for (const att of attachments) {
      let row
      if (att.id) {
        const { data } = await sb.from("files").select("*").eq("id", att.id).single()
        row = data
      } else if (att.name) {
        const { data } = await sb.from("files").select("*").ilike("name","%" + att.name + "%").limit(1)
        row = data?.[0]
      }
      if (!row) continue

      const { data:fileData } = await sb.storage.from("peerchair-files").download(row.storage_path)
      if (!fileData) continue
      const buffer = Buffer.from(await fileData.arrayBuffer())
      resolvedAttachments.push({
        "@odata.type":     "#microsoft.graph.fileAttachment",
        name:              row.filename,
        contentType:       row.mime_type,
        contentBytes:      buffer.toString("base64"),
      })
    }
  }

  const message = {
    subject,
    body: { contentType: html ? "HTML" : "Text", content: html || text },
    ...(to ? { toRecipients:[{ emailAddress:{ address:to } }] } : {}),
    ...(resolvedAttachments.length > 0 ? { attachments: resolvedAttachments } : {})
  }

  const res = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
    method:"POST",
    headers:{ "Authorization":"Bearer "+token, "Content-Type":"application/json" },
    body: JSON.stringify(message)
  })
  if (!res.ok) return Response.json({ error:"Draft failed: "+await res.text() }, {status:500})

  const draft = await res.json()

  if (contact_id) {
    const sb = serverClient()
    await sb.from("communications").insert({
      contact_id, occurred_at:new Date().toISOString(),
      channel:"email", direction:"outbound",
      step_label:"Draft Created — " + subject,
      body: (text||(html||"").replace(/<[^>]*>/g," ").trim()).slice(0,500),
      source:"PeerChair", logged_by:"Dalen Lawrence", send_status:"draft"
    })
  }

  return new Response(JSON.stringify({ success:true, draft_id:draft.id, attachments_added:resolvedAttachments.length }), {
    headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' }
  })
}
