export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* Public page-tracking beacon for la-cfo.com.
   Fired cross-origin from the static site via navigator.sendBeacon with a
   text/plain body (CORS-safelisted → no preflight, so the beacon actually
   sends — application/json would have been silently dropped cross-origin).
   The token only ATTRIBUTES a view to a person; it never grants access. */

const BOT_RE = /(bot|crawler|spider|crawl|slurp|facebookexternalhit|linkedinbot|whatsapp|telegram|slackbot|twitterbot|discordbot|redditbot|embedly|quora|pinterest|bitlybot|vkshare|preview|headless|phantom|puppeteer|playwright|python-requests|curl|wget|go-http-client|axios|okhttp|apache-httpclient|monitor|uptime|pingdom|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|applebot|googlebot|bingbot|yandex|baidu|duckduckbot)/i

function isBot(ua) { return !ua || BOT_RE.test(ua) }

// Device / browser / OS from the UA we already store. Deliberately coarse —
// enough to answer "is my brochure being read on a phone", not fingerprinting.
function parseUA(ua) {
  if (!ua) return { device_type: null, browser: null, os: null }
  const u = ua.toLowerCase()
  const tablet = /ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(u)
  const mobile = /mobile|iphone|ipod|android|blackberry|iemobile|opera mini/.test(u)
  const device_type = tablet ? "tablet" : (mobile ? "mobile" : "desktop")

  let browser = "other"
  if (/edg\//.test(u)) browser = "Edge"
  else if (/opr\/|opera/.test(u)) browser = "Opera"
  else if (/chrome|crios/.test(u)) browser = "Chrome"
  else if (/firefox|fxios/.test(u)) browser = "Firefox"
  else if (/safari/.test(u)) browser = "Safari"

  let os = "other"
  if (/iphone|ipad|ipod|ios/.test(u)) os = "iOS"
  else if (/android/.test(u)) os = "Android"
  else if (/mac os x|macintosh/.test(u)) os = "macOS"
  else if (/windows/.test(u)) os = "Windows"
  else if (/linux/.test(u)) os = "Linux"

  return { device_type: device_type, browser: browser, os: os }
}

function decodeHeader(v) {
  // Vercel percent-encodes non-ASCII city names (e.g. "S%C3%A3o%20Paulo")
  if (!v) return null
  try { return decodeURIComponent(v) } catch { return v }
}

function pageFromPath(path) {
  if (!path) return null
  // Ignore file:// paths — a local copy opened on disk fires the beacon against a
  // filesystem path (/Users/.../Claude/...). Not real site traffic.
  if (/Users\/|\/home\/|Application%20Support|\/Library\//i.test(path)) return null
  let p = path.split("?")[0].split("#")[0]
  p = p.replace(/\/index\.html?$/i, "")
  p = p.replace(/\/+$/, "")          // trailing slash
  p = p.replace(/^\/+/, "")          // leading slash -> "investment"
  if (p === "") return "home"
  p = p.replace(/^events\//i, "event:")     // events/august-11-workshop -> event:august-11-workshop
  p = p.toLowerCase().replace(/[^a-z0-9:_-]+/g, "-")  // collapse anything else (incl. remaining slashes) to hyphen
  p = p.replace(/^-+|-+$/g, "")
  return p.slice(0, 64) || "home"
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

  // Geo: free from the Vercel edge on every request. No IP is stored.
  const country = req.headers.get("x-vercel-ip-country") || null
  const region  = req.headers.get("x-vercel-ip-country-region") || null
  const city    = decodeHeader(req.headers.get("x-vercel-ip-city"))
  const dev     = parseUA(ua)

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
    referrer: referrer ? referrer.toString().slice(0, 300) : null,
    country: country,
    region: region,
    city: city ? city.slice(0, 80) : null,
    device_type: dev.device_type,
    browser: dev.browser,
    os: dev.os
  })

  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } })
}
