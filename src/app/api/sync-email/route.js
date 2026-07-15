export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"
import { getAccessToken, graphFetch } from "@/lib/microsoft-auth"
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

  const res = await graphFetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${since}&$select=id,subject,receivedDateTime,from,bodyPreview&$orderby=receivedDateTime desc&$top=100`
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
  let unmatched = 0
  let skipped_noise = 0
  const loggedFor = []
  const errors = []

  // Auto-skip conservative patterns — only obvious automation. Conservative
  // because false positives (real mail filtered out) are worse than false
  // negatives (noise in the triage queue).
  const SKIP_LOCAL_PARTS = /^(no-?reply|noreply-|donotreply|mailer-daemon|postmaster|bounces?|automated?)(@|-|\.)/i
  const SKIP_SUBJECTS = /^\s*(out of office|automatic reply|auto-reply|auto reply)\b/i
  // Specific known-automated senders that are recurring and should NOT enter
  // the unmatched triage queue. Their content (e.g., Calendly booking details)
  // is captured by a different layer (sync-calendar / Outlook calendar sync).
  const SKIP_EXACT_ADDRESSES = new Set([
    "notifications@calendly.com",
    "no-reply@calendly.com",
    "notifications@slack.com",
    "noreply@github.com",
    "linkedin@em.linkedin.com",
    "messages-noreply@linkedin.com",
    "invitations@linkedin.com",
    "calendar-notification@google.com",
  ])

  for (const msg of messages) {
    const fromAddr = msg.from?.emailAddress?.address?.toLowerCase()
    const fromName = msg.from?.emailAddress?.name || null
    if (!fromAddr || fromAddr === CFO_CIRCLE_EMAIL.toLowerCase()) continue

    // Conservative auto-skip
    if (SKIP_EXACT_ADDRESSES.has(fromAddr) ||
        SKIP_LOCAL_PARTS.test(fromAddr) ||
        (msg.subject && SKIP_SUBJECTS.test(msg.subject))) {
      skipped_noise++
      continue
    }

    const person = emailToPerson[fromAddr]

    if (person) {
      // Matched path — write to the person's timeline (existing behavior)
      const { data: existing } = await sb.from("communications")
        .select("id")
        .eq("person_id", person.id)
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
    } else {
      // Unmatched path — write to holding table for triage
      const { error: unErr } = await sb.from("unmatched_communications").insert({
        direction: "inbound",
        channel: "email",
        from_address: fromAddr,
        from_name: fromName,
        subject: msg.subject || null,
        body_preview: msg.bodyPreview || null,
        occurred_at: msg.receivedDateTime,
        external_id: msg.id,
      })
      // Ignore unique-constraint duplicates silently (already captured a prior run)
      if (unErr && !String(unErr.message).includes("duplicate key")) {
        errors.push("unmatched insert: " + unErr.message)
        continue
      }
      if (!unErr) unmatched++
    }
  }

  await logCronRun(
    "sync-email",
    `matched=${synced} unmatched=${unmatched} skipped_noise=${skipped_noise} (last ${hours}h)`,
    errors.length ? errors : null,
  )
  return Response.json({
    synced,
    unmatched,
    skipped_noise,
    lookback_hours: hours,
    recipients_logged: [...new Set(loggedFor)],
    errors,
  })
}
