export const dynamic = "force-dynamic"
import { cookies } from "next/headers"
import { SESSION_COOKIE, verifySession } from "@/lib/session"

// GET /api/auth/session -> { ok: boolean }. Lets the login screen skip itself when already signed in.
export async function GET() {
  const c = cookies().get(SESSION_COOKIE)
  return Response.json({ ok: !!(c && await verifySession(c.value)) })
}
