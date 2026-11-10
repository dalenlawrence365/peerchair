import { FROM } from "@/lib/cfoCircleEmail"

/* Inbound replies to event invitations (Resend Receiving).
   Flow: Resend POSTs `email.received` (metadata only) -> we fetch the body from the
   Receiving API -> match the sender to a person via person_emails -> log it on that
   profile (communications, inbound) -> forward a copy to the real inbox so nothing is
   missed in Outlook. Unknown senders go to unmatched_communications.

   Idempotent: external_id / sequence_key = "resend:<email_id>", so a retried webhook
   never double-logs or double-forwards. */

const FORWARD_TO = process.env.REPLY_FORWARD_TO || "events@la-cfo.com"

function parseAddr(s) {
  const str = String(s || "")
  const m = str.match(/<([^>]+)>/)
  const addr = (m ? m[1] : str).trim().toLowerCase()
  const name = m ? str.replace(/<[^>]+>/, "").replace(/["']/g, "").trim() : ""
  return { addr, name }
}
function htmlToText(h) {
  return String(h || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim()
}
// Keep the new text, drop the quoted original and signature noise.
function stripQuoted(t) {
  const s = String(t || "")
  const cut = s.search(/\n\s*(On .{5,120} wrote:|-{2,}\s*Original Message|From:\s.+\nSent:)/i)
  return (cut > 0 ? s.slice(0, cut) : s).trim()
}

export async function handleInboundReply(sb, ev) {
  const d = ev.data || {}
  const emailId = d.email_id
  if (!emailId) return { ignored: "no_email_id" }
  const key = "resend:" + emailId

  const { data: seen } = await sb.from("communications").select("id").eq("sequence_key", key).limit(1)
  if (seen && seen.length) return { ignored: "duplicate" }
  const { data: seenU } = await sb.from("unmatched_communications").select("id").eq("external_id", key).limit(1)
  if (seenU && seenU.length) return { ignored: "duplicate" }

  // Fetch the body (webhook has metadata only).
  let full = {}
  try {
    const r = await fetch("https://api.resend.com/emails/receiving/" + encodeURIComponent(emailId), {
      headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY },
    })
    if (r.ok) full = await r.json()
    else full = { _fetch_error: r.status }
  } catch (e) { full = { _fetch_error: String(e.message || e) } }

  const from = parseAddr(full.from || d.from)
  const subject = String(full.subject || d.subject || "(no subject)")
  const rawText = full.text || htmlToText(full.html)
  const body = stripQuoted(rawText) || (full._fetch_error ? "(body unavailable: Receiving API returned " + full._fetch_error + "; check that RESEND_API_KEY has full access)" : "(empty)")
  const when = d.created_at || ev.created_at || new Date().toISOString()

  // Match sender -> person (any address on file).
  let personId = null
  if (from.addr) {
    const { data: pe } = await sb.from("person_emails").select("person_id").eq("email", from.addr).maybeSingle()
    personId = pe ? pe.person_id : null
    if (!personId) {
      const { data: pp } = await sb.from("people").select("id").ilike("email", from.addr).limit(1).maybeSingle()
      personId = pp ? pp.id : null
    }
  }

  let who = from.name || from.addr
  if (personId) {
    await sb.from("communications").insert({
      occurred_at: when, channel: "email", direction: "inbound", subject, body: body.slice(0, 8000),
      source: "resend_inbound", logged_by: "system", sequence_key: key, person_id: personId,
    })
    const { data: p } = await sb.from("people").select("full_name").eq("id", personId).maybeSingle()
    if (p && p.full_name) who = p.full_name
    // A reply is a response: stamp responded_at on any open invite row.
    await sb.from("event_attendees").update({ responded_at: when }).eq("person_id", personId).is("responded_at", null).eq("status", "Invited")
    // A sender we didn't know yet but matched by people.email: remember the address.
  } else {
    await sb.from("unmatched_communications").insert({
      direction: "inbound", channel: "email", from_address: from.addr || "unknown", from_name: from.name || null,
      to_addresses: d.to || null, subject, body_preview: body.slice(0, 1000), occurred_at: when, external_id: key,
    })
  }

  // Forward a copy to the human inbox. Reply-To = the sender, so hitting Reply answers them directly.
  let forwarded = false
  if (process.env.RESEND_API_KEY) {
    try {
      const html = "<p style=\"font:14px/1.5 sans-serif;color:#555\">Reply from <b>" + who.replace(/</g, "&lt;") + "</b> &lt;" + from.addr +
        "&gt; to your CFO Circle invite" + (personId ? " (logged on their PeerChair profile)" : " (<b>sender not matched</b> to a person)") +
        ".</p><hr><pre style=\"font:14px/1.5 sans-serif;white-space:pre-wrap\">" + rawText.replace(/</g, "&lt;") + "</pre>"
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [FORWARD_TO], reply_to: from.addr || undefined, subject: "[Reply] " + subject + " — " + who, html }),
      })
      forwarded = r.ok
    } catch (e) { forwarded = false }
  }
  return { ok: true, matched: !!personId, forwarded, body_fetched: !full._fetch_error }
}
