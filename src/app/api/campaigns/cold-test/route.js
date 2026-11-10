export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* Read-only monitor for the cold-test (plus a fail-safe disarm).
   GET  -> gate verdict + totals + batches (from /api/events/cold-test-status),
           drip config, and audience counts.
   POST {action:"disarm"} -> sets cold_drip.armed=false. There is deliberately NO
           arm action here: arming is a deliberate step, not a button on an open URL. */

const KEY = "cold_drip"

async function cfg(sb) {
  const { data } = await sb.from("system_settings").select("value").eq("key", KEY).maybeSingle()
  try { return data && data.value ? JSON.parse(data.value) : {} } catch (e) { return {} }
}

export async function GET(req) {
  const sb = serverClient()
  const c = await cfg(sb)
  const slug = c.slug || "november-happy-hour"
  const origin = process.env.INTERNAL_ORIGIN || "https://www.peerchair.com"
  let status = null
  try {
    const r = await fetch(origin + "/api/events/cold-test-status?slug=" + encodeURIComponent(slug), {
      headers: { Authorization: "Bearer " + (process.env.CRON_SECRET || "") }, cache: "no-store",
    })
    status = await r.json()
  } catch (e) { status = { error: String(e.message || e) } }

  const [{ count: total }, { count: unsub }, { count: supp }] = await Promise.all([
    sb.from("people").select("id", { count: "exact", head: true }).eq("email_consent", "cold_test"),
    sb.from("people").select("id", { count: "exact", head: true }).eq("origin_vendor", "apollo").eq("email_consent", "unsubscribed"),
    sb.from("people").select("id", { count: "exact", head: true }).eq("origin_vendor", "apollo").eq("email_suppressed", true),
  ])
  const { data: recent } = await sb.from("people")
    .select("id, full_name, company, email_consent, email_suppressed, email_unsubscribed_at, email_unsub_reason")
    .eq("origin_vendor", "apollo").or("email_consent.eq.unsubscribed,email_suppressed.eq.true")
    .order("email_unsubscribed_at", { ascending: false, nullsFirst: false }).limit(15)

  // ---- engagement: email opens/clicks (Resend) + RSVP-page behaviour (site tracking, attributed by token) ----
  const { data: sends } = await sb.from("email_sends").select("id, person_id").eq("kind", "event_invite_cold")
  const sentIds = Array.from(new Set((sends || []).map(x => x.person_id).filter(Boolean)))
  const eng = { opened: 0, open_events: 0, clicked: 0, viewed: 0, engaged: 0, register_clicks: 0, registered: 0, hot: [] }
  if (sentIds.length) {
    const [{ data: em }, { data: pe }, { data: ppl }] = await Promise.all([
      sb.from("email_events").select("person_id, event_type, occurred_at").in("person_id", sentIds),
      sb.from("page_events").select("person_id, event, created_at").in("person_id", sentIds).eq("page", "event:" + slug).eq("is_bot", false),
      sb.from("people").select("id, full_name, title, company").in("id", sentIds),
    ])
    const by = {}
    const touch = (id) => (by[id] = by[id] || { opens: 0, clicks: 0, viewed: false, engaged: false, reg_click: false, registered: false, last: null })
    const stamp = (o, t) => { if (t && (!o.last || t > o.last)) o.last = t }
    for (const e of em || []) {
      const o = touch(e.person_id)
      if (e.event_type === "opened") { o.opens++; eng.open_events++ }
      if (e.event_type === "clicked") o.clicks++
      stamp(o, e.occurred_at)
    }
    for (const e of pe || []) {
      const o = touch(e.person_id)
      if (e.event === "view") o.viewed = true
      if (e.event === "engaged") o.engaged = true
      if (e.event === "hero_register_click" || e.event === "sticky_register_click") o.reg_click = true
      if (e.event === "event_registered" || e.event === "registration_submitted") o.registered = true
      stamp(o, e.created_at)
    }
    const names = {}
    for (const p of ppl || []) names[p.id] = p
    for (const id of Object.keys(by)) {
      const o = by[id]
      if (o.opens) eng.opened++
      if (o.clicks) eng.clicked++
      if (o.viewed) eng.viewed++
      if (o.engaged) eng.engaged++
      if (o.reg_click) eng.register_clicks++
      if (o.registered) eng.registered++
      if (o.viewed || o.reg_click || o.registered || o.clicks) {
        const p = names[id] || {}
        eng.hot.push({ id, name: p.full_name, title: p.title, company: p.company, opens: o.opens, clicked: o.clicks > 0, viewed: o.viewed, reg_click: o.reg_click, registered: o.registered, last: o.last })
      }
    }
    eng.hot.sort((a, b) => (b.registered - a.registered) || (b.reg_click - a.reg_click) || String(b.last).localeCompare(String(a.last)))
  }

  return Response.json({ slug, config: c, status, engagement: eng, audience: { cold_test_total: total || 0, unsubscribed: unsub || 0, suppressed: supp || 0 }, opt_outs: recent || [] })
}

export async function POST(req) {
  let body = {}
  try { body = await req.json() } catch (e) {}
  if (body.action !== "disarm") return Response.json({ error: "only disarm is supported" }, { status: 400 })
  const sb = serverClient()
  const c = await cfg(sb)
  c.armed = false
  await sb.from("system_settings").update({ value: JSON.stringify(c), updated_at: new Date().toISOString() }).eq("key", KEY)
  return Response.json({ ok: true, armed: false })
}
