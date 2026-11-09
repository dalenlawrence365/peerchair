export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { renderColdInviteHtml, coldSubject } from "@/lib/coldInviteEmail"

/* COLD-TEST invite sender (happy hour). Separate from /api/events/send-invite on
   purpose: that route only ever mails explicit opt-ins (email_consent='subscribed');
   nothing here can widen it.

   Audience: people.email_consent = 'cold_test' AND market = 'los_angeles' (the Apollo
   import, 2026-11). Excludes: unsubscribed (consent flips off 'cold_test'), suppressed,
   already sent this event, already on the roster, non-CFO titles, a company already
   mailed for this event, and a second person at the same company in the same batch.

   Safety:
   - Auth-gated (Bearer CRON_SECRET). dry_run defaults TRUE.
   - Happy-hour events only (the copy is happy-hour specific).
   - Sends from the dedicated subdomain (COLD_FROM), never the root domain.
   - Hard daily cap (COLD_DAILY_CAP, default 100) across all batches; batch limit max 50.
   - Every send is logged to email_sends with kind='event_invite_cold'; delivery
     outcomes arrive via /api/webhooks/resend; /api/events/cold-test-status gates batches.

   POST body: { slug, dry_run=true, limit=25, test_to?, first_name?, company? }
   Header:    Authorization: Bearer <CRON_SECRET> */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}
function json(b, s = 200) { return Response.json(b, { status: s, headers: CORS }) }
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }

const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"
const PC = "https://www.peerchair.com"
const FROM = process.env.COLD_FROM || "Dalen Lawrence <invites@events.la-cfo.com>"
const REPLY_TO = "events@la-cfo.com"
const KIND = "event_invite_cold"
const DAILY_CAP = parseInt(process.env.COLD_DAILY_CAP, 10) || 100
const CFO_TITLE = /\bcfo\b|chief financial|chief finance/i

function laPart(iso, opts) { try { return new Date(iso).toLocaleString("en-US", Object.assign({ timeZone: "America/Los_Angeles" }, opts)) } catch (e) { return "" } }
function laDayKey(iso) { return laPart(iso, { year: "numeric", month: "2-digit", day: "2-digit" }) }
function timeRange(startIso, endIso) {
  const a = laPart(startIso, { hour: "numeric", minute: "2-digit" }).replace(":00", "")
  const b = laPart(endIso, { hour: "numeric", minute: "2-digit" }).replace(":00", "")
  const am = a.split(" ")[1], bm = b.split(" ")[1]
  return (am && am === bm ? a.split(" ")[0] : a) + "–" + b
}
function cleanCompany(c) { return String(c || "").replace(/\s+/g, " ").trim() }

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
  if (!process.env.CRON_SECRET || auth !== "Bearer " + process.env.CRON_SECRET) return json({ error: "unauthorized" }, 401)

  let body = {}
  try { body = await req.json() } catch { return json({ error: "bad_request" }, 400) }
  const slug = String(body.slug || "").trim()
  const dryRun = body.dry_run !== false
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 25, 1), 50)
  const testTo = String(body.test_to || "").trim()
  if (!slug) return json({ error: "missing_slug" }, 400)

  const sb = serverClient()
  const { data: ev } = await sb.from("events")
    .select("id, slug, name, event_date, ends_at, location, kind, host_name").eq("slug", slug).eq("published", true).maybeSingle()
  if (!ev) return json({ error: "event_not_found" }, 404)
  if (ev.kind !== "happy_hour") return json({ error: "cold_test_supports_happy_hour_only" }, 400)

  const common = {
    weekday: laPart(ev.event_date, { weekday: "long" }),
    when_short: laPart(ev.event_date, { weekday: "long", month: "long", day: "numeric" }),
    time_range: timeRange(ev.event_date, ev.ends_at),
    location: ev.location || "Culver City",
    host_name: ev.host_name || "our host",
  }
  const subject = coldSubject(common)

  // ---- test send: one sample to a single address ----
  if (testTo) {
    const html = renderColdInviteHtml(Object.assign({}, common, {
      first_name: body.first_name || "there", company: body.company || "Example Co", is_cfo: true,
      rsvp_url: SITE + "/events/" + slug + "/?src=cold-test", unsub_url: PC + "/api/unsubscribe?t=TEST",
    }))
    const r = await resendBatch([{
      from: FROM, to: [testTo], reply_to: REPLY_TO, subject: "[TEST] " + subject, html,
      headers: { "List-Unsubscribe": "<" + PC + "/api/unsubscribe?t=TEST>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }])
    return json({ ok: r.ok, mode: "test", to: testTo, from: FROM, subject, resend_status: r.status, detail: r.ok ? undefined : r.text.slice(0, 300) })
  }

  // ---- build audience ----
  const { data: cand } = await sb.from("people")
    .select("id, first_name, full_name, email, email2, title, company, email_consent, email_suppressed")
    .eq("email_consent", "cold_test").eq("market", "los_angeles")
  const candidates = cand || []

  const { data: sent } = await sb.from("email_sends").select("person_id, sent_at").eq("event_id", ev.id).eq("kind", KIND)
  const sentSet = new Set((sent || []).map(r => r.person_id))
  const todayKey = laDayKey(new Date().toISOString())
  const sentToday = (sent || []).filter(r => laDayKey(r.sent_at) === todayKey).length
  const room = Math.max(DAILY_CAP - sentToday, 0)

  const { data: att } = await sb.from("event_attendees").select("person_id, status").eq("event_id", ev.id)
  const rosterSkip = new Set((att || []).filter(r => ["Registered", "Requested", "Confirmed", "Attended", "Declined"].includes(r.status)).map(r => r.person_id))

  // companies already mailed for this event (one CFO per company, ever, for this test)
  const sentCompanies = new Set()
  if (sentSet.size) {
    const { data: sp } = await sb.from("people").select("id, company").in("id", Array.from(sentSet))
    for (const p of sp || []) { const c = cleanCompany(p.company).toLowerCase(); if (c) sentCompanies.add(c) }
  }

  const eligible = candidates.filter(function (p) {
    const email = (p.email && p.email.trim()) || (p.email2 && p.email2.trim())
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return false
    if (/\.invalid$|-inactive@/i.test(email) || /\.gov$/i.test(email)) return false
    if (p.email_suppressed === true) return false
    if (sentSet.has(p.id) || rosterSkip.has(p.id)) return false
    if (!CFO_TITLE.test(p.title || "")) return false
    const c = cleanCompany(p.company).toLowerCase()
    if (c && sentCompanies.has(c)) return false
    return true
  })

  const batch = []
  const seen = new Set()
  for (const p of eligible) {
    if (batch.length >= Math.min(limit, room)) break
    const c = cleanCompany(p.company).toLowerCase()
    if (c && seen.has(c)) continue
    if (c) seen.add(c)
    batch.push(p)
  }

  if (dryRun) {
    return json({
      ok: true, mode: "dry_run", event: ev.slug, from: FROM, subject,
      total_eligible: eligible.length, would_send_now: batch.length,
      daily_cap: DAILY_CAP, sent_today: sentToday, room_today: room,
      sample: batch.slice(0, 12).map(p => ({ name: p.full_name || p.first_name, company: p.company, email: (p.email || p.email2) })),
    })
  }
  if (!batch.length) return json({ ok: true, mode: "send", sent: 0, total_eligible: eligible.length, room_today: room, note: room ? "nothing to send" : "daily cap reached" })

  // ---- live send (batched) ----
  const items = [], meta = []
  for (const p of batch) {
    const email = (p.email && p.email.trim()) || (p.email2 && p.email2.trim())
    const token = await getToken(sb, p.id)
    if (!token) continue
    const unsub = PC + "/api/unsubscribe?t=" + encodeURIComponent(token)
    const html = renderColdInviteHtml(Object.assign({}, common, {
      first_name: p.first_name || (p.full_name || "there").split(" ")[0],
      company: cleanCompany(p.company), is_cfo: CFO_TITLE.test(p.title || ""),
      rsvp_url: SITE + "/events/" + slug + "/?t=" + encodeURIComponent(token) + "&src=cold-email",
      unsub_url: unsub,
    }))
    items.push({
      from: FROM, to: [email], reply_to: REPLY_TO, subject, html,
      headers: { "List-Unsubscribe": "<" + unsub + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      tags: [{ name: "campaign", value: "cold_test_hh" }],
    })
    meta.push({ person_id: p.id, email })
  }
  if (!items.length) return json({ ok: true, mode: "send", sent: 0, total_eligible: eligible.length, note: "no tokens" })

  const r = await resendBatch(items)
  if (!r.ok) return json({ ok: false, mode: "send", error: "resend_failed", status: r.status, detail: r.text.slice(0, 300) }, 502)

  const ids = (r.data && Array.isArray(r.data.data)) ? r.data.data : []
  const nowIso = new Date().toISOString()
  await sb.from("email_sends").insert(meta.map((m, i) => ({
    person_id: m.person_id, event_id: ev.id, kind: KIND,
    subject, resend_id: ids[i] && ids[i].id ? ids[i].id : null, status: "sent", sent_at: nowIso,
  })))
  for (const m of meta) {
    const { data: row } = await sb.from("event_attendees").select("id").eq("event_id", ev.id).eq("person_id", m.person_id).maybeSingle()
    if (!row) await sb.from("event_attendees").insert({ event_id: ev.id, person_id: m.person_id, status: "Invited", invited_at: nowIso, source: "cold-test" })
  }

  return json({
    ok: true, mode: "send", event: ev.slug, sent: meta.length, sent_at: nowIso,
    total_eligible: eligible.length, remaining_after: Math.max(eligible.length - meta.length, 0),
    sent_today: sentToday + meta.length, daily_cap: DAILY_CAP,
  })
}
