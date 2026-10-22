export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* Optional one-tap reason captured on the confirmation page AFTER the person is
   already unsubscribed. Purely optional — the unsubscribe never depends on it.
   Records the reason on the person (resolved via their track token) so it shows
   on their PeerChair profile ("unsubscribed — not relevant to me, <date>"). */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}
function json(b, s = 200) { return Response.json(b, { status: s, headers: CORS }) }
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }

const ALLOWED = new Set(["too_many", "not_relevant", "not_now", "never_signed_up"])

export async function POST(req) {
  let body = {}
  try { body = await req.json() } catch { return json({ error: "bad_request" }, 400) }
  const token = (body.t || "").trim()
  const reason = (body.reason || "").trim()
  if (!token || !ALLOWED.has(reason)) return json({ error: "invalid" }, 400)

  const sb = serverClient()
  const { data: tok } = await sb.from("track_tokens").select("person_id").eq("token", token).maybeSingle()
  if (!tok || !tok.person_id) return json({ error: "not_found" }, 404)

  await sb.from("people").update({ email_unsub_reason: reason }).eq("id", tok.person_id)
  return json({ ok: true })
}
