export const dynamic = "force-dynamic"
export const maxDuration = 120
import { serverClient } from "@/lib/supabaseServer"
import { getAccessToken, graphFetch } from "@/lib/microsoft-auth"
import { parseAndStageRoster } from "@/lib/provisorsParse"
import { sendAlert } from "@/lib/notify"
import { logCronRun } from "@/lib/cron-audit"

// Hourly Outlook poll — the institutional half of ProVisors roster intake.
// Scans the inbox for recent mail carrying a roster ("photo list") PDF, downloads
// it straight from Microsoft Graph, runs the SAME parse+dedupe+stage core as the
// manual upload path, and emails Dalen a "ready to review" alert. Nothing is ever
// written to `people` here — every batch lands PENDING in /provisors/review for
// one-click approve. Re-running is safe: intake dedupes on internetMessageId, so a
// roster email is only ever staged once no matter how often we poll.
//
// Auth: Bearer CRON_SECRET (same as every other cron). Lookback defaults to 72h so
// a missed run can't drop a roster; ?hours=N widens it for manual sweeps.

const ROSTER_NAME = /(photo\s*list|roster)/i

export async function GET(request) {
  const auth = request.headers.get("authorization") || ""
  const expected = `Bearer ${process.env.CRON_SECRET || "cfocircle2026"}`
  if (auth !== expected) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const sb = serverClient()

  let accessToken
  try { accessToken = await getAccessToken() }
  catch (e) {
    await logCronRun("provisors-poll-email", "Token refresh failed", [e.message])
    return Response.json({ error: e.message }, { status: 401 })
  }

  const hoursParam = Number(new URL(request.url).searchParams.get("hours"))
  const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? Math.min(hoursParam, 720) : 72
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()

  // NOTE: no $orderby — combining a date filter + hasAttachments + $orderby can trip
  // Graph's "inefficient filter" error and silently return nothing. We dedupe and
  // process every match anyway, so order is irrelevant; $top=100 covers the window.
  const listUrl =
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages` +
    `?$filter=receivedDateTime ge ${since} and hasAttachments eq true` +
    `&$select=id,subject,bodyPreview,receivedDateTime,from,internetMessageId&$top=100`
  const res = await graphFetch(listUrl)
  if (!res.ok) {
    const t = await res.text()
    await logCronRun("provisors-poll-email", "Outlook fetch failed", [`HTTP ${res.status}`])
    return Response.json({ error: "Outlook fetch failed", detail: t.slice(0, 300) }, { status: 500 })
  }
  const { value: messages } = await res.json()
  if (!messages || !messages.length) {
    await logCronRun("provisors-poll-email", `No attachment mail in last ${hours}h`)
    return Response.json({ staged: 0, scanned: 0, skipped: 0 })
  }

  const staged = []
  const skipped = []
  const errors = []
  let scanned = 0

  for (const msg of messages) {
    try {
      const imid = msg.internetMessageId || msg.id

      // Pre-dedupe before spending any Graph/Anthropic calls.
      const { data: dup } = await sb.from("provisor_import_batches")
        .select("id").contains("payload", { sourceMessageId: imid }).limit(1)
      if (dup && dup.length) { skipped.push(imid); continue }

      // List attachments; find a roster-looking PDF.
      const aUrl = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(msg.id)}/attachments?$select=id,name,contentType,size`
      const aRes = await graphFetch(aUrl)
      if (!aRes.ok) continue
      const { value: atts } = await aRes.json()
      // Roster signal: filename OR the email envelope (subject/body) mentions a
      // "photo list"/"roster". Leaders name the PDF inconsistently — this one is
      // "VDAM 7-8-2026.pdf", which the filename regex misses — but the body almost
      // always says "photo list" (here: "Sorry for the late sending of the PhotoList").
      // Envelope text is the reliable trigger; the Claude parser + tracked-group
      // filter remain the final gatekeeper on whether the PDF is actually a roster.
      const envelopeIsRoster = ROSTER_NAME.test(`${msg.subject || ""} ${msg.bodyPreview || ""}`)
      const target = (atts || []).find(a => {
        const name = a.name || ""
        const isPdf = /pdf/i.test(a.contentType || "") || /\.pdf$/i.test(name)
        return isPdf && (ROSTER_NAME.test(name) || envelopeIsRoster)
      })
      if (!target) continue
      scanned++

      // Download the attachment bytes (single-attachment GET includes contentBytes).
      const dUrl = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(msg.id)}/attachments/${encodeURIComponent(target.id)}`
      const dRes = await graphFetch(dUrl)
      if (!dRes.ok) { errors.push(`attachment download failed for ${imid}`); continue }
      const att = await dRes.json()
      const b64 = att.contentBytes
      if (!b64) { errors.push(`no contentBytes for ${imid}`); continue }

      const result = await parseAndStageRoster(sb, {
        pdf_base64: b64,
        filename: target.name || null,
        source: "email",
        sourceMessageId: imid,
      })
      if (result.duplicate) { skipped.push(imid); continue }

      staged.push({ batch_id: result.batch_id, group: result.meetingGroup, summary: result.summary, subject: msg.subject })

      const s = result.summary || {}
      await sendAlert(
        `🗂️ ProVisors roster ready to review — ${result.meetingGroup || "ProVisors"}`,
        `Roster from "${msg.subject || "(no subject)"}" parsed: ${s.new || 0} new, ${s.existing || 0} updates (${s.total || 0} total). Approve in PeerChair.`,
        `<div style="font-family:sans-serif;max-width:480px;padding:20px">
          <h2 style="color:#f0c84a;margin:0 0 8px">🗂️ ProVisors Roster Staged</h2>
          <p style="font-size:15px;margin:0 0 6px"><strong>${result.meetingGroup || ""}</strong></p>
          <p style="margin:0 0 12px">${s.new || 0} new · ${s.existing || 0} updates · ${s.total || 0} total<br>
            <span style="color:#888">from: ${msg.subject || ""}</span></p>
          <a href="https://www.peerchair.com/provisors/review" style="background:#f0c84a;color:#000;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold">Review &amp; Approve →</a>
        </div>`
      )
    } catch (e) {
      errors.push(String(e && e.message || e))
    }
  }

  await logCronRun("provisors-poll-email", `Staged ${staged.length}, skipped ${skipped.length}, scanned ${scanned}`, errors.length ? errors : null)
  return Response.json({ staged: staged.length, skipped: skipped.length, scanned, errors, batches: staged })
}
