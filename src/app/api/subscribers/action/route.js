export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* Approve / decline a pending invitation-list signup.

   approve  -> email_consent='subscribed', add the 'cfo' role (Dalen just
               confirmed the seat), clear the 'unmatched' flag, and send a
               branded HTML welcome via Resend. The welcome doubles as an
               email-validity check — a hard bounce means the address is bad.
   decline  -> email_consent='rejected' and send the gracious "CFOs only"
               note (Option A) via Resend.

   Same-origin admin action (called from the Subscribers page), matching the
   codebase's other app-internal mutation routes. */

const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"
const PC = "https://www.peerchair.com"
const FROM = "Dalen Lawrence <events@la-cfo.com>"
const REPLY_TO = "events@la-cfo.com"
const FOOTER_ADDRESS = "2549 Young Avenue #B, Thousand Oaks, CA 91360"

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }

async function getToken(sb, personId) {
  const { data: ex } = await sb.from("track_tokens").select("token").eq("person_id", personId).limit(1).maybeSingle()
  if (ex && ex.token) return ex.token
  const { data: m } = await sb.from("track_tokens").insert({ person_id: personId }).select("token").single()
  return m ? m.token : null
}

async function sendResend(payload) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.RESEND_API_KEY },
      body: JSON.stringify(payload),
    })
    const text = await res.text().catch(() => "")
    return { ok: res.ok, status: res.status, text }
  } catch (e) { return { ok: false, status: 0, text: (e && e.message) || "exception" } }
}

function shell(inner) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f5f1e6;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1e6;"><tr><td align="center" style="padding:28px 16px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e7e0cd;">' +
    '<tr><td style="background:#121a3c;padding:22px 36px;" align="left"><img src="' + SITE + '/cfo-circle-logo-white.png" alt="CFO Circle · Los Angeles" height="34" style="height:34px;display:block;border:0;"></td></tr>' +
    inner +
    '</table></td></tr></table></body></html>'
}

function welcomeHtml(o) {
  return shell(
    '<tr><td style="padding:34px 36px 8px;font-family:Arial,Helvetica,sans-serif;color:#20242f;">' +
    '<p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Hi ' + esc(o.first_name) + ',</p>' +
    '<p style="margin:0 0 18px;font-size:16px;line-height:1.65;">You’re in — welcome to the CFO Circle Los Angeles community. I’m glad to have you in it.</p>' +
    '<p style="margin:0 0 18px;font-size:16px;line-height:1.65;">Here’s what that means, practically: through the year I host and get invited to worthwhile gatherings for LA CFOs — workshops, happy hours, the occasional standout event. When one fits, I’ll loop you in. That’s it. No newsletters, no pitches, nothing sold — just the invitations worth your time.</p>' +
    '<p style="margin:0 0 24px;font-size:16px;line-height:1.65;">If you want a sense of what’s on the calendar right now, take a look:</p>' +
    '</td></tr>' +
    '<tr><td align="center" style="padding:0 36px 30px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#c39a4e;border-radius:3px;"><a href="' + SITE + '/events/" style="display:inline-block;padding:14px 32px;color:#121a3c;font-weight:bold;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;">See what’s coming up &rarr;</a></td></tr></table></td></tr>' +
    '<tr><td style="padding:0 36px 6px;font-family:Arial,Helvetica,sans-serif;color:#20242f;">' +
    '<p style="margin:0 0 2px;font-size:16px;line-height:1.6;">Looking forward to seeing you in a room,</p>' +
    '<p style="margin:0 0 2px;font-family:Georgia,serif;font-size:15px;color:#121a3c;">Dalen Lawrence</p>' +
    '<p style="margin:0 0 30px;font-size:13px;color:#54596b;">Chapter Director &middot; CFO Circle, Los Angeles</p>' +
    '</td></tr>' +
    '<tr><td style="background:#121a3c;padding:22px 36px;font-family:Arial,Helvetica,sans-serif;">' +
    '<p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#c5cce4;">You’re on the list because you asked to be. If that ever changes, <a href="' + o.unsub_url + '" style="color:#d8b779;text-decoration:underline;">unsubscribe with one click</a> — no hard feelings.</p>' +
    '<p style="margin:0;font-size:11px;line-height:1.5;color:#9aa3c6;">CFO Circle &middot; Los Angeles &nbsp;|&nbsp; ' + esc(FOOTER_ADDRESS) + '</p>' +
    '</td></tr>'
  )
}

function declineHtml(o) {
  return shell(
    '<tr><td style="padding:34px 36px 30px;font-family:Arial,Helvetica,sans-serif;color:#20242f;">' +
    '<p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Hi ' + esc(o.first_name) + ',</p>' +
    '<p style="margin:0 0 18px;font-size:16px;line-height:1.65;">Thanks for your interest in the CFO Circle events. I want to be upfront: the room is built specifically for sitting CFOs, so I keep the list to people in that seat — it’s what keeps the conversations candid and relevant.</p>' +
    '<p style="margin:0 0 18px;font-size:16px;line-height:1.65;">It’s not the right fit for you right now, so I haven’t added you — truly nothing personal. If your role ever changes, or you know a CFO who’d value it, I’d genuinely welcome the introduction.</p>' +
    '<p style="margin:0 0 2px;font-size:16px;line-height:1.6;">All my best,</p>' +
    '<p style="margin:0;font-family:Georgia,serif;font-size:15px;color:#121a3c;">Dalen Lawrence</p>' +
    '</td></tr>' +
    '<tr><td style="background:#121a3c;padding:18px 36px;font-family:Arial,Helvetica,sans-serif;"><p style="margin:0;font-size:11px;line-height:1.5;color:#9aa3c6;">CFO Circle &middot; Los Angeles &nbsp;|&nbsp; ' + esc(FOOTER_ADDRESS) + '</p></td></tr>'
  )
}

export async function POST(req) {
  let body = {}
  try { body = await req.json() } catch { return Response.json({ error: "bad_request" }, { status: 400 }) }
  const personId = String(body.person_id || "").trim()
  const action = String(body.action || "").trim()
  if (!personId || (action !== "approve" && action !== "decline")) return Response.json({ error: "invalid" }, { status: 400 })

  const sb = serverClient()
  const { data: p } = await sb.from("people").select("id, first_name, full_name, email, email2, roles").eq("id", personId).maybeSingle()
  if (!p) return Response.json({ error: "not_found" }, { status: 404 })

  const email = (p.email && p.email.trim()) || (p.email2 && p.email2.trim())
  const first = p.first_name || (p.full_name || "there").split(" ")[0]
  const nowIso = new Date().toISOString()

  if (action === "approve") {
    const roles = Array.isArray(p.roles) ? p.roles : []
    const newRoles = roles.includes("cfo") ? roles : roles.concat(["cfo"])
    await sb.from("people").update({
      email_consent: "subscribed", email_consent_at: nowIso, email_suppressed: false, roles: newRoles,
    }).eq("id", personId)
    // Dalen confirmed the seat — clear the identity-review flag.
    await sb.from("person_status_tags").update({ removed_at: nowIso }).eq("person_id", personId).eq("tag", "unmatched").is("removed_at", null)

    let emailed = null
    if (email) {
      const token = await getToken(sb, personId)
      const unsub = PC + "/api/unsubscribe?t=" + encodeURIComponent(token || "")
      const r = await sendResend({
        from: FROM, to: [email], reply_to: REPLY_TO,
        subject: "You’re in — welcome to CFO Circle Los Angeles",
        html: welcomeHtml({ first_name: first, unsub_url: unsub }),
        headers: { "List-Unsubscribe": "<" + unsub + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      })
      emailed = r.ok
    }
    return Response.json({ ok: true, action: "approve", emailed })
  }

  // decline
  await sb.from("people").update({
    email_consent: "rejected", email_unsubscribed_at: nowIso, email_unsub_reason: "not a CFO — declined by Dalen",
  }).eq("id", personId)
  await sb.from("person_status_tags").update({ removed_at: nowIso }).eq("person_id", personId).eq("tag", "unmatched").is("removed_at", null)

  let emailed = null
  if (email) {
    const r = await sendResend({
      from: FROM, to: [email], reply_to: REPLY_TO,
      subject: "About the CFO Circle events",
      html: declineHtml({ first_name: first }),
    })
    emailed = r.ok
  }
  return Response.json({ ok: true, action: "decline", emailed })
}
