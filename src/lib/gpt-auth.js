// API key middleware for GPT Action endpoints
export function verifyGptActionKey(request) {
  const authHeader = request.headers.get("authorization") || ""
  const keyHeader  = request.headers.get("x-peerchair-action-key") || ""
  const expected   = process.env.PEERCHAIR_GPT_ACTION_KEY || "peerchair-gpt-dev-key"

  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : keyHeader

  return provided === expected
}
