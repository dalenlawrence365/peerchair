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
  const origin = new URL(req.url).origin
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

  return Response.json({ slug, config: c, status, audience: { cold_test_total: total || 0, unsubscribed: unsub || 0, suppressed: supp || 0 }, opt_outs: recent || [] })
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
