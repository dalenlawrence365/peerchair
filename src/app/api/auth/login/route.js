export const dynamic = "force-dynamic"
import { SESSION_COOKIE, SESSION_DAYS, createSession, safeEqual } from "@/lib/session"

// POST /api/auth/login { password } -> sets the signed, HttpOnly session cookie.
// The password lives only in the APP_PASSWORD environment variable (never in code).
export async function POST(request) {
  const expected = process.env.APP_PASSWORD
  if (!expected) return Response.json({ error: "login_not_configured" }, { status: 503 })

  let body
  try { body = await request.json() } catch (e) { return Response.json({ error: "bad_request" }, { status: 400 }) }

  if (!safeEqual(String(body.password || ""), expected)) {
    await new Promise(function (r) { setTimeout(r, 800) })   // slow down guessing
    return Response.json({ error: "incorrect" }, { status: 401 })
  }

  const token = await createSession()
  if (!token) return Response.json({ error: "login_not_configured" }, { status: 503 })
  const res = Response.json({ ok: true })
  res.headers.append("Set-Cookie",
    SESSION_COOKIE + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + (SESSION_DAYS * 86400))
  return res
}
