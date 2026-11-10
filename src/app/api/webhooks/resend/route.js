export const dynamic = "force-dynamic"
export const runtime = "nodejs"
import { serverClient } from "@/lib/supabaseServer"
import { verifySvix } from "@/lib/svixVerify"

/* Resend delivery webhook. Resend POSTs delivered / bounced / complained / delayed
   events here; we write them back onto email_sends so a send is no longer "sent and
   hope". Signature-verified (Svix scheme) and FAIL-CLOSED: no RESEND_WEBHOOK_SECRET
   -> 500, nothing is trusted.

   Status only moves forward (sent < delayed < delivered < bounced/failed/suppressed < complained),
   so a late "delivered" can't overwrite a "bounced".

   Suppression: a permanent bounce or a complaint sets people.email_suppressed = true
   (excluded from every future send). A complaint also flips email_consent to
   'unsubscribed'. Transient bounces / delays never suppress. */

const MAP = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
}
const RANK = { sent: 0, delayed: 1, delivered: 2, bounced: 3, failed: 3, suppressed: 3, complained: 4 }

function ok(b) { return Response.json(b || { ok: true }, { status: 200 }) }

export async function POST(req) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return Response.json({ error: "webhook_secret_not_configured" }, { status: 500 })

  const raw = await req.text()
  const good = verifySvix(
    secret,
    req.headers.get("svix-id"),
    req.headers.get("svix-timestamp"),
    raw,
    req.headers.get("svix-signature"),
  )
  if (!good) return Response.json({ error: "bad_signature" }, { status: 401 })

  let ev = {}
  try { ev = JSON.parse(raw) } catch { return ok({ ok: true, ignored: "bad_json" }) }

  const status = MAP[ev.type]
  const d = ev.data || {}
  const emailId = d.email_id
  const ENGAGE = { "email.opened": "opened", "email.clicked": "clicked" }
  if (!emailId || (!status && !ENGAGE[ev.type])) return ok({ ok: true, ignored: ev.type || "no_type" })

  const sb = serverClient()
  const { data: row } = await sb.from("email_sends").select("id, person_id, status").eq("resend_id", emailId).maybeSingle()
  if (!row) return ok({ ok: true, ignored: "unknown_email_id" }) // e.g. a system email, not a tracked send

  // Engagement events (open / click) are appended to email_events, never touching delivery status.
  // Deduped on the Svix message id so a retried webhook can't double-count.
  if (ENGAGE[ev.type]) {
    const click = d.click || {}
    await sb.from("email_events").upsert({
      provider_event_id: req.headers.get("svix-id"),
      email_send_id: row.id,
      person_id: row.person_id,
      event_type: ENGAGE[ev.type],
      occurred_at: ev.created_at || d.created_at || new Date().toISOString(),
      meta: ENGAGE[ev.type] === "clicked" ? { link: click.link || null } : null,
    }, { onConflict: "provider_event_id", ignoreDuplicates: true })
    return ok({ ok: true, recorded: ENGAGE[ev.type] })
  }

  const cur = RANK[row.status] == null ? 0 : RANK[row.status]
  if (RANK[status] >= cur) {
    const patch = { status }
    if (status === "bounced" || status === "failed" || status === "suppressed") {
      const b = d.bounce || {}
      patch.error = String([b.type, b.subType, b.message].filter(Boolean).join(" | ") || ev.type).slice(0, 300)
    }
    if (status === "complained") patch.error = "spam complaint"
    await sb.from("email_sends").update(patch).eq("id", row.id)
  }

  const permanentBounce = status === "bounced" && String((d.bounce || {}).type || "").toLowerCase() === "permanent"
  if (row.person_id && (permanentBounce || status === "complained" || status === "suppressed")) {
    const upd = { email_suppressed: true }
    if (status === "complained") {
      upd.email_consent = "unsubscribed"
      upd.email_unsubscribed_at = new Date().toISOString()
      upd.email_unsub_reason = "complaint"
    }
    await sb.from("people").update(upd).eq("id", row.person_id)
  }

  return ok({ ok: true, status })
}
