export const dynamic = "force-dynamic"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { createClient } from "@supabase/supabase-js"

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024 // 3MB

export async function POST(request) {
  if (!verifyGptActionKey(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { contact_id, subject, body: emailBody, attachment_name } = body

  if (!contact_id || !subject || !emailBody) {
    return Response.json({ error: "contact_id, subject, and body are required" }, { status: 400 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Resolve contact
  const { data: contact } = await sb.from("contacts").select("id, first_name, last_name, email").eq("id", contact_id).single()
  if (!contact || !contact.email) {
    return Response.json({ error: "Contact not found or has no email address" }, { status: 404 })
  }

  // Get Microsoft token
  const { data: tokenRow } = await sb.from("microsoft_tokens").select("*").eq("id", "dalen").single()
  if (!tokenRow) {
    return Response.json({ error: "Microsoft token not found. Visit peerchair.com/api/auth/microsoft to reconnect." }, { status: 401 })
  }

  // Refresh token if expired
  let accessToken = tokenRow.access_token
  if (new Date(tokenRow.expires_at) < new Date(Date.now() + 60000)) {
    try {
      const refreshRes = await fetch(
        `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.AZURE_CLIENT_ID,
            client_secret: process.env.AZURE_CLIENT_SECRET,
            refresh_token: tokenRow.refresh_token,
            grant_type: "refresh_token",
            scope: "https://graph.microsoft.com/Mail.ReadWrite offline_access"
          })
        }
      )
      if (refreshRes.ok) {
        const tokens = await refreshRes.json()
        accessToken = tokens.access_token
        await sb.from("microsoft_tokens").upsert({
          id: "dalen",
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || tokenRow.refresh_token,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
      }
    } catch(e) {
      console.error("Token refresh failed:", e.message)
    }
  }

  // Resolve attachment if requested
  const attachments = []
  let attachmentNote = null

  if (attachment_name) {
    try {
      const { data: fileRow } = await sb
        .from("files")
        .select("*")
        .ilike("name", "%" + attachment_name + "%")
        .limit(1)
        .single()

      if (fileRow) {
        const { data: fileData } = await sb.storage.from("peerchair-files").download(fileRow.storage_path)
        if (fileData) {
          const arrayBuf = await fileData.arrayBuffer()
          if (arrayBuf.byteLength <= MAX_ATTACHMENT_BYTES) {
            const base64 = Buffer.from(arrayBuf).toString("base64")
            attachments.push({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: fileRow.filename || fileRow.name,
              contentType: fileRow.mime_type || "application/pdf",
              contentBytes: base64
            })
          } else {
            attachmentNote = `Attachment "${attachment_name}" is over 3MB and was skipped. Attach it manually in Outlook.`
          }
        }
      } else {
        attachmentNote = `No file matching "${attachment_name}" found in PeerChair Files.`
      }
    } catch(e) {
      attachmentNote = `Could not load attachment: ${e.message}`
    }
  }

  // Create Outlook draft
  const message = {
    subject,
    body: { contentType: "Text", content: emailBody },
    toRecipients: [{ emailAddress: { address: contact.email, name: `${contact.first_name} ${contact.last_name}` } }],
    ...(attachments.length > 0 ? { attachments } : {})
  }

  const draftRes = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(message)
  })

  if (!draftRes.ok) {
    const err = await draftRes.text()
    return Response.json({ error: "Outlook draft failed: " + err }, { status: 500 })
  }

  const draft = await draftRes.json()

  // Log to communications
  await sb.from("communications").insert({
    contact_id: contact.id,
    direction: "OUT",
    channel: "Email",
    body: `Subject: ${subject}\n\n${emailBody}`,
    status: "draft",
    occurred_at: new Date().toISOString(),
    step_label: "Email Draft (ChatGPT)"
  })

  return Response.json({
    success: true,
    message: `Draft saved to Outlook for ${contact.first_name} ${contact.last_name} (${contact.email}).${attachmentNote ? " Note: " + attachmentNote : ""} Open Outlook to review and send.`,
    draft_id: draft.id,
    to: contact.email,
    subject,
    attachment_included: attachments.length > 0,
    attachment_note: attachmentNote || null
  })
}
