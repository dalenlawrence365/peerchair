// API key check for GPT Action endpoints.
// Accepts both x-peerchair-action-key and Authorization: Bearer headers.
// FAIL-CLOSED: if PEERCHAIR_GPT_ACTION_KEY is not set, every request is rejected. There is no
// fallback key — this repository is public, so a key in code is a published key.
export function verifyGptActionKey(request) {
  const expected = process.env.PEERCHAIR_GPT_ACTION_KEY
  if (!expected) return false
  const keyHeader = request.headers.get("x-peerchair-action-key") || ""
  const authHeader = request.headers.get("authorization") || ""
  const bearerKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  return keyHeader === expected || bearerKey === expected
}
