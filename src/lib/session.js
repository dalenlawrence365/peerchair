// Signed session cookie for PeerChair's single user.
// Works in the Edge runtime (middleware) and in Node route handlers: Web Crypto only.
//
// Cookie value = base64url(JSON {exp}) + "." + base64url(HMAC-SHA256(payload)).
// The HMAC key is derived from SESSION_SECRET if set, otherwise from APP_PASSWORD, so a
// single env var (APP_PASSWORD) is enough, and changing the password signs everyone out.
// FAIL-CLOSED: with neither set, no session can be created or verified.

export const SESSION_COOKIE = "pc_session"
export const SESSION_DAYS = 30

const enc = new TextEncoder()

function toB64url(bytes) {
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
function fromB64url(str) {
  const b = str.replace(/-/g, "+").replace(/_/g, "/")
  return atob(b + "=".repeat((4 - (b.length % 4)) % 4))
}

// Constant-time string compare.
export function safeEqual(a, b) {
  a = String(a); b = String(b)
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

async function sign(data) {
  const secret = process.env.SESSION_SECRET || process.env.APP_PASSWORD
  if (!secret) return null
  const key = await crypto.subtle.importKey(
    "raw", enc.encode("peerchair-session-v1:" + secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  )
  return toB64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))))
}

export async function createSession() {
  const payload = toB64url(enc.encode(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 86400000 })))
  const sig = await sign(payload)
  return sig ? payload + "." + sig : null
}

export async function verifySession(token) {
  if (!token || typeof token !== "string") return false
  const parts = token.split(".")
  if (parts.length !== 2) return false
  const expected = await sign(parts[0])
  if (!expected || !safeEqual(parts[1], expected)) return false
  try {
    const { exp } = JSON.parse(fromB64url(parts[0]))
    return typeof exp === "number" && exp > Date.now()
  } catch (e) { return false }
}
