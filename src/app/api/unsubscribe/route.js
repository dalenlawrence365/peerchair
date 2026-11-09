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
   email_consent='subscribed' (or 'cold_test' for the cold-test route) AND
   email_suppressed IS NOT TRUE — so an opt-out auto-excludes them from every
   future send with no manual scrubbing.

   GET  = the visible link in the email body. It does NOT unsubscribe. Corporate
          mail scanners (Defender, Proofpoint, Mimecast) open every link in a
          message to check it, and a GET that flipped consent would silently
          unsubscribe people before they ever read the email (and inflate the
          unsubscribe rate). So GET shows a one-button confirm page.
   POST (form, confirm=1) = the human pressing that button. Flip, then 303 to the
          friendly confirmation page (which offers an OPTIONAL one-tap reason).
   POST (RFC 8058 one-click: body "List-Unsubscribe=One-Click") = what Gmail/Yahoo
          send when someone uses the mailbox's own Unsubscribe button. Flip, return
          200. Must succeed with no further interaction. */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }

const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"

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

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") }

function confirmPage(token) {
  const action = "/api/unsubscribe?t=" + encodeURIComponent(token)
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow"><title>Unsubscribe — CFO Circle Los Angeles</title></head>' +
    '<body style="margin:0;background:#121a3c;font-family:Arial,Helvetica,sans-serif;color:#e8ebf5;">' +
    '<div style="max-width:460px;margin:0 auto;padding:64px 24px;text-align:center;">' +
    '<img src="' + esc(SITE) + '/cfo-circle-logo-white.png" alt="CFO Circle · Los Angeles" height="40" style="height:40px;margin-bottom:36px;">' +
    '<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:26px;font-weight:bold;color:#ffffff;">Unsubscribe from invitations?</h1>' +
    '<p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#c5cce4;">One click and you’re off the list. No hard feelings.</p>' +
    '<form method="POST" action="' + esc(action) + '"><input type="hidden" name="confirm" value="1">' +
    '<button type="submit" style="background:#c39a4e;color:#121a3c;border:0;border-radius:3px;padding:15px 34px;font-size:16px;font-weight:bold;cursor:pointer;">Confirm unsubscribe</button></form>' +
    '<p style="margin:28px 0 0;font-size:13px;color:#9aa3c6;">Changed your mind? You can simply close this tab.</p>' +
    '</div></body></html>'
}

export async function GET(req) {
  const token = (new URL(req.url).searchParams.get("t") || "").trim()
  return new Response(confirmPage(token), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  })
}

export async function POST(req) {
  // Token is always in the query string; the body distinguishes a human confirm
  // from a mailbox's RFC 8058 one-click.
  const url = new URL(req.url)
  const token = url.searchParams.get("t") || ""
  let confirm = false
  try { confirm = new URLSearchParams(await req.text()).get("confirm") === "1" } catch (e) {}

  const sb = serverClient()
  const r = await unsubscribeByToken(sb, token)

  if (confirm) {
    // human pressed the button: land them on the friendly page regardless (best-effort flip)
    return Response.redirect(SITE + "/unsubscribe/?t=" + encodeURIComponent(token.trim()), 303)
  }
  return new Response(r.ok ? "unsubscribed" : "not found", {
    status: r.ok ? 200 : 404,
    headers: CORS,
  })
}
