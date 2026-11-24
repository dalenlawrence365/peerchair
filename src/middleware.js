import { NextResponse } from "next/server"
import { SESSION_COOKIE, verifySession, safeEqual } from "@/lib/session"

// Server-side gate for the whole app. DEFAULT-DENY: every page and API route requires a valid
// signed session cookie unless it is explicitly listed below. (Previously the "login" was a
// password compared in the browser and a localStorage flag; the API itself was open.)

// Pages that are public by design.
const PUBLIC_PAGE_PREFIXES = ["/share/", "/sponsor/"]   // asset share links; sponsor view (own per-event key)

// Endpoints that are called by outside systems and enforce their OWN credential in the route
// (webhook secret, signature, extension token, GPT action key) — keep these reachable.
const SELF_AUTH = [
  "/api/linkedhelper-webhook",          // ?secret=  (fail-closed)
  "/api/calendly-webhook",              // NOTE: does not verify Calendly's signature yet
  "/api/webhooks/resend",               // Svix signature (fail-closed)
  "/api/extension/",                    // x-extension-token (fail-closed)
  "/api/add-contact", "/api/add-note", "/api/calendar-availability", "/api/contact-context",
  "/api/email-body", "/api/inbox-summary", "/api/log-outreach", "/api/save-draft",   // GPT action key
]

// Intentionally public endpoints used by la-cfo.com and email links (token- or key-gated data only).
const PUBLIC_SITE = [
  "/api/events/register", "/api/events/subscribe", "/api/events/upcoming", "/api/events/ics",
  "/api/events/invite", "/api/track", "/api/unsubscribe", "/api/sponsor/roster",
]

// Auth endpoints.
const AUTH = ["/api/auth/login", "/api/auth/logout", "/api/auth/session"]

// Cron / server-to-server: allowed with a valid session OR `Authorization: Bearer <CRON_SECRET>`.
const CRON_BEARER = [
  "/api/auth/microsoft/refresh", "/api/sync-sent", "/api/sync-email", "/api/sync-calendar",
  "/api/scheduled-send", "/api/cron-health", "/api/sync-granola", "/api/provisors/poll-email",
  "/api/cron/cold-test-drip", "/api/events/send-invite", "/api/events/send-cold-invite",
  "/api/events/cold-test-status", "/api/campaigns/cold-test", "/api/health/run-job",
  "/api/setup-calendly-webhook", "/api/setup-calendly",
]

function matches(path, list) {
  return list.some(function (p) { return p.endsWith("/") ? path.startsWith(p) : (path === p || path.startsWith(p + "/")) })
}

function hasValidBearer(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const h = req.headers.get("authorization") || ""
  return h.startsWith("Bearer ") && safeEqual(h.slice(7), secret)
}

export async function middleware(req) {
  const path = req.nextUrl.pathname
  const method = req.method
  const isApi = path.startsWith("/api/")

  // Public pages (login screen + share pages)
  if (path === "/" || matches(path, PUBLIC_PAGE_PREFIXES)) return NextResponse.next()
  if (matches(path, AUTH) || matches(path, SELF_AUTH) || matches(path, PUBLIC_SITE)) return NextResponse.next()

  // Public share links resolve an asset by slug with GET only; list/upload stay private.
  if (/^\/api\/assets\/[^/]+$/.test(path) && (method === "GET" || method === "HEAD" || method === "OPTIONS")) return NextResponse.next()

  // Everything else needs a valid session, or (for cron paths only) the cron bearer.
  const token = req.cookies.get(SESSION_COOKIE)
  if (token && await verifySession(token.value)) return NextResponse.next()
  if (matches(path, CRON_BEARER) && hasValidBearer(req)) return NextResponse.next()

  if (isApi) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const url = req.nextUrl.clone()
  url.pathname = "/"
  url.search = ""
  return NextResponse.redirect(url)
}

export const config = {
  // Everything except Next internals and static image files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif)$).*)"],
}
