export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"
import { corsResponse, handleOptions } from "@/lib/cors"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { getAccessToken } from "@/lib/microsoft-auth"

export async function OPTIONS() { return handleOptions() }

// Logs Dalen's recently SENT Outlook emails to the activity timeline.
// Matches recipients against the unified `people` table (not legacy contacts),
// so anyone with an email is covered — including people-only records with no
// contacts row. Writes person_id (contact_id stays null for people-only).
// Lookback defaults to 2h (cron); pass ?hours=N for a one-off wider sweep.
export async function GET(request) {
  const auth = request.headers.get("authorization") || ""
  const isCron = auth === "Bearer cfocircle2026"
  const isGpt = verifyGptActionKey(request)
  if (!isCron && !isGpt) {
    return corsResponse({ error: "Unauthorized" }, { status: 401 })
  }

  const sb = serverClient()

  let accessToken
  try {
    accessToken = await getAccessToken()
  } catch (e) {
    return corsResponse({ error: e.message }, { status: 401 })
  }

  // Lookback window — default 2h for the cron, override with ?hours= for a sweep
  const hoursParam = Number(new URL(request.url).searchParams.get("hours"))
  const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? Math.min(hoursParam, 720) : 2
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$filter=sentDateTime ge ${since}&$select=id,subject,sentDateTime,toRecipients,bodyPreview&$orderby=sentDateTime desc&$top=100`,
    { headers: { Authorization: "Bearer " + accessToken } }
  )
  if (!res.ok) return corsResponse({ error: "Outlook fetch failed" }, { status: 500 })

  const { value: messages } = await res.json()
  if (!messages?.length) return corsResponse({ synced: 0, message: `No sent messages in last ${hours}h` })

  // All recipient addresses across the batch
  const allEmails = [...new Set(
    messages.flatMap(m => (m.toRecipients || []).map(r => r.emailAddress?.address?.toLowerCase()).filter(Boolean))
  )]
  if (!allEmails.length) return corsResponse({ synced: 0, message: "No recipients found" })

  // Match against PEOPLE (unified table), not legacy contacts
  const { data: people } = await sb.from("people").select("id, email").in("email", allEmails)
  if (!people?.length) return corsResponse({ synced: 0, message: "No matching people in sent items" })

  const emailToPerson = {}
  for (const p of people) { if (p.email) emailToPerson[p.email.toLowerCase()] = p }

  let synced = 0
  const loggedFor = []
  for (const msg of messages) {
    for (const recip of (msg.toRecipients || [])) {
      const email = recip.emailAddress?.address?.toLowerCase()
      const person = email && emailToPerson[email]
      if (!person) continue

      // Dedup on the exact send time + this person (covers rows whether they
      // were written with person_id or the legacy contact_id, same UUID).
      const { data: existing } = await sb.from("communications")
        .select("id")
        .or(`person_id.eq.${person.id},contact_id.eq.${person.id}`)
        .eq("channel", "email").eq("direction", "outbound")
        .eq("occurred_at", msg.sentDateTime)
        .limit(1)
      if (existing?.length) continue

      const { error: insErr } = await sb.from("communications").insert({
        person_id: person.id,
        direction: "outbound",
        channel: "email",
        subject: msg.subject || null,
        body: `Subject: ${msg.subject || "(no subject)"}\n\n${msg.bodyPreview || ""}`,
        occurred_at: msg.sentDateTime,
        step_label: "Sent Email (Outlook)",
        source: "outlook_sync",
      })
      if (insErr) { console.error("sync-sent insert failed:", insErr.message); continue }
      synced++
      loggedFor.push(email)
    }
  }

  return corsResponse({
    synced,
    lookback_hours: hours,
    recipients_logged: [...new Set(loggedFor)],
    message: synced > 0 ? `${synced} sent email(s) logged.` : "No new emails to log.",
  })
}
