export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"
import { getAccessToken, graphFetch } from "@/lib/microsoft-auth"
import { logCronRun } from "@/lib/cron-audit"
import { resolvePeopleByEmail } from "@/lib/resolvePeople"

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
  // Resolve through person_emails: a contact's second address is still that
  // contact, not a stranger.
  let emailToPerson
  try { emailToPerson = await resolvePeopleByEmail(sb, senderEmails) }
  catch (e) {
    await logCronRun("sync-email", "Person resolve failed", [e.message])
    return Response.json({ error: e.message }, { status: 500 })
  }

  let synced = 0
  let unmatched = 0
  let filed_noise = 0
  const loggedFor = []
  const errors = []

  // Pattern-level automation catch. These are shapes, not senders, so they
  // can't live in the sender_rules registry — but they are no longer DROPPED.
  // They get written with status 'filed' and a label, so they stay inspectable
  // on the Filed tab. Nothing this cron sees disappears without a row.
  const SKIP_LOCAL_PARTS = /^(no-?reply|noreply-|donotreply|mailer-daemon|postmaster|bounces?|automated?)(@|-|\.)/i
  const SKIP_SUBJECTS = /^\s*(out of office|automatic reply|auto-reply|auto reply)\b/i
  // NOTE: the old SKIP_EXACT_ADDRESSES set lived here and returned `continue`,
  // which meant those messages were never recorded anywhere at all. They are now
  // rows in public.sender_rules (disposition 'ignore') and are routed by the
  // apply_sender_rules() BEFORE INSERT trigger — filed, visible, reversible.

  for (const msg of messages) {
    const fromAddr = msg.from?.emailAddress?.address?.toLowerCase()
    const fromName = msg.from?.emailAddress?.name || null
    if (!fromAddr || fromAddr === CFO_CIRCLE_EMAIL.toLowerCase()) continue

    // Shape-level automation: label it, but never drop it. preLabel is passed
    // to the unmatched insert below, which files the row instead of queueing it.
    let preLabel = null
    if (SKIP_LOCAL_PARTS.test(fromAddr)) preLabel = "Automated sender (no-reply)"
    else if (msg.subject && SKIP_SUBJECTS.test(msg.subject)) preLabel = "Out-of-office auto-reply"

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
      // Person match already failed above. The apply_sender_rules() trigger
      // classifies on insert: a matching rule sets status='filed' with the rule
      // recorded; no match leaves status='new' and it lands in the queue.
      const unmatchedRow = {
        direction: "inbound",
        channel: "email",
        from_address: fromAddr,
        from_name: fromName,
        subject: msg.subject || null,
        body_preview: msg.bodyPreview || null,
        occurred_at: msg.receivedDateTime,
        external_id: msg.id,
      }
      if (preLabel) {
        // Pre-set status short-circuits the trigger's classification, by design.
        unmatchedRow.status = "filed"
        unmatchedRow.filed_label = preLabel
        unmatchedRow.filed_disposition = "ignore"
        unmatchedRow.filed_at = new Date().toISOString()
      }
      const { data: unRow, error: unErr } = await sb
        .from("unmatched_communications")
        .insert(unmatchedRow)
        .select("status")
        .single()
      // Ignore unique-constraint duplicates silently (already captured a prior run)
      if (unErr && !String(unErr.message).includes("duplicate key")) {
        errors.push("unmatched insert: " + unErr.message)
        continue
      }
      if (!unErr) {
        if (unRow && unRow.status === "filed") filed_noise++
        else unmatched++
      }
    }
  }

  await logCronRun(
    "sync-email",
    `matched=${synced} unmatched=${unmatched} filed_noise=${filed_noise} (last ${hours}h)`,
    errors.length ? errors : null,
  )
  return Response.json({
    synced,
    unmatched,
    filed_noise,
    lookback_hours: hours,
    recipients_logged: [...new Set(loggedFor)],
    errors,
  })
}
