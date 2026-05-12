export const dynamic = "force-dynamic"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { corsResponse, handleOptions } from "@/lib/cors"
import { createClient } from "@supabase/supabase-js"

// Team members always surfaced regardless of PeerChair presence
const TEAM_EMAILS = [
  "paul@cfo-circle.com",
  "paul.wirth@cfo-circle.com",
  "dalen.lawrence@cfo-circle.com",
  "dalen@cfo-circle.com"
]

export async function OPTIONS() { return handleOptions() }

export async function GET(request) {
  if (!verifyGptActionKey(request)) {
    return corsResponse({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const hours = parseInt(searchParams.get("hours") || "24")

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Get Microsoft token
  const { data: tokenRow } = await sb.from("microsoft_tokens").select("*").eq("id", "dalen").single()
  if (!tokenRow) return corsResponse({ error: "Microsoft token not found. Visit peerchair.com/api/auth/microsoft." }, { status: 401 })

  // Refresh if needed
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
      if (r.ok) {
        const t = await r.json()
        accessToken = t.access_token
        await sb.from("microsoft_tokens").upsert({
          id: "dalen", access_token: t.access_token,
          refresh_token: t.refresh_token || tokenRow.refresh_token,
          expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
      }
    } catch(e) { console.error("Token refresh failed:", e.message) }
  }

  // Fetch recent inbox messages from Outlook
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  const msgRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${since}&$select=id,subject,receivedDateTime,from,isRead,bodyPreview&$orderby=receivedDateTime desc&$top=50`,
    { headers: { Authorization: "Bearer " + accessToken } }
  )

  if (!msgRes.ok) {
    const err = await msgRes.text()
    return corsResponse({ error: "Outlook fetch failed: " + err }, { status: 500 })
  }

  const msgData = await msgRes.json()
  const messages = msgData.value || []

  if (messages.length === 0) {
    return corsResponse({ summary: "No messages in the last " + hours + " hours.", known: [], team: [], unknown: [], other_count: 0 })
  }

  // Get unique sender emails
  const senderEmails = [...new Set(messages.map(m => m.from?.emailAddress?.address?.toLowerCase()).filter(Boolean))]

  // Look up which senders are in PeerChair
  const { data: knownContacts } = await sb
    .from("contacts")
    .select("id, first_name, last_name, email, contact_type, pipeline_stage, company_name")
    .in("email", senderEmails)

  const knownEmailMap = {}
  for (const c of (knownContacts || [])) {
    if (c.email) knownEmailMap[c.email.toLowerCase()] = c
  }

  // Categorize messages
  const known = []
  const team = []
  const unknown = []
  let other_count = 0

  for (const msg of messages) {
    const email = msg.from?.emailAddress?.address?.toLowerCase() || ""
    const name = msg.from?.emailAddress?.name || email
    const entry = {
      email,
      name,
      subject: msg.subject || "(no subject)",
      received: msg.receivedDateTime,
      is_read: msg.isRead,
      preview: (msg.bodyPreview || "").slice(0, 150),
      message_id: msg.id
    }

    if (TEAM_EMAILS.includes(email)) {
      team.push(entry)
    } else if (knownEmailMap[email]) {
      const c = knownEmailMap[email]
      known.push({
        ...entry,
        contact_id: c.id,
        contact_name: `${c.first_name} ${c.last_name}`.trim(),
        contact_type: c.contact_type,
        stage: c.pipeline_stage || null,
        company: c.company_name || null
      })
    } else {
      // Unrecognized — surface as potential add
      const alreadySeen = unknown.find(u => u.email === email)
      if (!alreadySeen) {
        unknown.push({ ...entry, suggestion: "May need to be added to PeerChair" })
      }
      if (alreadySeen) other_count++
    }
  }

  // Build natural language summary
  const parts = []
  if (known.length > 0) parts.push(`${known.length} message${known.length > 1 ? "s" : ""} from known contacts`)
  if (team.length > 0) parts.push(`${team.length} from your team`)
  if (unknown.length > 0) parts.push(`${unknown.length} from unrecognized senders who may need to be added`)
  if (other_count > 0) parts.push(`${other_count} others ignored`)

  return corsResponse({
    period_hours: hours,
    summary: parts.length > 0 ? parts.join(", ") + "." : "Nothing significant in the last " + hours + " hours.",
    known,
    team,
    unknown,
    other_count
  })
}
