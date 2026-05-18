export const dynamic = "force-dynamic"

const HR_KEY = process.env.HEYREACH_API_KEY || "UTXt46dJni1Wul3y3Ea5AVPLSOcYKRNKKsbUawBlUI4="
const HR_BASE = "https://api.heyreach.io/api/public"
const TEST_CONV = "2-N2E1MzMxNTQtMGJiMS00MTMxLWFkY2EtNDhjNDgwODQ3ZTQwXzEwMA=="
const TEST_ACCT = 185228

async function tryPost(path, body) {
  try {
    const res = await fetch(`${HR_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY },
      body: JSON.stringify(body)
    })
    const txt = await res.text()
    return { method: "POST", path, body, status: res.status, body_preview: txt.slice(0, 200) }
  } catch(e) { return { method: "POST", path, error: e.message } }
}

async function tryGet(path) {
  try {
    const res = await fetch(`${HR_BASE}${path}`, {
      method: "GET",
      headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY }
    })
    const txt = await res.text()
    return { method: "GET", path, status: res.status, body_preview: txt.slice(0, 200) }
  } catch(e) { return { method: "GET", path, error: e.message } }
}

export async function GET() {
  const encConv = encodeURIComponent(TEST_CONV)
  const tests = [
    // POST variants with different param shapes
    tryPost("/inbox/GetChatroom", { accountId: TEST_ACCT, conversationId: TEST_CONV }),
    tryPost("/inbox/Chatroom",    { linkedInAccountId: TEST_ACCT, conversationId: TEST_CONV }),
    tryPost("/inbox/Get",         { linkedInAccountId: TEST_ACCT, conversationId: TEST_CONV }),
    tryPost("/inbox/GetById",     { linkedInAccountId: TEST_ACCT, conversationId: TEST_CONV }),
    tryPost("/conversation/Get",  { linkedInAccountId: TEST_ACCT, conversationId: TEST_CONV }),
    tryPost("/conversation/GetById", { linkedInAccountId: TEST_ACCT, conversationId: TEST_CONV }),
    // GET variants
    tryGet(`/inbox/chatroom?linkedInAccountId=${TEST_ACCT}&conversationId=${encConv}`),
    tryGet(`/inbox/${TEST_ACCT}/${encConv}`),
    tryGet(`/inbox/conversation/${encConv}?linkedInAccountId=${TEST_ACCT}`),
    tryGet(`/conversation/${encConv}?linkedInAccountId=${TEST_ACCT}`),
    // Test endpoint to ensure the auth still works
    tryGet("/auth/CheckApiKey"),
  ]
  const results = await Promise.all(tests)
  return Response.json({ results })
}


