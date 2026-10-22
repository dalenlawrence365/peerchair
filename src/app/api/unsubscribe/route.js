export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* Unsubscribe from CFO event invitations.

   Every send injects this person's tokenized link:
     https://www.peerchair.com/api/unsubscribe?t=<track_token>
   and the matching one-click header:
     List-Unsubscribe: <https://www.peerchair.com/api/unsubscribe?t=TOKEN>
     List-Unsubscribe-Post: List-Unsubscribe=One-Click

   PeerChair stays the source of truth: unsubscribing flips email_consent to
   'unsubscribed' on the person, and the send flow only pulls
   email_consent='subscribed' AND email_suppressed IS NOT TRUE — so an opt-out
   auto-excludes them from every future send with no manual scrubbing.

   GET  = the visible link in the email body. Flip, then redirect to the
          friendly confirmation page (which offers an OPTIONAL one-tap reason).
   POST = RFC 8058 one-click (what Gmail/Yahoo POST to). Flip, return 200.
          Must succeed with no further interaction — never gate it on a reason. */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }

async function unsubscribeByToken(sb, token) {
  const t = (token || "").trim()
  if (!t) return { ok: false, error: "no_token" }
  const { data: tok } = await sb.from("track_tokens").select("person_id").eq("token", t).maybeSingle()
  if (!tok || !tok.person_id) return { ok: false, error: "not_found" }
  await sb.from("people").update({
    email_consent: "unsubscribed",
    email_unsubscribed_at: new Date().toISOString(),
  }).eq("id", tok.person_id)
  return { ok: true, person_id: tok.person_id }
}

export async function GET(req) {
  const url = new URL(req.url)
  const token = url.searchParams.get("t") || ""
  const sb = serverClient()
  await unsubscribeByToken(sb, token) // best-effort; always land them on the friendly page
  const site = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"
  const dest = site + "/unsubscribe/?t=" + encodeURIComponent(token.trim())
  return Response.redirect(dest, 302)
}

export async function POST(req) {
  // One-click: the token is in the query string; the body is just
  // "List-Unsubscribe=One-Click". Read the token from the URL.
  const url = new URL(req.url)
  const token = url.searchParams.get("t") || ""
  const sb = serverClient()
  const r = await unsubscribeByToken(sb, token)
  return new Response(r.ok ? "unsubscribed" : "not found", {
    status: r.ok ? 200 : 404,
    headers: CORS,
  })
}
