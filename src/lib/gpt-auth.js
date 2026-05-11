// API key middleware for GPT Action endpoints
// Accepts both x-peerchair-action-key and Authorization: Bearer headers
export function verifyGptActionKey(request) {
  const expected = process.env.PEERCHAIR_GPT_ACTION_KEY || "peerchair-gpt-dev-key"
  const keyHeader = request.headers.get("x-peerchair-action-key") || ""
  const authHeader = request.headers.get("authorization") || ""
  const bearerKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  return keyHeader === expected || bearerKey === expected
}
