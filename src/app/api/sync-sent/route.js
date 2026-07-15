export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"
import { corsResponse, handleOptions } from "@/lib/cors"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { getAccessToken, graphFetch } from "@/lib/microsoft-auth"
import { logCronRun } from "@/lib/cron-audit"
import { resolvePeopleByEmail } from "@/lib/resolvePeople"

export async function OPTIONS() { return handleOptions() }

// Logs Dalen's recently SENT Outlook emails to the activity timeline.
// Matches recipients against the unified `people` table (not legacy contacts),
// so anyone with an email is covered — including people-only records with no
// contacts row. Writes person_id (contact_id stays null for people-only).
// Lookback defaults to 2h (cron); pass ?hours=N for a one-off wider sweep.
export async function GET(request) {
  const auth = request.headers.get("authorization") || ""
  const expected = `Bearer ${process.env.CRON_SECRET || "cfocircle2026"}`
  const isCron = auth === expected
  const isGpt = verifyGptActionKey(request)
  if (!isCron && !isGpt) {
    return corsResponse({ error: "Unauthorized" }, { status: 401 })
  }

  const sb = serverClient()

  let accessToken
  try {
    accessToken = await getAccessToken()
  } catch (e) {
    await logCronRun("sync-sent", "Token refresh failed", [e.message])
    return corsResponse({ error: e.message }, { status: 401 })
  }

  // Lookback window — default 2h for the cron, override with ?hours= for a sweep
  const hoursParam = Number(new URL(request.url).searchParams.get("hours"))
  const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? Math.min(hoursParam, 720) : 2
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const res = await graphFetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$filter=sentDateTime ge ${since}&$select=id,subject,sentDateTime,toRecipients,bodyPreview&$orderby=sentDateTime desc&$top=100`
  )
  if (!res.ok) {
    await logCronRun("sync-sent", "Outlook fetch failed", [`HTTP ${res.status}`])
    return corsResponse({ error: "Outlook fetch failed" }, { status: 500 })
  }

  const { value: messages } = await res.json()
  if (!messages?.length) {
    await logCronRun("sync-sent", `No sent messages in last ${hours}h`)
    return corsResponse({ synced: 0, message: `No sent messages in last ${hours}h` })
  }

  // All recipient addresses across the batch
  const allEmails = [...new Set(
    messages.flatMap(m => (m.toRecipients || []).map(r => r.emailAddress?.address?.toLowerCase()).filter(Boolean))
  )]
  if (!allEmails.length) {
    await logCronRun("sync-sent", "No recipients found in sent items")
    return corsResponse({ synced: 0, message: "No recipients found" })
  }

  // Match through person_emails — mail you send TO someone's alternate address
  // belongs on their timeline too.
  let emailToPerson
  try { emailToPerson = await resolvePeopleByEmail(sb, allEmails) }
  catch (e) {
    await logCronRun("sync-sent", "Person resolve failed", [e.message])
    return corsResponse({ error: e.message }, { status: 500 })
  }
  if (!Object.keys(emailToPerson).length) {
    await logCronRun("sync-sent", "No matching people in sent items")
    return corsResponse({ synced: 0, message: "No matching people in sent items" })
  }

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
        .eq("person_id", person.id)
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

  await logCronRun(
    "sync-sent",
    synced > 0 ? `Synced ${synced} sent email(s)` : "No new emails to log",
  )
  return corsResponse({
    synced,
    lookback_hours: hours,
    recipients_logged: [...new Set(loggedFor)],
    message: synced > 0 ? `${synced} sent email(s) logged.` : "No new emails to log.",
  })
}
