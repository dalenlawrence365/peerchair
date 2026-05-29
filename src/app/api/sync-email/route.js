export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { getAccessToken } from "@/lib/microsoft-auth"

// Inbound email sync — the counterpart to sync-sent.
// Pulls RECEIVED Outlook messages straight from Microsoft Graph (reliable
// token path, not the old LLM/MCP approach), matches the SENDER against the
// unified `people` table, and writes to `communications` (direction IN) so
// replies show on the person's activity timeline. Lookback defaults to 2h
// for the cron; pass ?hours=N for a one-off wider sweep.
const CFO_CIRCLE_EMAIL = "dalen.lawrence@cfo-circle.com"

export async function GET(request) {
  const auth = request.headers.get("authorization") || ""
  const ok = auth === "Bearer cfocircle2026" || (process.env.CRON_SECRET && auth === "Bearer " + process.env.CRON_SECRET)
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const results = { run_at: new Date().toISOString(), synced: 0, errors: [] }

  let accessToken
  try { accessToken = await getAccessToken() }
  catch (e) { return Response.json({ error: e.message }, { status: 401 }) }

  const hoursParam = Number(new URL(request.url).searchParams.get("hours"))
  const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? Math.min(hoursParam, 720) : 2
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${since}&$select=id,subject,receivedDateTime,from,bodyPreview&$orderby=receivedDateTime desc&$top=100`,
    { headers: { Authorization: "Bearer " + accessToken } }
  )
  if (!res.ok) {
    results.errors.push("Outlook fetch failed: " + res.status)
    return Response.json(results, { status: 500 })
  }

  const { value: messages } = await res.json()
  if (!messages?.length) return Response.json({ ...results, lookback_hours: hours, message: `No received messages in last ${hours}h` })

  // Sender addresses → match against people
  const senderEmails = [...new Set(
    messages.map(m => m.from?.emailAddress?.address?.toLowerCase()).filter(Boolean)
  )]
  const { data: people } = await sb.from("people").select("id, email").in("email", senderEmails)
  const emailToPerson = {}
  for (const p of (people || [])) { if (p.email) emailToPerson[p.email.toLowerCase()] = p }

  const loggedFor = []
  for (const msg of messages) {
    const fromAddr = msg.from?.emailAddress?.address?.toLowerCase()
    if (!fromAddr || fromAddr === CFO_CIRCLE_EMAIL.toLowerCase()) continue
    const person = emailToPerson[fromAddr]
    if (!person) continue

    const { data: existing } = await sb.from("communications")
      .select("id")
      .or(`person_id.eq.${person.id},contact_id.eq.${person.id}`)
      .eq("channel", "Email").eq("direction", "IN")
      .eq("occurred_at", msg.receivedDateTime)
      .limit(1)
    if (existing?.length) continue

    const { error: insErr } = await sb.from("communications").insert({
      person_id: person.id,
      direction: "IN",
      channel: "Email",
      subject: msg.subject || null,
      body: `Subject: ${msg.subject || "(no subject)"}\n\n${msg.bodyPreview || ""}`,
      occurred_at: msg.receivedDateTime,
      step_label: "Received Email (Outlook)",
      source: "outlook_sync",
    })
    if (insErr) { results.errors.push(insErr.message); continue }
    results.synced++
    loggedFor.push(fromAddr)
  }

  await sb.from("audit_log").insert({
    run_at: results.run_at,
    audit_type: "email_sync",
    summary: `Inbound ✓ · ${results.synced} email(s) logged (last ${hours}h)`,
    errors: results.errors,
  })

  return Response.json({ ...results, lookback_hours: hours, recipients_logged: [...new Set(loggedFor)] })
}
