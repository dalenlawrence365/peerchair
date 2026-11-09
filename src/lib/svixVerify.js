import crypto from "crypto"

/* Svix-style webhook signature check (what Resend uses).
   signed content = "<svix-id>.<svix-timestamp>.<raw body>", HMAC-SHA256 with the
   base64 part of the "whsec_..." secret; header carries space-separated "v1,<base64>". */
export function verifySvix(secret, id, timestamp, rawBody, sigHeader, toleranceSec) {
  if (!secret || !id || !timestamp || !sigHeader) return false
  const tol = toleranceSec == null ? 300 : toleranceSec
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > tol) return false
  const key = Buffer.from(String(secret).replace(/^whsec_/, ""), "base64")
  const expected = crypto.createHmac("sha256", key).update(id + "." + timestamp + "." + rawBody).digest("base64")
  const eb = Buffer.from(expected)
  return String(sigHeader).split(" ").some(function (part) {
    const bits = part.split(",")
    if (bits[0] !== "v1" || !bits[1]) return false
    const sb = Buffer.from(bits[1])
    return sb.length === eb.length && crypto.timingSafeEqual(sb, eb)
  })
}
