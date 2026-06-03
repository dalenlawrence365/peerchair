export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"
import { getAccessToken } from "@/lib/microsoft-auth"
import { logCronRun } from "@/lib/cron-audit"

// Inbound email sync — the counterpart to sync-sent.
// Pulls RECEIVED Outlook messages straight from Microsoft Graph, matches
// the SENDER against the unified `people` table, and writes lowercase
// canonical communications rows so replies show on the timeline.
// Lookback defaults to 2h for the cron; pass ?hours=N for a wider sweep.
const CFO_CIRCLE_EMAIL = "dalen.lawrence@cfo-circle.com"

export async function GET(request) {
  const auth = request.headers.get("authorization") || ""
  const expected = `Bearer ${process.env.CRON_SECRET || "cfocircle2026"}`
  if (auth !== expected) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const sb = serverClient()

  let accessToken
  try { accessToken = await getAccessToken() }
  catch (e) {
    await logCronRun("sync-email", "Token refresh failed", [e.message])
    return Response.json({ error: e.message }, { status: 401 })
  }

  const hoursParam = Number(new URL(request.url).searchParams.get("hours"))
  const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? Math.min(hoursParam, 720) : 2
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${since}&$select=id,subject,receivedDateTime,from,bodyPreview&$orderby=receivedDateTime desc&$top=100`,
    { headers: { Authorization: "Bearer " + accessToken } }
  )
  if (!res.ok) {
    await logCronRun("sync-email", "Outlook fetch failed", [`HTTP ${res.status}`])
    return Response.json({ error: "Outlook fetch failed" }, { status: 500 })
  }

  const { value: messages } = await res.json()
  if (!messages?.length) {
    await logCronRun("sync-email", `No received messages in last ${hours}h`)
    return Response.json({ synced: 0, lookback_hours: hours, message: `No received messages in last ${hours}h` })
  }

  // Sender addresses → match against people
  const senderEmails = [...new Set(
    messages.map(m => m.from?.emailAddress?.address?.toLowerCase()).filter(Boolean)
  )]
  const { data: people } = await sb.from("people").select("id, email").in("email", senderEmails)
  const emailToPerson = {}
  for (const p of (people || [])) { if (p.email) emailToPerson[p.email.toLowerCase()] = p }

  let synced = 0
  const loggedFor = []
  const errors = []
  for (const msg of messages) {
    const fromAddr = msg.from?.emailAddress?.address?.toLowerCase()
    if (!fromAddr || fromAddr === CFO_CIRCLE_EMAIL.toLowerCase()) continue
    const person = emailToPerson[fromAddr]
    if (!person) continue

    const { data: existing } = await sb.from("communications")
      .select("id")
      .or(`person_id.eq.${person.id},contact_id.eq.${person.id}`)
      .eq("channel", "email").eq("direction", "inbound")
      .eq("occurred_at", msg.receivedDateTime)
      .limit(1)
    if (existing?.length) continue

    const { error: insErr } = await sb.from("communications").insert({
      person_id: person.id,
      direction: "inbound",
      channel: "email",
      subject: msg.subject || null,
      body: `Subject: ${msg.subject || "(no subject)"}\n\n${msg.bodyPreview || ""}`,
      occurred_at: msg.receivedDateTime,
      step_label: "Received Email (Outlook)",
      source: "outlook_sync",
    })
    if (insErr) { errors.push(insErr.message); continue }
    synced++
    loggedFor.push(fromAddr)
  }

  await logCronRun(
    "sync-email",
    synced > 0 ? `Synced ${synced} received email(s)` : "No new received emails to log",
    errors.length ? errors : null,
  )
  return Response.json({
    synced,
    lookback_hours: hours,
    recipients_logged: [...new Set(loggedFor)],
    errors,
  })
}
