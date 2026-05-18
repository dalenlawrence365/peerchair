export const dynamic = "force-dynamic"

// Probes for the correct GetChatroom URL using Kirk Bardin's conversation
const HR_KEY = process.env.HEYREACH_API_KEY || "UTXt46dJni1Wul3y3Ea5AVPLSOcYKRNKKsbUawBlUI4="
const HR_BASE = "https://api.heyreach.io/api/public"
const TEST_CONV = "2-N2E1MzMxNTQtMGJiMS00MTMxLWFkY2EtNDhjNDgwODQ3ZTQwXzEwMA=="
const TEST_ACCT = 185228

const CANDIDATES = [
  "/inbox/GetChatroom",
  "/inbox/GetChatroomV2",
  "/inbox/GetConversationDetails",
  "/inbox/GetConversation",
  "/inbox/GetMessages",
  "/conversation/GetChatroom",
  "/v2/inbox/GetChatroom",
]

export async function GET() {
  const results = []
  for (const path of CANDIDATES) {
    try {
      const res = await fetch(`${HR_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": HR_KEY },
        body: JSON.stringify({ linkedInAccountId: TEST_ACCT, conversationId: TEST_CONV })
      })
      const body = await res.text()
      results.push({
        path,
        status: res.status,
        body_preview: body.slice(0, 250)
      })
    } catch(e) {
      results.push({ path, error: e.message })
    }
  }
  return Response.json({ results })
}

