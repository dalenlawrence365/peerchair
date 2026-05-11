// CORS headers for ChatGPT Action endpoints
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-peerchair-action-key",
}

export function corsResponse(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init.headers || {}) }
  })
}

export function handleOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
