export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* Per-recipient event-invite sender (Nov 17 workshop and future events).

   Why per-recipient and not a single Resend Broadcast: each email carries THIS
   person's tracked RSVP link (?t=<token> → logged to their PeerChair profile)
   and THIS person's tokenized one-click unsubscribe. A broadcast can't do that.

   Safety:
   - Auth-gated (Bearer CRON_SECRET). Nothing public can trigger a send.
   - dry_run defaults TRUE — returns who WOULD receive it, sends nothing.
   - test_to sends a single sample to one address (warm-up / eyeball).
   - batched: send `limit` at a time (default 25) so you warm the domain and
     stay inside serverless timeouts; re-call to send the next batch.
   - records every send in email_sends (dedup) and marks the person "Invited"
     on the event roster. Already-sent / already-registered / unsubscribed /
     suppressed / no-email are all excluded automatically.

   POST body: { slug, dry_run=true, limit=25, exclude_fractional=true, test_to? }
   Header:    Authorization: Bearer <CRON_SECRET>
*/

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}
function json(b, s = 200) { return Response.json(b, { status: s, headers: CORS }) }
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }

const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"
const PC = "https://www.peerchair.com"
const FROM = "Dalen Lawrence <events@la-cfo.com>"
const REPLY_TO = "events@la-cfo.com"
const FOOTER_ADDRESS = "2549 Young Avenue #B, Thousand Oaks, CA 91360"
const FRACTIONAL = /fractional|interim|outsourced|portfolio|part-time|part time|advisory/

function laLong(iso) { try { return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Los_Angeles" }) } catch (e) { return "" } }
function laShort(iso) { try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }) } catch (e) { return "" } }
function laTime(iso) { try { return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).replace(":00", "") } catch (e) { return "" } }

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }

function renderInviteHtml(o) {
  // o: first_name, rsvp_url, unsub_url, event_name, when_line, hosted_line
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
  '<body style="margin:0;padding:0;background:#f5f1e6;">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1e6;"><tr><td align="center" style="padding:28px 16px;">' +
  '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e7e0cd;">' +
  '<tr><td style="background:#121a3c;padding:22px 36px;" align="left"><img src="' + SITE + '/cfo-circle-logo-white.png" alt="CFO Circle · Los Angeles" height="34" style="height:34px;display:block;border:0;"></td></tr>' +
  '<tr><td style="padding:34px 36px 8px;font-family:Arial,Helvetica,sans-serif;color:#20242f;">' +
  '<p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Hi ' + esc(o.first_name) + ',</p>' +
  '<p style="margin:0 0 18px;font-size:16px;line-height:1.65;">The best CFOs don’t get better alone. I gather accomplished Los Angeles CFOs into a confidential, no-sales room where they sharpen one another on the real decisions of the seat — and on ' + esc(o.when_line_short) + ', I’m opening one of those mornings to a small group of LA finance leaders. I’d like you in the room.</p>' +
  '<p style="margin:0 0 22px;font-size:16px;line-height:1.65;">It’s a facilitated working session called <span style="font-family:Georgia,serif;font-style:italic;">' + esc(o.event_name) + '</span> — the handful of things that separate a capable CFO from a great one. Not a webinar, not a pitch. You’ll work through the drivers with peers who’ve sat where you sit, and leave with sharper questions than you walked in with.</p>' +
  '</td></tr>' +
  '<tr><td style="padding:0 36px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6ee;border:1px solid #e7e0cd;border-radius:4px;"><tr><td style="padding:18px 22px;font-family:Arial,Helvetica,sans-serif;color:#20242f;font-size:15px;line-height:1.7;">' +
  '<strong style="color:#121a3c;">' + esc(o.when_line) + '</strong><br>' + esc(o.hosted_line) + '<br>Coffee and a light breakfast &middot; parking validated<br>' +
  '<span style="color:#54596b;">Complimentary. Nothing is sold, and there’s nothing to sit through — just the work.</span>' +
  '</td></tr></table></td></tr>' +
  '<tr><td align="center" style="padding:28px 36px 10px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#c39a4e;border-radius:3px;"><a href="' + o.rsvp_url + '" style="display:inline-block;padding:15px 34px;color:#121a3c;font-weight:bold;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;">Reserve my seat &rarr;</a></td></tr></table></td></tr>' +
  '<tr><td align="center" style="padding:0 36px 26px;font-family:Arial,Helvetica,sans-serif;color:#54596b;font-size:13px;">The room is kept deliberately small, so grab a seat if it’s a fit.</td></tr>' +
  '<tr><td style="padding:0 36px 6px;font-family:Arial,Helvetica,sans-serif;color:#20242f;">' +
  '<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#54596b;">If you’d like me to keep you in the loop on future CFO gatherings around LA — workshops, happy hours, the occasional sporting event — just reply and I’ll add you. Only what’s relevant; no newsletters, no pitches.</p>' +
  '<p style="margin:0 0 4px;font-size:16px;line-height:1.6;">Looking forward to it,<br>Dalen</p>' +
  '<p style="margin:0 0 2px;font-family:Georgia,serif;font-size:15px;color:#121a3c;">Dalen Lawrence</p>' +
  '<p style="margin:0 0 30px;font-size:13px;color:#54596b;">Chapter Director &middot; CFO Circle, Los Angeles</p>' +
  '</td></tr>' +
  '<tr><td style="background:#121a3c;padding:24px 36px;font-family:Arial,Helvetica,sans-serif;">' +
  '<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#c5cce4;">My aim here is to build a real community of Los Angeles CFOs — not a mailing list. If that’s not where you are right now, <a href="' + o.unsub_url + '" style="color:#d8b779;text-decoration:underline;">unsubscribe with one click</a>. No offense taken, and you’re always welcome back.</p>' +
  '<p style="margin:0;font-size:11px;line-height:1.5;color:#9aa3c6;">CFO Circle &middot; Los Angeles &nbsp;|&nbsp; ' + esc(FOOTER_ADDRESS) + '</p>' +
  '</td></tr></table></td></tr></table></body></html>'
}

async function getToken(sb, personId) {
  const { data: ex } = await sb.from("track_tokens").select("token").eq("person_id", personId).limit(1).maybeSingle()
  if (ex && ex.token) return ex.token
  const { data: m } = await sb.from("track_tokens").insert({ person_id: personId }).select("token").single()
  return m ? m.token : null
}

async function resendBatch(items) {
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.RESEND_API_KEY },
    body: JSON.stringify(items),
  })
  const text = await res.text().catch(() => "")
  let data = {}; try { data = JSON.parse(text) } catch (e) {}
  return { ok: res.ok, status: res.status, data, text }
}

export async function POST(req) {
  const auth = req.headers.get("authorization") || ""
  const expected = "Bearer " + (process.env.CRON_SECRET || "cfocircle2026")
  if (auth !== expected) return json({ error: "unauthorized" }, 401)

  let body = {}
  try { body = await req.json() } catch { return json({ error: "bad_request" }, 400) }
  const slug = String(body.slug || "").trim()
  const dryRun = body.dry_run !== false
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 25, 1), 100)
  const excludeFractional = body.exclude_fractional !== false
  const testTo = String(body.test_to || "").trim()
  if (!slug) return json({ error: "missing_slug" }, 400)

  const sb = serverClient()
  const { data: ev } = await sb.from("events")
    .select("id, slug, name, event_date, ends_at, location").eq("slug", slug).eq("published", true).maybeSingle()
  if (!ev) return json({ error: "event_not_found" }, 404)

  const whenLine = laLong(ev.event_date) + (laTime(ev.event_date) ? " · " + laTime(ev.event_date) + "–" + laTime(ev.ends_at) : "")
  const whenShort = laLong(ev.event_date)
  const hostedLine = "Hosted by Armanino — " + (ev.location || "Century City")
  const subject = "An invitation — " + ev.name + ", " + laShort(ev.event_date) + " (Century City)"

  // ---- test send: one sample to a single address ----
  if (testTo) {
    const html = renderInviteHtml({
      first_name: body.first_name || "there",
      rsvp_url: SITE + "/events/" + slug + "/?src=test",
      unsub_url: PC + "/api/unsubscribe?t=TEST",
      event_name: ev.name, when_line: whenLine, when_line_short: whenShort, hosted_line: hostedLine,
    })
    const r = await resendBatch([{
      from: FROM, to: [testTo], reply_to: REPLY_TO, subject: "[TEST] " + subject, html,
      headers: { "List-Unsubscribe": "<" + PC + "/api/unsubscribe?t=TEST>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }])
    return json({ ok: r.ok, mode: "test", to: testTo, resend_status: r.status, detail: r.ok ? undefined : r.text.slice(0, 300) })
  }

  // ---- build audience ----
  const { data: cand } = await sb.from("people")
    .select("id, first_name, full_name, email, email2, title, headline, email_consent, email_suppressed")
    .contains("roles", ["cfo"]).eq("linkedin_connected", true).eq("market", "los_angeles")
  const candidates = cand || []

  // already sent this invite?
  const { data: sent } = await sb.from("email_sends").select("person_id").eq("event_id", ev.id).eq("kind", "event_invite")
  const sentSet = new Set((sent || []).map(r => r.person_id))
  // already on the roster (don't re-invite someone who's registered/confirmed/etc.)
  const { data: att } = await sb.from("event_attendees").select("person_id, status").eq("event_id", ev.id)
  const rosterSkip = new Set((att || []).filter(r => ["Registered", "Requested", "Confirmed", "Attended", "Declined"].includes(r.status)).map(r => r.person_id))

  const eligible = candidates.filter(function (p) {
    const email = (p.email && p.email.trim()) || (p.email2 && p.email2.trim())
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return false
    if (p.email_consent === "unsubscribed") return false
    if (p.email_suppressed === true) return false
    if (sentSet.has(p.id)) return false
    if (rosterSkip.has(p.id)) return false
    if (excludeFractional && FRACTIONAL.test(((p.title || "") + " " + (p.headline || "")).toLowerCase())) return false
    return true
  })

  const totalEligible = eligible.length
  const batch = eligible.slice(0, limit)

  if (dryRun) {
    return json({
      ok: true, mode: "dry_run", event: ev.slug, subject,
      total_eligible: totalEligible, would_send_now: batch.length,
      remaining_after: Math.max(totalEligible - batch.length, 0),
      sample: batch.slice(0, 12).map(p => ({ name: p.full_name || p.first_name, email: (p.email || p.email2) })),
    })
  }

  // ---- live send (batched) ----
  const items = []
  const meta = []
  for (const p of batch) {
    const email = (p.email && p.email.trim()) || (p.email2 && p.email2.trim())
    const token = await getToken(sb, p.id)
    if (!token) continue
    const rsvp = SITE + "/events/" + slug + "/?t=" + encodeURIComponent(token) + "&src=email"
    const unsub = PC + "/api/unsubscribe?t=" + encodeURIComponent(token)
    const html = renderInviteHtml({
      first_name: p.first_name || (p.full_name || "there").split(" ")[0],
      rsvp_url: rsvp, unsub_url: unsub,
      event_name: ev.name, when_line: whenLine, when_line_short: whenShort, hosted_line: hostedLine,
    })
    items.push({
      from: FROM, to: [email], reply_to: REPLY_TO, subject, html,
      headers: { "List-Unsubscribe": "<" + unsub + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    })
    meta.push({ person_id: p.id, email })
  }

  if (!items.length) return json({ ok: true, mode: "send", sent: 0, total_eligible: totalEligible, note: "nothing to send" })

  const r = await resendBatch(items)
  if (!r.ok) return json({ ok: false, mode: "send", error: "resend_failed", status: r.status, detail: r.text.slice(0, 300) }, 502)

  const ids = (r.data && Array.isArray(r.data.data)) ? r.data.data : []
  const nowIso = new Date().toISOString()
  const sendRows = meta.map((m, i) => ({
    person_id: m.person_id, event_id: ev.id, kind: "event_invite",
    subject, resend_id: ids[i] && ids[i].id ? ids[i].id : null, status: "sent", sent_at: nowIso,
  }))
  await sb.from("email_sends").insert(sendRows)

  // Mark Invited on the roster (don't clobber an existing row).
  for (const m of meta) {
    const { data: row } = await sb.from("event_attendees").select("id").eq("event_id", ev.id).eq("person_id", m.person_id).maybeSingle()
    if (!row) await sb.from("event_attendees").insert({ event_id: ev.id, person_id: m.person_id, status: "Invited", invited_at: nowIso, source: "email-invite" })
  }

  return json({
    ok: true, mode: "send", event: ev.slug, sent: meta.length,
    total_eligible: totalEligible, remaining_after: Math.max(totalEligible - meta.length, 0),
  })
}
