export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* Public page-tracking beacon for la-cfo.com.
   Fired cross-origin from the static site via navigator.sendBeacon with a
   text/plain body (CORS-safelisted → no preflight, so the beacon actually
   sends — application/json would have been silently dropped cross-origin).
   The token only ATTRIBUTES a view to a person; it never grants access. */

const BOT_RE = /(bot|crawler|spider|crawl|slurp|facebookexternalhit|linkedinbot|whatsapp|telegram|slackbot|twitterbot|discordbot|redditbot|embedly|quora|pinterest|bitlybot|vkshare|preview|headless|phantom|puppeteer|playwright|python-requests|curl|wget|go-http-client|axios|okhttp|apache-httpclient|monitor|uptime|pingdom|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|applebot|googlebot|bingbot|yandex|baidu|duckduckbot)/i

function isBot(ua) { return !ua || BOT_RE.test(ua) }

function pageFromPath(path) {
  if (!path) return null
  const p = (path.replace(/\/+$/, "") || "/")
  if (p === "/") return "home"
  if (p.startsWith("/overview")) return "overview"
  if (p.startsWith("/assessment")) return "assessment"
  if (p.startsWith("/meeting")) return "meeting"
  return p.slice(0, 64)
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  })
}

export async function POST(req) {
  let body = {}
  try {
    const raw = await req.text()
    if (raw) body = JSON.parse(raw)
  } catch { /* malformed → drop quietly, still 204 */ }

  const ua = req.headers.get("user-agent") || ""
  // body.ref is document.referrer read on the la-cfo.com page = the TRUE upstream
  // source (linkedin.com, google.com, ""). The HTTP Referer header on this beacon
  // request is always la-cfo.com itself (the page that fired it), so it must NOT
  // be used as the visitor's referrer. Header is kept only as a sanity/debug echo.
  const referrer = (body.ref != null ? String(body.ref) : "") || null
  const bot = isBot(ua)

  const token = (body.t || body.token || "").toString().trim() || null
  const event = (body.event || body.e || "view").toString().slice(0, 64)

  // src = CHANNEL tag from ?src= only. Reject legacy page-name values (la-*) that
  // older page scripts used to send as src, so channel numbers never blend with page ids.
  const srcRaw = (body.src || "").toString()
  const src = (srcRaw && /^[\w.\-:]{1,64}$/.test(srcRaw) && !/^la-/i.test(srcRaw)) ? srcRaw : null

  const page = pageFromPath((body.path || "").toString())
  const visitor = (body.v || body.visitor_id || "").toString().slice(0, 64) || null

  const sb = serverClient()

  let person_id = null
  if (token) {
    const { data } = await sb.from("track_tokens").select("person_id").eq("token", token).maybeSingle()
    if (data) person_id = data.person_id
  }

  await sb.from("page_events").insert({
    person_id,
    token,
    event,
    page,
    src,
    visitor_id: visitor,
    is_bot: bot,
    user_agent: ua.slice(0, 300),
    referrer: referrer ? referrer.toString().slice(0, 300) : null
  })

  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } })
}
