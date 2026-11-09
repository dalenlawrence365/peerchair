export const dynamic = "force-dynamic"
export const maxDuration = 60
import { serverClient } from "@/lib/supabaseServer"
import { sendAlert } from "@/lib/notify"

/* Cold-test drip. Vercel Cron calls this every 10 minutes with
   Authorization: Bearer $CRON_SECRET (Vercel adds it automatically).

   It does nothing unless the setting system_settings.cold_drip says armed=true:
     { "armed": false, "slug": "november-happy-hour", "batch_sizes": [25,30,35],
       "window": [9,17], "test_to": null }
   Each tick (armed):
     1. outside the LA send window            -> idle
     2. status gate (cold-test-status)        -> HOLD: disarm + alert / WAIT: idle / GO: continue
     3. send the next batch (size by batch #) -> alert Dalen with the numbers
     4. nothing left to send                  -> disarm + alert "finished"
   test_to: if set, sends ONE sample to that address, clears test_to, and stops.
   Disarm at any time by setting armed=false. */

const KEY = "cold_drip"

async function load(sb) {
  const { data } = await sb.from("system_settings").select("value").eq("key", KEY).maybeSingle()
  try { return data && data.value ? JSON.parse(data.value) : null } catch (e) { return null }
}
async function save(sb, cfg) {
  await sb.from("system_settings").update({ value: JSON.stringify(cfg), updated_at: new Date().toISOString() }).eq("key", KEY)
}
function laHour() {
  return parseInt(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Los_Angeles" }), 10) % 24
}

export async function GET(req) {
  const auth = req.headers.get("authorization") || ""
  if (!process.env.CRON_SECRET || auth !== "Bearer " + process.env.CRON_SECRET) return Response.json({ error: "unauthorized" }, { status: 401 })

  const sb = serverClient()
  const cfg = await load(sb)
  if (!cfg) return Response.json({ ok: true, idle: "no_config" })

  // Internal calls must hit the production domain: the per-deployment *.vercel.app URL is behind Vercel deployment protection (401).
  const origin = process.env.INTERNAL_ORIGIN || "https://www.peerchair.com"
  const H = { "Authorization": "Bearer " + process.env.CRON_SECRET, "Content-Type": "application/json" }
  const slug = cfg.slug || "november-happy-hour"

  // ---- one-off test send ----
  if (cfg.test_to) {
    const to = cfg.test_to
    cfg.test_to = null
    await save(sb, cfg) // clear first so a failure can't loop
    const r = await fetch(origin + "/api/events/send-cold-invite", { method: "POST", headers: H, body: JSON.stringify({ slug, test_to: to, first_name: "Dalen", company: "Example Co" }) })
    const j = await r.json().catch(() => ({}))
    await sendAlert("Cold test: test email " + (j.ok ? "sent" : "FAILED"), "Test send to " + to + ": " + JSON.stringify(j).slice(0, 300))
    return Response.json({ ok: true, test: j })
  }

  if (!cfg.armed) return Response.json({ ok: true, idle: "not_armed" })

  const w = cfg.window || [9, 17]
  const h = laHour()
  if (h < w[0] || h >= w[1]) return Response.json({ ok: true, idle: "outside_window", la_hour: h })

  const sres = await fetch(origin + "/api/events/cold-test-status?slug=" + encodeURIComponent(slug), { headers: H, cache: "no-store" })
  const st = await sres.json().catch(() => ({}))
  if (!sres.ok || !st.verdict) return Response.json({ ok: false, error: "status_failed", detail: st })

  if (st.verdict === "HOLD") {
    cfg.armed = false
    await save(sb, cfg)
    await sendAlert("Cold test HOLD — drip disarmed", "Reason: " + st.reason + ". Totals: " + JSON.stringify(st.totals))
    return Response.json({ ok: true, held: st.reason })
  }
  if (st.verdict === "WAIT") return Response.json({ ok: true, idle: "wait", reason: st.reason })

  const sizes = Array.isArray(cfg.batch_sizes) && cfg.batch_sizes.length ? cfg.batch_sizes : [25, 30, 35]
  const n = (st.batches || []).length
  const limit = sizes[Math.min(n, sizes.length - 1)]

  const r = await fetch(origin + "/api/events/send-cold-invite", { method: "POST", headers: H, body: JSON.stringify({ slug, dry_run: false, limit }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.ok) {
    cfg.armed = false
    await save(sb, cfg)
    await sendAlert("Cold test: send FAILED — drip disarmed", JSON.stringify(j).slice(0, 400))
    return Response.json({ ok: false, error: "send_failed", detail: j })
  }

  const done = !j.sent || j.remaining_after === 0
  if (done) { cfg.armed = false; await save(sb, cfg) }
  await sendAlert(
    done ? "Cold test: FINISHED" : "Cold test: batch " + (n + 1) + " sent",
    "Sent " + (j.sent || 0) + " this batch (" + (j.sent_today || 0) + " today, cap " + (j.daily_cap || "?") + "). Remaining: " + (j.remaining_after == null ? "?" : j.remaining_after) +
    ". Gate before this batch: " + st.reason + "." + (done ? " Drip disarmed." : " Next batch after the gate clears.")
  )
  return Response.json({ ok: true, sent: j.sent, remaining_after: j.remaining_after, done })
}
