export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { PC, FROM, REPLY_TO, getToken, sendResend, welcomeHtml, declineHtml } from "@/lib/cfoCircleEmail"

/* Approve / decline a pending invitation-list signup.

   approve  -> email_consent='subscribed', add the 'cfo' role (Dalen just
               confirmed the seat), clear the 'unmatched' flag, and send a
               branded HTML welcome via Resend. The welcome doubles as an
               email-validity check — a hard bounce means the address is bad.
   decline  -> email_consent='rejected' and send the gracious "CFOs only"
               note (Option A) via Resend.

   Same-origin admin action (called from the Subscribers page), matching the
   codebase's other app-internal mutation routes. */

// Email builders (welcome / decline Option A) + Resend send live in
// @/lib/cfoCircleEmail — shared with the event roster's decline action.

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
