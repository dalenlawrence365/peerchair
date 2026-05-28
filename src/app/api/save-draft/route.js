export const dynamic = "force-dynamic"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { corsResponse, handleOptions } from "@/lib/cors"
import { createClient } from "@supabase/supabase-js"
import { getAccessToken } from "@/lib/microsoft-auth"

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024 // 3MB

export async function OPTIONS() { return handleOptions() }

export async function POST(request) {
  if (!verifyGptActionKey(request)) {
    return corsResponse({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { contact_id, subject, body: emailBody, attachment_name } = body

  if (!contact_id || !subject || !emailBody) {
    return corsResponse({ error: "contact_id, subject, and body are required" }, { status: 400 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Resolve person (people, not legacy contacts)
  const { data: contact } = await sb.from("people").select("id, first_name, last_name, email").eq("id", contact_id).maybeSingle()
  if (!contact || !contact.email) {
    return corsResponse({ error: "Contact not found or has no email address" }, { status: 404 })
  }

  // Get Microsoft access token (helper handles fetch + refresh + persist)
  let accessToken
  try {
    accessToken = await getAccessToken()
  } catch (e) {
    return corsResponse({ error: e.message }, { status: 401 })
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
    return corsResponse({ error: "Outlook draft failed: " + err }, { status: 500 })
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

  return corsResponse({
    success: true,
    message: `Draft saved to Outlook for ${contact.first_name} ${contact.last_name} (${contact.email}).${attachmentNote ? " Note: " + attachmentNote : ""} Open Outlook to review and send.`,
    draft_id: draft.id,
    to: contact.email,
    subject,
    attachment_included: attachments.length > 0,
    attachment_note: attachmentNote || null
  })
}
