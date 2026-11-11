export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* Cold-test monitor. GET ?slug=<event slug>  (Authorization: Bearer <CRON_SECRET>)

   Returns per-batch and cumulative counts for the cold-test sends of one event,
   plus a GO / WAIT / HOLD verdict for releasing the next batch:
     HOLD  any spam complaint, or bounce rate over 2% (cumulative)
     WAIT  fewer than 45 min since the last batch, or under 90% of sends resolved
     GO    otherwise
   Batches are grouped by sent_at (every row of one send call shares it). */

const MAX_BOUNCE = 0.02
const MIN_GAP_MIN = 45
const MIN_RESOLVED = 0.9
const RESOLVED = new Set(["delivered", "bounced", "complained", "failed", "suppressed"])

export async function GET(req) {
  const auth = req.headers.get("authorization") || ""
  if (!process.env.CRON_SECRET || auth !== "Bearer " + process.env.CRON_SECRET) return Response.json({ error: "unauthorized" }, { status: 401 })

  const slug = new URL(req.url).searchParams.get("slug") || "november-happy-hour"
  const sb = serverClient()
  const { data: ev } = await sb.from("events").select("id, slug, name").eq("slug", slug).maybeSingle()
  if (!ev) return Response.json({ error: "event_not_found" }, { status: 404 })

  const { data: sends } = await sb.from("email_sends")
    .select("person_id, status, sent_at").eq("event_id", ev.id).eq("kind", "event_invite_cold").order("sent_at")
  const rows = sends || []
  const ids = rows.map(r => r.person_id)

  let unsubscribed = 0, suppressed = 0, rsvps = 0, rsvpNames = []
  if (ids.length) {
    const { data: ppl } = await sb.from("people").select("id, email_consent, email_suppressed").in("id", ids)
    for (const p of ppl || []) {
      if (p.email_consent === "unsubscribed") unsubscribed++
      if (p.email_suppressed === true) suppressed++
    }
    const { data: att } = await sb.from("event_attendees").select("person_id, status").eq("event_id", ev.id).in("person_id", ids)
    const hit = (att || []).filter(a => ["Requested", "Registered", "Confirmed"].includes(a.status))
    rsvps = hit.length
  }

  const batches = {}
  for (const r of rows) {
    const k = r.sent_at
    if (!batches[k]) batches[k] = { sent_at: k, sent: 0, delivered: 0, delayed: 0, bounced: 0, complained: 0, failed: 0, pending: 0 }
    const b = batches[k]
    b.sent++
    if (r.status === "delivered") b.delivered++
    else if (r.status === "delayed") b.delayed++
    else if (r.status === "bounced") b.bounced++
    else if (r.status === "complained") b.complained++
    else if (r.status === "failed" || r.status === "suppressed") b.failed++
    else b.pending++
  }
  const list = Object.values(batches)

  const total = rows.length
  const t = (f) => rows.filter(f).length
  const delivered = t(r => r.status === "delivered")
  const bounced = t(r => r.status === "bounced" || r.status === "failed" || r.status === "suppressed")
  const complained = t(r => r.status === "complained")
  const resolved = t(r => RESOLVED.has(r.status))
  const bounceRate = total ? bounced / total : 0
  const lastAt = rows.length ? new Date(rows[rows.length - 1].sent_at).getTime() : 0
  const minSince = rows.length ? Math.round((Date.now() - lastAt) / 60000) : null

  let verdict = "GO", reason = "no sends yet"
  if (total) {
    if (complained > 0) { verdict = "HOLD"; reason = complained + " spam complaint(s)" }
    else if (total < 30 && bounced >= 2) { verdict = "HOLD"; reason = bounced + " bounces in the first " + total + " sends (small-sample rule: 2+ trips the gate)" }
    else if (total >= 30 && bounceRate > MAX_BOUNCE) { verdict = "HOLD"; reason = "bounce rate " + (bounceRate * 100).toFixed(1) + "% (limit 2%)" }
    else if (minSince < MIN_GAP_MIN) { verdict = "WAIT"; reason = minSince + " min since last batch (need " + MIN_GAP_MIN + ")" }
    else if (resolved / total < MIN_RESOLVED) { verdict = "WAIT"; reason = Math.round(100 * resolved / total) + "% of sends resolved (need 90%)" }
    else { verdict = "GO"; reason = "gates clear" }
  }

  return Response.json({
    ok: true, event: ev.slug, verdict, reason,
    totals: {
      sent: total, delivered, bounced, complained, resolved, pending: total - resolved,
      bounce_rate_pct: Number((bounceRate * 100).toFixed(2)),
      unsubscribed, unsubscribe_rate_pct: total ? Number((100 * unsubscribed / total).toFixed(2)) : 0,
      suppressed, rsvps, minutes_since_last_batch: minSince,
    },
    batches: list,
  })
}
