export const dynamic = "force-dynamic"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { corsResponse, handleOptions } from "@/lib/cors"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"
import { graphFetch } from "@/lib/microsoft-auth"

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

  const sb = serverClient()

  // Fetch recent inbox messages from Outlook
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  let msgRes
  try {
    msgRes = await graphFetch(
      `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${since}&$select=id,subject,receivedDateTime,from,isRead,bodyPreview&$orderby=receivedDateTime desc&$top=50`
    )
  } catch (e) {
    return corsResponse({ error: e.message }, { status: 401 })
  }

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

  // Look up which senders are in PeerChair (people, the unified table)
  const { data: knownPeople } = await sb
    .from("people")
    .select("id, full_name, email, roles, cfo_state, sponsor_state, referral_state, company")
    .in("email", senderEmails)

  const knownEmailMap = {}
  for (const c of (knownPeople || [])) {
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
        contact_name: c.full_name || "",
        contact_type: Array.isArray(c.roles) ? c.roles[0] : null,
        stage: c.cfo_state || c.sponsor_state || c.referral_state || null,
        company: c.company || null
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
